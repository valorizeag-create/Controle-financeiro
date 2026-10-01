import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), refresh: vi.fn(), revalidatePath: vi.fn() }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/env', () => ({ env: { siteUrl: 'https://iris.app' } }))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('@/lib/refresh', () => ({ refreshMoneyViews: h.refresh }))
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./actions')

const UUID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'
const idle = { status: 'idle' } as const

type Call = { table: string; filters: Record<string, unknown> }
let calls: Call[] = []
let rpcCalls: { fn: string; args: unknown }[] = []
let rpcResults: Record<string, { data?: unknown; error?: unknown }> = {}
let rows: Record<string, unknown[]> = {}

const rpcData = (fn: string, data: unknown) => (rpcResults[fn] = { data })
const rpcError = (fn: string, message: string, code?: string) => (rpcResults[fn] = { error: { message, code } })
const queue = (q: Record<string, unknown[]>) => (rows = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, [...v]])))

function fakeSupabase() {
  return {
    from: (table: string) => ({
      select: () => {
        const filters: Record<string, unknown> = {}
        const b = {
          eq(col: string, val: unknown) {
            filters[`eq:${col}`] = val
            return b
          },
          is(col: string, val: unknown) {
            filters[`is:${col}`] = val
            return b
          },
          maybeSingle: async () => {
            calls.push({ table, filters })
            return { data: rows[table]?.shift() ?? null, error: null }
          },
        }
        return b
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      const r = rpcResults[fn] ?? {}
      return { data: r.data ?? null, error: r.error ?? null }
    },
  }
}

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof h.RedirectSignal) return e.url
    throw e
  }
  throw new Error('esperava um redirecionamento')
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  calls = []
  rpcCalls = []
  rpcResults = {}
  rows = {}
  h.supabase = fakeSupabase()
  h.setFlash.mockClear()
  h.refresh.mockClear()
  h.revalidatePath.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('criar a família', () => {
  test('manda só o nome; sucesso vai para Família com aviso', async () => {
    expect(await redirectOf(actions.createFamily(idle, form({ name: ' Família  Souza ' })))).toBe('/familia')
    expect(rpcCalls).toEqual([{ fn: 'create_family', args: { p_name: 'Família Souza' } }])
    expect(h.setFlash).toHaveBeenCalledWith('Família criada.')
  })

  test('nome vazio fica no formulário; falha mantém o que foi digitado', async () => {
    expect(await actions.createFamily(idle, form({ name: '' }))).toMatchObject({ status: 'error', fieldErrors: { name: 'Falta o nome.' } })
    expect(rpcCalls).toEqual([])
    rpcError('create_family', 'boom')
    expect(await actions.createFamily(idle, form({ name: 'Casa' }))).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { name: 'Casa' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('quem já participa vai para Família; impasse no banco pede para tentar de novo', async () => {
    rpcError('create_family', 'Você já participa de uma família.')
    expect(await redirectOf(actions.createFamily(idle, form({ name: 'Casa' })))).toBe('/familia')
    rpcError('create_family', 'deadlock detected', '40P01')
    expect(await actions.createFamily(idle, form({ name: 'Casa' }))).toMatchObject({ status: 'error', message: UNEXPECTED, values: { name: 'Casa' } })
  })
})

describe('convite', () => {
  test('devolve o link e o último dia; nada do código em flash', async () => {
    rpcData('create_family_invite', [{ invite_code: 'A'.repeat(32), invite_expires_at: '2026-10-05T15:00:00Z' }])
    expect(await actions.createInvite({ status: 'idle' }, form({}))).toEqual({ status: 'ready', link: `https://iris.app/convite/${'A'.repeat(32)}`, expiresOn: '2026-10-05' })
    expect(h.setFlash).not.toHaveBeenCalled()
    expect(h.revalidatePath).toHaveBeenCalledWith('/familia')
    rpcError('create_family_invite', 'A família já está completa.')
    expect(await actions.createInvite({ status: 'idle' }, form({}))).toEqual({ status: 'error', message: 'A família já está completa.' })
  })

  test('outro erro, impasse e resposta estranha do banco: avisos calmos, sem link', async () => {
    rpcError('create_family_invite', 'Só quem administra a família pode fazer isso.')
    expect(await actions.createInvite({ status: 'idle' }, form({}))).toEqual({ status: 'error', message: SAVE_FAILED })
    rpcError('create_family_invite', 'deadlock detected', '40P01')
    expect(await actions.createInvite({ status: 'idle' }, form({}))).toEqual({ status: 'error', message: UNEXPECTED })
    rpcData('create_family_invite', [{ invite_code: 'curto', invite_expires_at: '2026-10-05T15:00:00Z' }])
    expect(await actions.createInvite({ status: 'idle' }, form({}))).toEqual({ status: 'error', message: SAVE_FAILED })
  })

  test('cancelar: id do convite, aviso e volta; id inválido não chega ao banco', async () => {
    expect(await redirectOf(actions.revokeInvite(form({ id: UUID })))).toBe('/familia')
    expect(rpcCalls).toEqual([{ fn: 'revoke_family_invite', args: { p_id: UUID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Convite cancelado.')
    rpcCalls = []
    expect(await redirectOf(actions.revokeInvite(form({ id: 'x' })))).toBe('/familia?erro=1')
    expect(rpcCalls).toEqual([])
    rpcError('revoke_family_invite', 'Convite não encontrado.')
    expect(await redirectOf(actions.revokeInvite(form({ id: UUID })))).toBe('/familia?erro=1')
  })
})

describe('aceitar o convite', () => {
  test('formato estranho nem chega ao banco; erros voltam ao convite sem revelar o motivo (Review Focus 2)', async () => {
    expect(await redirectOf(actions.acceptInvite(form({ code: '../inicio' })))).toBe('/familia')
    expect(rpcCalls).toEqual([])
    const code = 'b'.repeat(32)
    rpcError('accept_family_invite', 'Convite inválido.')
    expect(await redirectOf(actions.acceptInvite(form({ code })))).toBe(`/convite/${code}?erro=convite`)
    rpcError('accept_family_invite', 'A família já está completa.')
    expect(await redirectOf(actions.acceptInvite(form({ code })))).toBe(`/convite/${code}?erro=convite`)
    rpcError('accept_family_invite', 'Você já participa de uma família.')
    expect(await redirectOf(actions.acceptInvite(form({ code })))).toBe(`/convite/${code}?erro=familia`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('nome da família vem do banco, filtrado pela família aceita; o código nunca vai para o aviso', async () => {
    const code = 'c'.repeat(32)
    rpcData('accept_family_invite', 'f1')
    queue({ families: [{ name: 'Família Souza' }] })
    expect(await redirectOf(actions.acceptInvite(form({ code })))).toBe('/familia')
    expect(rpcCalls).toEqual([{ fn: 'accept_family_invite', args: { p_code: code } }])
    expect(calls.find((c) => c.table === 'families')?.filters).toEqual({ 'eq:id': 'f1' })
    expect(h.setFlash).toHaveBeenCalledWith('Você entrou na família Família Souza.')
    expect(JSON.stringify(h.setFlash.mock.calls)).not.toContain(code)
  })
})

describe('sair da família', () => {
  test('administrador com outras pessoas volta com o aviso; sucesso avisa', async () => {
    rpcError('leave_family', 'Escolha quem vai administrar a família antes de sair.')
    expect(await redirectOf(actions.leaveFamily(form({})))).toBe('/familia?erro=admin')
    rpcError('leave_family', 'boom')
    expect(await redirectOf(actions.leaveFamily(form({})))).toBe('/familia?erro=1')
    expect(h.setFlash).not.toHaveBeenCalled()
    rpcData('leave_family', null)
    expect(await redirectOf(actions.leaveFamily(form({})))).toBe('/familia')
    expect(h.setFlash).toHaveBeenCalledWith('Você saiu da família.')
  })
})

describe('remover e passar a administração', () => {
  test('o nome vem do banco, filtrado pela minha família e pela pessoa ativa', async () => {
    queue({ family_members: [{ family_id: 'f1' }, { display_name: 'Alex' }] })
    expect(await redirectOf(actions.removeMember(form({ userId: UUID, name: 'Outro nome' })))).toBe('/familia')
    expect(calls.filter((c) => c.table === 'family_members').map((c) => c.filters)).toEqual([
      { 'eq:user_id': 'u1', 'is:left_at': null },
      { 'eq:family_id': 'f1', 'eq:user_id': UUID, 'is:left_at': null },
    ])
    expect(rpcCalls.at(-1)).toEqual({ fn: 'remove_family_member', args: { p_user: UUID } })
    expect(h.setFlash).toHaveBeenCalledWith('Alex saiu da família.')
  })

  test('transferir: avisa quem administra agora; id que não é uuid não chega ao banco', async () => {
    queue({ family_members: [{ family_id: 'f1' }, { display_name: 'Alex' }] })
    expect(await redirectOf(actions.transferAdmin(form({ userId: UUID })))).toBe('/familia')
    expect(rpcCalls).toEqual([{ fn: 'transfer_family_admin', args: { p_user: UUID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alex agora administra a família.')
    rpcCalls = []
    expect(await redirectOf(actions.transferAdmin(form({ userId: 'nao-e-uuid' })))).toBe('/familia?erro=1')
    expect(rpcCalls).toEqual([])
  })

  test('pessoa que não está na minha família ou erro do banco: aviso de erro, sem aviso de sucesso', async () => {
    queue({ family_members: [{ family_id: 'f1' }] })
    expect(await redirectOf(actions.removeMember(form({ userId: UUID })))).toBe('/familia?erro=1')
    expect(rpcCalls).toEqual([])
    queue({ family_members: [{ family_id: 'f1' }, { display_name: 'Alex' }] })
    rpcError('remove_family_member', 'Só quem administra a família pode fazer isso.')
    expect(await redirectOf(actions.removeMember(form({ userId: UUID })))).toBe('/familia?erro=1')
    queue({})
    expect(await redirectOf(actions.removeMember(form({ userId: UUID })))).toBe('/familia?erro=1')
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})
