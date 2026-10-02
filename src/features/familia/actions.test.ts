import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

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
    mailer: null as null | { send: (m: unknown) => Promise<void> },
    setFlash: vi.fn(async (_m: string) => {}),
    refresh: vi.fn(),
    revalidatePath: vi.fn(),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/env', () => ({ env: { siteUrl: 'https://iris.app' } }))
vi.mock('@/features/notificacoes/mailer', () => ({ getMailer: () => h.mailer }))
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
  h.mailer = null
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
    expect(rpcCalls).toEqual([{ fn: 'create_family_invite', args: undefined }])
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

  test('impasse ou erro inesperado: tentar de novo, sem dizer que o convite é inválido', async () => {
    const code = 'd'.repeat(32)
    rpcError('accept_family_invite', 'deadlock detected', '40P01')
    expect(await redirectOf(actions.acceptInvite(form({ code })))).toBe(`/convite/${code}?erro=1`)
    rpcError('accept_family_invite', 'fetch failed')
    expect(await redirectOf(actions.acceptInvite(form({ code })))).toBe(`/convite/${code}?erro=1`)
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
    rpcCalls = []
    expect(await redirectOf(actions.leaveFamily(form({})))).toBe('/familia')
    expect(rpcCalls).toEqual([{ fn: 'leave_family', args: undefined }])
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

const CODE = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
const EXPIRES = '2026-10-05T15:00:00Z'
const emailForm = (email: string) => form({ email })
const sentMail = () =>
  ((h.mailer?.send ?? vi.fn()) as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as { to: string; subject: string; text: string; html: string })
const NOTICE = 'Não conseguimos enviar o e-mail agora. Você pode enviar o link abaixo.'
const LIMIT = 'Você já enviou alguns convites hoje. Dá para enviar de novo amanhã, ou compartilhar o link.'
const BAD_EMAIL = 'Confira o e-mail. Parece que falta alguma coisa.'
const familyRows = { family_members: [{ family_id: 'f1', role: 'admin' }], families: [{ id: 'f1', name: 'Família Souza' }], profiles: [{ display_name: 'Camila' }] }

describe('inviteByEmail', () => {
  beforeEach(() => {
    h.mailer = { send: vi.fn(async () => {}) }
    rpcData('create_family_email_invite', [{ invite_code: CODE, invite_expires_at: EXPIRES }])
    queue(familyRows)
  })

  test('cria o convite pelo banco e envia o link por e-mail; nada do código nem do endereço em aviso ou log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    const state = await actions.inviteByEmail(idle, emailForm('  Jordan@Email.com '))
    expect(rpcCalls).toEqual([{ fn: 'create_family_email_invite', args: { p_email: 'jordan@email.com' } }])
    const [mail] = sentMail()
    expect(sentMail()).toHaveLength(1)
    expect(mail.to).toBe('jordan@email.com')
    expect(mail.subject).toBe('Você recebeu um convite na Íris')
    expect(mail.text).toContain(`https://iris.app/convite/${CODE}`)
    expect(mail.html).toContain(`https://iris.app/convite/${CODE}`)
    expect(mail.text).toContain('Camila')
    expect(mail.text).toContain('Família Souza')
    expect(state).toEqual({ status: 'sent', email: 'jordan@email.com', expiresOn: '2026-10-05' })
    expect(JSON.stringify(h.setFlash.mock.calls)).toBe('[]')
    const logged = JSON.stringify([log.mock.calls, warn.mock.calls, out.mock.calls])
    expect(logged).not.toContain(CODE)
    expect(logged).not.toContain('jordan')
    expect(h.revalidatePath).toHaveBeenCalledWith('/familia')
  })

  test('a família sai do banco pela participação da própria pessoa, nunca do formulário', async () => {
    const fd = emailForm('jordan@email.com')
    fd.set('familyId', 'outra-familia')
    await actions.inviteByEmail(idle, fd)
    expect(calls.find((c) => c.table === 'family_members')?.filters).toEqual({ 'eq:user_id': 'u1', 'is:left_at': null })
    expect(calls.find((c) => c.table === 'families')?.filters).toEqual({ 'eq:id': 'f1' })
    expect(calls.find((c) => c.table === 'profiles')?.filters).toEqual({ 'eq:id': 'u1' })
    expect(rpcCalls[0].args).toEqual({ p_email: 'jordan@email.com' })
  })

  test('sem nome de quem convida, o e-mail sai sem esse nome', async () => {
    queue({ ...familyRows, profiles: [{ display_name: null }] })
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toMatchObject({ status: 'sent' })
    expect(sentMail()[0].text).not.toContain('Camila')
  })

  test.each(['', '   ', 'sem-arroba', 'a@b', 'a b@c.dev', 'um@dois@tres.dev', `${'a'.repeat(250)}@x.dev`])(
    'e-mail que não serve (%j): mensagem da copy, nada é criado nem enviado',
    async (email) => {
      const state = await actions.inviteByEmail(idle, emailForm(email))
      expect(state).toEqual({ status: 'error', message: BAD_EMAIL })
      expect(rpcCalls).toEqual([])
      expect(sentMail()).toEqual([])
    },
  )

  test('sem o campo: mesma mensagem', async () => {
    expect(await actions.inviteByEmail(idle, new FormData())).toEqual({ status: 'error', message: BAD_EMAIL })
    expect(rpcCalls).toEqual([])
  })

  test('limite de convites: mensagem calma, sem enviar', async () => {
    rpcError('create_family_email_invite', 'Limite de convites.')
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual({ status: 'error', message: LIMIT })
    expect(sentMail()).toEqual([])
    expect(h.revalidatePath).not.toHaveBeenCalled()
  })

  test('família completa, quem não administra, e-mail recusado pelo banco', async () => {
    rpcError('create_family_email_invite', 'A família já está completa.')
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual({ status: 'error', message: 'A família já está completa.' })
    rpcError('create_family_email_invite', 'Só quem administra a família pode fazer isso.', '42501')
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual({ status: 'error', message: 'Só quem administra a família pode fazer isso.' })
    rpcError('create_family_email_invite', 'E-mail inválido.')
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual({ status: 'error', message: BAD_EMAIL })
    expect(sentMail()).toEqual([])
  })

  test('impasse no banco pede para tentar de novo; erro qualquer não mostra o erro do banco', async () => {
    rpcError('create_family_email_invite', 'deadlock detected', '40P01')
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual({ status: 'error', message: UNEXPECTED })
    rpcError('create_family_email_invite', 'connection reset jordan@email.com')
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual({ status: 'error', message: SAVE_FAILED })
  })

  test('resposta do banco sem código válido: erro, nada é enviado', async () => {
    rpcData('create_family_email_invite', [{ invite_code: 'curto', invite_expires_at: EXPIRES }])
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(sentMail()).toEqual([])
  })

  test('e-mail desligado ou com falha: o convite existe, e quem convida recebe o link para enviar por conta própria', async () => {
    const ready = { status: 'ready', link: `https://iris.app/convite/${CODE}`, expiresOn: '2026-10-05', notice: NOTICE }
    h.mailer = null
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual(ready)
    queue(familyRows)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.mailer = { send: vi.fn(async () => { throw new Error('smtp jordan@email.com') }) }
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual(ready)
    expect(log).not.toHaveBeenCalled()
    expect(h.revalidatePath).toHaveBeenCalledWith('/familia')
  })

  test('falha depois de o convite existir: o registro leva só o código do erro — nunca a mensagem, o endereço ou o código do convite', async () => {
    const ready = { status: 'ready', link: `https://iris.app/convite/${CODE}`, expiresOn: '2026-10-05', notice: NOTICE }
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const printed = () => spies.flatMap((s) => s.mock.calls)
    const failWith = (error: unknown) => { queue(familyRows); h.mailer = { send: vi.fn(async () => { throw error }) } }

    failWith(Object.assign(new Error(`550 rejected jordan@email.com ${CODE}`), { code: 'EENVELOPE', response: '550 jordan@email.com', rejected: ['jordan@email.com'] }))
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual(ready)
    expect(printed()).toEqual([['familia: convite por e-mail', 'EENVELOPE']])

    // Sem código, ou com um "código" que não tem cara de código: só a palavra fixa.
    for (const error of [
      new Error('smtp jordan@email.com'), Object.assign(new Error('x'), { code: 'jordan@email.com' }), Object.assign(new Error('x'), { code: CODE }),
      Object.assign(new Error('x'), { code: 'com espaço' }), Object.assign(new Error('x'), { code: 550 }), 'jordan@email.com', null,
    ]) {
      spies.forEach((s) => s.mockClear())
      failWith(error)
      expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toEqual(ready)
      expect(printed()).toEqual([['familia: convite por e-mail', 'erro']])
    }
    const all = JSON.stringify(spies.map((s) => s.mock.calls))
    expect(all).not.toContain('jordan')
    expect(all).not.toContain(CODE)
  })

  test('não consegui ler os nomes: o convite existe, então vem o link, não um erro', async () => {
    queue({ family_members: [{ family_id: 'f1', role: 'admin' }], families: [], profiles: [] })
    expect(await actions.inviteByEmail(idle, emailForm('jordan@email.com'))).toMatchObject({ status: 'ready', notice: NOTICE })
    expect(sentMail()).toEqual([])
  })

  // A Íris não diz se um endereço tem cadastro. Tudo o que a ação devolve, envia e consulta é igual para
  // dois endereços quaisquer, a não ser pelo próprio endereço digitado; e nada é consultado pelo endereço.
  test('a resposta de sucesso é a mesma, quem quer que seja o destinatário', async () => {
    const WITH = 'quem-tem-cadastro@email.com'
    const WITHOUT = 'ninguem@email.com'
    const run = async (email: string) => {
      calls = []
      rpcCalls = []
      queue(familyRows)
      h.mailer = { send: vi.fn(async () => {}) }
      h.revalidatePath.mockClear()
      const state = await actions.inviteByEmail(idle, emailForm(email))
      const byTable = [...calls].sort((x, y) => x.table.localeCompare(y.table))
      return { state, mail: sentMail(), calls: byTable, rpcCalls, flash: h.setFlash.mock.calls.length, revalidated: h.revalidatePath.mock.calls }
    }
    const a = await run(WITH)
    const b = await run(WITHOUT)

    // Trocado o endereço por um marcador, as duas execuções são idênticas: estado, e-mail enviado, consultas e chamadas.
    const masked = (x: unknown, email: string) => JSON.parse(JSON.stringify(x).split(email).join('<destinatário>'))
    expect(masked(a, WITH)).toEqual(masked(b, WITHOUT))
    expect(a.state).toEqual({ status: 'sent', email: WITH, expiresOn: '2026-10-05' })
    expect(b.state).toEqual({ status: 'sent', email: WITHOUT, expiresOn: '2026-10-05' })

    for (const [r, email] of [[a, WITH], [b, WITHOUT]] as const) {
      // O endereço aparece só em três lugares: no estado devolvido a quem digitou, no "para" do e-mail e na chamada que cria o convite.
      expect(r.mail).toHaveLength(1)
      expect(r.mail[0].to).toBe(email)
      expect(JSON.stringify({ ...r.mail[0], to: '' })).not.toContain(email)
      expect(r.rpcCalls).toEqual([{ fn: 'create_family_email_invite', args: { p_email: email } }])
      // Nenhuma leitura pelo endereço: só a participação, a família e o nome de quem convida, pelos ids de quem convida.
      expect(r.calls).toEqual([
        { table: 'families', filters: { 'eq:id': 'f1' } },
        { table: 'family_members', filters: { 'eq:user_id': 'u1', 'is:left_at': null } },
        { table: 'profiles', filters: { 'eq:id': 'u1' } },
      ])
      expect(JSON.stringify(r.calls)).not.toContain(email)
    }
    // O e-mail em si é o mesmo, palavra por palavra.
    expect({ ...a.mail[0], to: '' }).toEqual({ ...b.mail[0], to: '' })
  })

  test('o código da ação não procura cadastro pelo endereço (nem em auth.users, nem em profiles)', () => {
    const source = readFileSync('src/features/familia/actions.ts', 'utf8')
    expect(source).not.toMatch(/auth\.users|auth\.admin|listUsers|getUserByEmail|getUserById/)
    expect(source).not.toMatch(/\.(eq|ilike|like|in|match|or|filter)\(\s*['"`][^'"`]*email/i)
  })
})

describe('resendInvite', () => {
  beforeEach(() => {
    h.mailer = { send: vi.fn(async () => {}) }
    rpcData('create_family_email_invite', [{ invite_code: CODE, invite_expires_at: EXPIRES }])
  })

  test('lê o e-mail do convite pendente (só o administrador enxerga) e envia um convite novo', async () => {
    queue({ family_invites: [{ invited_email: 'jordan@email.com' }], ...familyRows })
    const state = await actions.resendInvite(idle, form({ id: UUID }))
    const read = calls.find((c) => c.table === 'family_invites')!
    expect(read.filters).toEqual({ 'eq:id': UUID, 'is:accepted_at': null, 'is:revoked_at': null })
    expect(rpcCalls).toEqual([{ fn: 'create_family_email_invite', args: { p_email: 'jordan@email.com' } }])
    expect(sentMail()[0].to).toBe('jordan@email.com')
    expect(state).toEqual({ status: 'sent', email: 'jordan@email.com', expiresOn: '2026-10-05' })
  })

  test('o limite vale também para reenviar', async () => {
    queue({ family_invites: [{ invited_email: 'jordan@email.com' }] })
    rpcError('create_family_email_invite', 'Limite de convites.')
    expect(await actions.resendInvite(idle, form({ id: UUID }))).toEqual({ status: 'error', message: LIMIT })
    expect(sentMail()).toEqual([])
  })

  test('convite que não existe mais, sem e-mail, e-mail estranho ou id estranho: nada é enviado', async () => {
    queue({ family_invites: [] })
    expect(await actions.resendInvite(idle, form({ id: UUID }))).toEqual({ status: 'error', message: SAVE_FAILED })
    queue({ family_invites: [{ invited_email: null }] })
    expect(await actions.resendInvite(idle, form({ id: UUID }))).toEqual({ status: 'error', message: SAVE_FAILED })
    queue({ family_invites: [{ invited_email: 'nao-e-email' }] })
    expect(await actions.resendInvite(idle, form({ id: UUID }))).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(await actions.resendInvite(idle, form({ id: 'abc' }))).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(await actions.resendInvite(idle, new FormData())).toEqual({ status: 'error', message: SAVE_FAILED })
    expect(rpcCalls).toEqual([])
    expect(sentMail()).toEqual([])
  })
})
