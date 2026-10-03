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
    anonymous: false,
    endLocalSession: vi.fn(async (_s: unknown) => {}),
    hasPassword: true,
    stateless: null as unknown,
  }
})
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.supabase, requireUser: async () => {
    if (h.anonymous) throw new h.RedirectSignal('/entrar')
    return h.user
  },
}))
vi.mock('./queries', () => ({ loadSignIn: async () => ({ hasPassword: h.hasPassword, sessionRecent: true }) }))
vi.mock('@/lib/supabase/stateless', () => ({ createStatelessClient: () => h.stateless }))
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

let updateUser = vi.fn(async (_a: unknown) => ({ error: null as unknown }))
let rpcCalls: { fn: string; args: unknown }[] = []
let rpcQueue: Record<string, Result[]> = {}

function fake() {
  return {
    auth: { updateUser: (a: unknown) => updateUser(a) },
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
  h.hasPassword = true
  updateUser = vi.fn(async () => ({ error: null }))
  h.anonymous = false
  h.supabase = fake()
})

describe('deleteAccount', () => {
  test('sem sessão nenhuma função é chamada', async () => {
    h.anonymous = true
    await expect(actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).rejects.toMatchObject({ url: '/entrar' })
    expect(rpcCalls).toEqual([])
  })

  test.each([
    [{ code: '42501', message: 'Sessão necessária.' }],
    [{ code: '42501', message: 'permission denied for function delete_my_account' }],
    [{ code: 'PGRST301', message: 'JWT expired' }],
  ])('sessão que acabou no meio (%j): encerra neste aparelho e leva a /entrar', async (error) => {
    rpcQueue.delete_my_account = [{ data: null, error }]
    await expect(actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).rejects.toMatchObject({ url: '/entrar' })
    expect(h.endLocalSession).toHaveBeenCalledTimes(1)
  })

  test('resposta sem erro mas que não é verdadeiro/falso não é tratada como excluído', async () => {
    rpcQueue.delete_my_account = [{ data: null, error: null }]
    expect(await actions.deleteAccount(idle, form({ confirm: 'EXCLUIR' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
    expect(h.endLocalSession).not.toHaveBeenCalled()
  })

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

const SENT = { status: 'sent' }
const REAUTH_EMAIL = 'Por segurança, saia e entre de novo antes de trocar o e-mail.'
const recent = (value: boolean) => (rpcQueue.session_is_recent = [{ data: value, error: null }])

describe('requestEmailChange', () => {
  test('e-mail que não parece e-mail: erro no campo, nada é pedido', async () => {
    const state = await actions.requestEmailChange(idle, form({ email: 'sem-arroba' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { email: 'Confira o e-mail. Parece que falta alguma coisa.' }, values: { email: 'sem-arroba' } })
    expect(updateUser).not.toHaveBeenCalled()
  })

  test('o mesmo e-mail (maiúsculas não contam): nada é pedido', async () => {
    const state = await actions.requestEmailChange(idle, form({ email: 'ANA@teste.iris.dev' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { email: 'Esse já é o seu e-mail.' } })
    expect(updateUser).not.toHaveBeenCalled()
    expect(rpcCalls).toEqual([])
  })

  test('cadastro sem senha (entra com o Google): nada é pedido', async () => {
    h.hasPassword = false
    expect(await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
    expect(updateUser).not.toHaveBeenCalled()
  })

  test('entrada antiga: pede para sair e entrar de novo, e nada é pedido', async () => {
    recent(false)
    const state = await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))
    expect(state).toMatchObject({ status: 'error', message: REAUTH_EMAIL, code: 'reauth', values: { email: 'nova@teste.iris.dev' } })
    expect(updateUser).not.toHaveBeenCalled()
  })

  test('pedido aceito: só o e-mail vai para o Supabase Auth, e nada é escrito em log', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    recent(true)
    expect(await actions.requestEmailChange(idle, form({ email: ' Nova@teste.iris.dev ', user_id: 'outra' }))).toEqual(SENT)
    expect(updateUser).toHaveBeenCalledTimes(1)
    expect(updateUser).toHaveBeenCalledWith({ email: 'nova@teste.iris.dev' })
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    spies.forEach((spy) => spy.mockRestore())
  })

  test('erros e respostas neutras também não escrevem em log', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    for (const error of [{ status: 422, code: 'email_exists' }, { status: 0 }, { status: 429 }]) {
      recent(true)
      updateUser = vi.fn(async () => ({ error }))
      await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    spies.forEach((spy) => spy.mockRestore())
  })

  test.each([
    ['endereço de outro cadastro', { name: 'AuthApiError', code: 'email_exists', status: 422 }],
    ['endereço recusado pelo serviço', { code: 'email_address_invalid', status: 400 }],
  ])('mesma resposta para %s', async (_name, error) => {
    recent(true)
    updateUser = vi.fn(async () => ({ error }))
    expect(await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))).toEqual(SENT)
  })

  test.each([
    ['servidor', { name: 'AuthApiError', status: 500, code: 'unexpected_failure' }],
    ['rede (auth-js devolve status 0)', { name: 'AuthRetryableFetchError', status: 0 }],
    ['erro sem status', { message: 'algo' }],
    ['sessão vencida', { name: 'AuthApiError', status: 401 }],
    ['sem permissão', { name: 'AuthApiError', status: 403 }],
    ['limite de envio (nada foi enviado)', { code: 'over_email_send_rate_limit', status: 429 }],
    ['limite de pedidos', { code: 'over_request_rate_limit', status: 429 }],
    ['sessão ausente', { name: 'AuthSessionMissingError', status: 400 }],
  ])('falha de %s: aviso genérico (não depende do endereço)', async (_name, error) => {
    recent(true)
    updateUser = vi.fn(async () => ({ error }))
    expect(await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
  })

  test('exceção ao pedir: também o aviso genérico, sem lançar', async () => {
    recent(true)
    updateUser = vi.fn(async () => {
      throw new Error('boom')
    })
    expect(await actions.requestEmailChange(idle, form({ email: 'nova@teste.iris.dev' }))).toMatchObject({ status: 'error', message: UNEXPECTED })
  })
})

describe('confirmEmailChange', () => {
  const TOKEN = `pkce_${'a'.repeat(56)}`
  const confirmIdle = { status: 'idle' } as const
  let verifyOtp = vi.fn(async (_a: unknown) => ({ data: { session: null as unknown, user: null as unknown }, error: null as unknown }))
  beforeEach(() => {
    verifyOtp = vi.fn(async () => ({ data: { session: null, user: null }, error: null }))
    h.stateless = { auth: { verifyOtp: (a: unknown) => verifyOtp(a) } }
    h.supabase = {
      get auth(): never {
        throw new Error('a sessão do navegador não é usada')
      },
      rpc: () => {
        throw new Error('sem banco')
      },
    }
  })

  test('código fora do formato: nem consulta', async () => {
    for (const bad of ['', 'curto', '../x'.repeat(8)]) {
      expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: bad }))).toEqual({ status: 'invalid' })
    }
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  test('primeira confirmação: falta o outro endereço', async () => {
    expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).toEqual({ status: 'half' })
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email_change', token_hash: TOKEN })
  })

  test('segunda confirmação: e-mail alterado', async () => {
    verifyOtp = vi.fn(async () => ({ data: { session: { access_token: 'x' }, user: { id: 'u1' } }, error: null }))
    expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).toEqual({ status: 'done' })
  })

  test.each([
    ['vencido (otp_expired)', { name: 'AuthApiError', code: 'otp_expired', status: 403 }],
    ['inventado ou já usado (404)', { name: 'AuthApiError', status: 404 }],
    ['código recusado (422)', { name: 'AuthApiError', code: 'validation_failed', status: 422 }],
    ['pedido fora do formato (400)', { name: 'AuthApiError', code: 'validation_failed', status: 400 }],
  ])('link %s: a mesma resposta', async (_name, error) => {
    verifyOtp = vi.fn(async () => ({ data: { session: null, user: null }, error }))
    expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).toEqual({ status: 'invalid' })
  })

  test.each([
    ['rede (status 0)', { name: 'AuthRetryableFetchError', status: 0 }],
    ['servidor (500)', { name: 'AuthApiError', status: 500 }],
    ['indisponível (503)', { name: 'AuthRetryableFetchError', status: 503 }],
    ['limite de pedidos (429)', { name: 'AuthApiError', code: 'over_request_rate_limit', status: 429 }],
    ['erro sem status', { message: 'algo' }],
  ])('falha passageira, %s: erro genérico, o link continua valendo', async (_name, error) => {
    verifyOtp = vi.fn(async () => ({ data: { session: null, user: null }, error }))
    expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).toEqual({ status: 'error' })
  })

  test('exceção ao consultar: erro genérico, sem lançar', async () => {
    verifyOtp = vi.fn(async () => {
      throw new Error('fetch failed')
    })
    expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).toEqual({ status: 'error' })
  })

  test('segunda confirmação: a sessão que o serviço devolve é encerrada no cliente descartável', async () => {
    const signOut = vi.fn(async () => ({ error: null }))
    h.stateless = { auth: { verifyOtp: async () => ({ data: { session: { access_token: 'x' }, user: { id: 'u1' } }, error: null }), signOut } }
    expect(await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).toEqual({ status: 'done' })
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  test('o código do link e o e-mail novo nunca vão para o console, em nenhum caminho', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    for (const error of [null, { status: 0 }, { status: 403 }]) {
      verifyOtp = vi.fn(async () => ({ data: { session: null, user: null }, error }))
      await actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    spies.forEach((spy) => spy.mockRestore())
  })

  test('confirmar não usa a sessão do navegador (o beforeEach faz qualquer uso dela lançar)', async () => {
    await expect(actions.confirmEmailChange(confirmIdle, form({ token_hash: TOKEN }))).resolves.toEqual({ status: 'half' })
  })
})
