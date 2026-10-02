import { beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return {
    RedirectSignal,
    supabase: null as unknown,
    user: { id: 'u1', email: 'ana@teste.iris.dev' },
    endLocalSession: vi.fn(async (_s: unknown) => {}),
  }
})
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.supabase, requireUser: async () => h.user }))
vi.mock('./session', () => ({ endLocalSession: h.endLocalSession }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./actions')

const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'
const REAUTH_DELETE = 'Por segurança, saia e entre de novo antes de excluir o cadastro.'
const HINT = 'Digite EXCLUIR para confirmar.'
const idle = { status: 'idle' } as const
type Result = { data?: unknown; error?: { message?: string; code?: string; status?: number } | null }

let rpcCalls: { fn: string; args: unknown }[] = []
let rpcQueue: Record<string, Result[]> = {}

function fake() {
  return {
    rpc: async (fn: string, args?: unknown) => {
      rpcCalls.push({ fn, args })
      return rpcQueue[fn]?.shift() ?? { data: null, error: { message: `sem resposta para ${fn}` } }
    },
  }
}
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const calls = (fn: string) => rpcCalls.filter((c) => c.fn === fn)

beforeEach(() => {
  rpcCalls = []
  rpcQueue = {}
  h.endLocalSession.mockClear()
  h.supabase = fake()
})

describe('deleteAccount', () => {
  test.each(['', 'excluir', 'Excluir', 'EXCLUIR!', 'sim'])('sem a palavra EXCLUIR nada é chamado: %j', async (typed) => {
    const state = await actions.deleteAccount(idle, form({ confirm: typed }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { confirm: HINT } })
    expect(rpcCalls).toEqual([])
    expect(h.endLocalSession).not.toHaveBeenCalled()
  })

  test('com EXCLUIR: chama a função sem nenhum parâmetro, encerra a sessão e leva à página pública', async () => {
    rpcQueue.delete_my_account = [{ data: true, error: null }]
    await expect(actions.deleteAccount(idle, form({ confirm: ' EXCLUIR ' }))).rejects.toMatchObject({ url: '/cadastro-excluido' })
    expect(rpcCalls).toEqual([{ fn: 'delete_my_account', args: undefined }])
    expect(h.endLocalSession).toHaveBeenCalledTimes(1)
  })

  test('nenhum campo do formulário vira parâmetro (não dá para apontar para outra pessoa)', async () => {
    rpcQueue.delete_my_account = [{ data: true, error: null }]
    await expect(actions.deleteAccount(idle, form({ confirm: 'EXCLUIR', user_id: 'outra', p_user: 'outra', id: 'outra' }))).rejects.toBeInstanceOf(h.RedirectSignal)
    expect(rpcCalls).toEqual([{ fn: 'delete_my_account', args: undefined }])
  })

  test('40P01 uma vez: tenta de novo e segue', async () => {
    rpcQueue.delete_my_account = [{ data: null, error: { code: '40P01', message: 'deadlock detected' } }, { data: true, error: null }]
    await expect(actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).rejects.toMatchObject({ url: '/cadastro-excluido' })
    expect(calls('delete_my_account')).toHaveLength(2)
  })

  test('40P01 duas vezes: para, com o aviso calmo; a sessão continua', async () => {
    const deadlock = { data: null, error: { code: '40P01', message: 'deadlock detected' } }
    rpcQueue.delete_my_account = [deadlock, deadlock, { data: true, error: null }]
    expect(await actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
    expect(calls('delete_my_account')).toHaveLength(2)
    expect(h.endLocalSession).not.toHaveBeenCalled()
  })

  test('outro erro não é repetido', async () => {
    rpcQueue.delete_my_account = [{ data: null, error: { code: '57014', message: 'timeout' } }, { data: true, error: null }]
    expect(await actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
    expect(calls('delete_my_account')).toHaveLength(1)
  })

  test('entrada antiga: pede para sair e entrar de novo', async () => {
    rpcQueue.delete_my_account = [{ data: null, error: { code: '42501', message: 'Entrada recente necessária.' } }]
    const state = await actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))
    expect(state).toMatchObject({ status: 'error', message: REAUTH_DELETE, code: 'reauth' })
    expect(h.endLocalSession).not.toHaveBeenCalled()
  })

  test('já excluído (toque duplo, outra aba): encerra a sessão e segue, sem erro', async () => {
    rpcQueue.delete_my_account = [{ data: false, error: null }]
    await expect(actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).rejects.toMatchObject({ url: '/cadastro-excluido' })
    expect(h.endLocalSession).toHaveBeenCalledTimes(1)
  })
})
