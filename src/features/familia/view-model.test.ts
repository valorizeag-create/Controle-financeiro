import { expect, test } from 'vitest'
import { buildFamiliaPage, buildFamilyBills, buildFamilyMonth, eventText, inviteView, sinceLabel } from './view-model'
import type { FamilyEventRow, FamilyExpenseRow, FamilyGoalRow, FamilyRole, MyFamily } from './types'

const NBSP = String.fromCharCode(0xa0)
const fam = (p: Partial<MyFamily> = {}): MyFamily => ({
  id: 'f1', name: 'Família Souza', meId: 'u1', role: 'admin', invites: [], events: [],
  members: [
    { userId: 'u2', role: 'member', displayName: 'Alex', joinedAt: '2026-08-10T12:00:00Z', leftAt: null },
    { userId: 'u1', role: 'admin', displayName: 'Camila', joinedAt: '2026-07-01T12:00:00Z', leftAt: null },
    { userId: 'u3', role: 'member', displayName: 'Jordan', joinedAt: '2026-08-01T12:00:00Z', leftAt: '2026-09-01T12:00:00Z' },
  ], ...p,
})

test('sem família: tela de criar', () => {
  expect(buildFamiliaPage({ family: null, today: '2026-09-28' })).toEqual({ kind: 'none' })
})

test('protótipo Familia: Você primeiro, quem saiu fica de fora, legendas', () => {
  const v = buildFamiliaPage({ family: fam(), today: '2026-09-28' })
  expect(v.kind === 'member' && v.members.map((m) => [m.label, m.caption])).toEqual([
    ['Você', 'Administra a família'],
    ['Alex', 'Membro desde agosto'],
  ])
  expect(v.kind === 'member' && [v.canInvite, v.leave]).toEqual([true, 'admin-with-others'])
})

test('convite pendente só para o administrador; sair conforme o papel (RN-25)', () => {
  const admin = buildFamiliaPage({ family: fam({ invites: [{ id: 'i1', expiresAt: '2026-10-05T02:00:00Z', invitedEmail: null }] }), today: '2026-09-28' })
  expect(admin.kind === 'member' && admin.invite).toEqual({ id: 'i1', caption: 'Convite pendente · vale até 4 de outubro', email: null })
  const member = buildFamiliaPage({ family: fam({ role: 'member', meId: 'u2', invites: [{ id: 'i1', expiresAt: '2026-10-05T02:00:00Z', invitedEmail: 'jordan@email.com' }] }), today: '2026-09-28' })
  expect(member.kind === 'member' && [member.isAdmin, member.invite, member.canInvite, member.leave]).toEqual([false, null, false, 'member'])
  const alone = buildFamiliaPage({ family: fam({ members: [fam().members[1]] }), today: '2026-09-28' })
  expect(alone.kind === 'member' && alone.leave).toBe('alone')
})

test('convite pendente enviado por e-mail mostra o e-mail e "Convite enviado · aguardando"', () => {
  const view = buildFamiliaPage({ family: fam({ invites: [{ id: 'i1', expiresAt: '2026-10-05T15:00:00Z', invitedEmail: 'jordan@email.com' }] }), today: '2026-09-28' })
  expect(view.kind === 'member' && view.invite).toEqual({ id: 'i1', caption: 'Convite enviado · aguardando', email: 'jordan@email.com' })
})

test('convite por link continua como antes, sem e-mail', () => {
  const view = buildFamiliaPage({ family: fam({ invites: [{ id: 'i1', expiresAt: '2026-10-05T15:00:00Z', invitedEmail: null }] }), today: '2026-09-28' })
  expect(view.kind === 'member' && view.invite).toMatchObject({ id: 'i1', email: null })
  expect(view.kind === 'member' && view.invite?.caption).toContain('Convite pendente')
})

test('família completa não convida', () => {
  const members = Array.from({ length: 10 }, (_, i) => ({ userId: `u${i + 1}`, role: (i === 0 ? 'admin' : 'member') as FamilyRole, displayName: `P${i}`, joinedAt: '2026-08-01T12:00:00Z', leftAt: null }))
  const v = buildFamiliaPage({ family: fam({ members }), today: '2026-09-28' })
  expect(v.kind === 'member' && v.canInvite).toBe(false)
})

test('avisos da família (RN-22d, RN-22e)', () => {
  const e = (p: Partial<FamilyEventRow>): FamilyEventRow => ({ id: 'e', kind: 'member_left', memberName: 'Alex', goalName: null, amountCents: null, createdAt: '', ...p })
  expect(eventText(e({ goalName: 'Reforma da cozinha', amountCents: 180000 }))).toBe(`Alex saiu da família, e R$${NBSP}1.800,00 da meta Reforma da cozinha voltaram para Alex.`)
  expect(eventText(e({}))).toBe('Alex saiu da família.')
  expect(eventText(e({ kind: 'member_deleted', memberName: null, goalName: 'Viagem' }))).toBe('Um membro saiu da família, e a meta Viagem foi atualizada.')
  expect(eventText(e({ kind: 'member_deleted', memberName: null }))).toBe('Um membro saiu da família.')
})

test('aviso de saída sem nome usa a frase anônima, nunca "voltaram para Um membro"', () => {
  const e = (p: Partial<FamilyEventRow>): FamilyEventRow => ({ id: 'e', kind: 'member_left', memberName: null, goalName: null, amountCents: null, createdAt: '', ...p })
  expect(eventText(e({ goalName: 'Reforma da cozinha', amountCents: 180000 }))).toBe('Um membro saiu da família, e a meta Reforma da cozinha foi atualizada.')
  expect(eventText(e({ goalName: 'Viagem' }))).toBe('Um membro saiu da família, e a meta Viagem foi atualizada.')
  expect(eventText(e({}))).toBe('Um membro saiu da família.')
  // Nome em branco conta como sem nome.
  expect(eventText(e({ memberName: '  ', goalName: 'Viagem', amountCents: 100 }))).toBe('Um membro saiu da família, e a meta Viagem foi atualizada.')
  for (const p of [{}, { goalName: 'Viagem' }, { goalName: 'Viagem', amountCents: 100 }, { memberName: '' }]) {
    expect(eventText(e(p))).not.toContain('para Um membro')
  }
})

test('membro desde: com o ano quando não é o ano de hoje', () => {
  expect(sinceLabel('2025-12-31T23:30:00Z', '2026-09-28')).toBe('dezembro de 2025')
  expect(sinceLabel('2026-01-01T02:00:00Z', '2026-09-28')).toBe('dezembro de 2025')
})

test('tela do convite (Review Focus 2)', () => {
  const code = 'a'.repeat(32)
  expect(inviteView({ code: '../x', signedIn: true, erro: undefined, preview: null })).toEqual({ kind: 'invalid' })
  expect(inviteView({ code, signedIn: false, erro: undefined, preview: null })).toEqual({
    kind: 'signed-out', signUpHref: `/criar-cadastro?next=%2Fconvite%2F${code}`, signInHref: `/entrar?next=%2Fconvite%2F${code}`,
  })
  expect(inviteView({ code, signedIn: true, erro: 'familia', preview: null })).toEqual({ kind: 'has-family' })
  expect(inviteView({ code, signedIn: true, erro: 'convite', preview: { familyName: 'X', invitedBy: null } })).toEqual({ kind: 'invalid' })
  expect(inviteView({ code, signedIn: true, erro: undefined, preview: null })).toEqual({ kind: 'invalid' })
  expect(inviteView({ code, signedIn: true, erro: undefined, preview: { familyName: 'Família Souza', invitedBy: 'Camila' } }))
    .toEqual({ kind: 'ready', code, familyName: 'Família Souza', invitedBy: 'Camila' })
  // erro passageiro e valor desconhecido: o convite continua disponível
  const ready = { kind: 'ready', code, familyName: 'F', invitedBy: null }
  expect(inviteView({ code, signedIn: true, erro: '1', preview: { familyName: 'F', invitedBy: null } })).toEqual(ready)
  expect(inviteView({ code, signedIn: true, erro: 'xyz', preview: { familyName: 'F', invitedBy: null } })).toEqual(ready)
})

// ---- Task 11: Seu mês da família e contas da família ----
const x = (p: Partial<FamilyExpenseRow>): FamilyExpenseRow => ({
  id: 'x', effectiveOn: '2026-09-28', amountCents: 0, categoryKey: 'mercado', categoryName: 'Mercado', note: null,
  authorId: 'u1', authorName: 'Camila', createdAt: '2026-09-28T12:00:00Z', canAdjust: false, ...p,
})

test('protótipo Mobile-Familia: total, pessoas, casa, últimos com quem registrou', () => {
  const v = buildFamilyMonth({
    month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: false, myMovements: [], goals: [], bills: [],
    expenses: [
      x({ id: 'a', amountCents: 31240, authorId: 'u2', authorName: 'Alex' }),
      x({ id: 'b', effectiveOn: '2026-09-27', amountCents: 8990, categoryKey: 'casa', categoryName: 'Casa' }),
      x({ id: 'c', effectiveOn: '2026-09-02', amountCents: 40000, authorId: null, authorName: null, categoryKey: null, categoryName: 'Pet' }),
    ],
  })
  expect(v.totalCents).toBe(80230)
  expect(v.byMember.map((m) => [m.label, m.cents])).toEqual([['Você', 8990], ['Ex-membro', 40000], ['Alex', 31240]])
  expect(v.recent.map((r) => [r.title, r.caption, r.href])).toEqual([
    ['Mercado', 'Hoje · por Alex', null],
    ['Casa', 'Ontem · por você', '/extrato/b'],
    ['Pet', '2 de setembro · por Ex-membro', null],
  ])
})

test('administrador abre o gasto de outra pessoa para ajustar (RN-21)', () => {
  const v = buildFamilyMonth({ month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: true, myMovements: [], goals: [], bills: [], expenses: [x({ id: 'a', authorId: 'u2', authorName: 'Alex', canAdjust: true }), x({ id: 'z', authorId: null, authorName: null, canAdjust: true })] })
  expect(v.recent.map((r) => r.href)).toEqual(['/familia/gastos/a', '/familia/gastos/z'])
})

test('administrador: sem link de ajuste onde o banco não deixa ajustar (parcela, pago com meta, de quem saiu)', () => {
  const v = buildFamilyMonth({
    month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: true, myMovements: [], goals: [], bills: [],
    expenses: [
      x({ id: 'ok', authorId: 'u2', authorName: 'Alex', canAdjust: true }),
      x({ id: 'parcela', effectiveOn: '2026-09-27', authorId: 'u2', authorName: 'Alex', canAdjust: false }),
      x({ id: 'saiu', effectiveOn: '2026-09-26', authorId: 'u3', authorName: 'Jordan', canAdjust: false }),
      // O próprio gasto continua abrindo no Extrato, com ou sem ajuste da família.
      x({ id: 'meu', effectiveOn: '2026-09-25', canAdjust: false }),
    ],
  })
  expect(v.recent.map((r) => [r.id, r.href])).toEqual([['ok', '/familia/gastos/ok'], ['parcela', null], ['saiu', null], ['meu', '/extrato/meu']])
})

test('membro nunca ganha link de ajuste, mesmo se a linha disser que pode', () => {
  const v = buildFamilyMonth({ month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: false, myMovements: [], goals: [], bills: [], expenses: [x({ id: 'a', authorId: 'u2', authorName: 'Alex', canAdjust: true })] })
  expect(v.recent.map((r) => r.href)).toEqual([null])
})

test('metas da família: total, quanto falta e só a minha parte (A4 B)', () => {
  const goal = { id: 'g1', name: 'Reforma da cozinha', targetCents: 1000000, deadline: null, status: 'active', usedOn: null, deletedOn: null, createdAt: '', familyId: 'f1', createdBy: 'u2', savedCents: 300000 } as FamilyGoalRow
  const v = buildFamilyMonth({
    month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: false, expenses: [], bills: [], goals: [goal],
    myMovements: [{ id: 'm', goalId: 'g1', kind: 'deposit', amountCents: 180000, occurredOn: '2026-09-01', transactionId: null, createdAt: '' }],
  })
  expect(v.goals).toEqual([{ id: 'g1', name: 'Reforma da cozinha', percent: 30, remainingCents: 700000, savedCents: 300000, targetCents: 1000000, myPartCents: 180000 }])
})

test('contas da família no Seu mês: só no mês atual, até 3, vencidas primeiro', () => {
  const bills = [
    { id: 'b1', name: 'Aluguel', amountCents: 180000, dueOn: '2026-10-03', authorId: 'u2' },
    { id: 'b2', name: 'Luz', amountCents: 20000, dueOn: '2026-09-20', authorId: 'u1' },
    { id: 'b3', name: 'Água', amountCents: 9000, dueOn: '2026-09-30', authorId: 'u1' },
    { id: 'b4', name: 'Gás', amountCents: 9000, dueOn: '2026-09-29', authorId: 'u1' },
  ]
  const now = buildFamilyMonth({ month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: false, expenses: [], goals: [], myMovements: [], bills })
  expect(now.bills.map((b) => b.id)).toEqual(['b2', 'b4', 'b3'])
  expect(now.bills.map((b) => b.due)).toEqual(['venceu em 20 de setembro', 'vence amanhã', 'vence em 2 dias'])
  expect(buildFamilyMonth({ month: '2026-08', today: '2026-09-28', meId: 'u1', isAdmin: false, expenses: [], goals: [], myMovements: [], bills }).bills).toEqual([])
})

test('só metas ativas, até 2, a de maior percentual primeiro; vazio quando não há gasto', () => {
  const g = (id: string, saved: number, status = 'active') =>
    ({ id, name: id, targetCents: 1000, deadline: null, status, usedOn: null, deletedOn: null, createdAt: '', familyId: 'f1', createdBy: null, savedCents: saved }) as FamilyGoalRow
  const v = buildFamilyMonth({ month: '2026-09', today: '2026-09-28', meId: 'u1', isAdmin: false, expenses: [], bills: [], myMovements: [], goals: [g('a', 100), g('b', 900), g('c', 500), g('d', 990, 'used')] })
  expect(v.goals.map((q) => q.id)).toEqual(['b', 'c'])
  expect(v.empty).toBe(true)
})

test('contas da família: vencidas, a pagar e quem pode alterar', () => {
  const v = buildFamilyBills({
    today: '2026-09-28', meId: 'u1', isAdmin: false,
    members: [{ userId: 'u2', role: 'admin', displayName: 'Alex', joinedAt: '', leftAt: null }],
    bills: [{ id: 'b1', name: 'Luz', amountCents: 1, dueOn: '2026-09-20', authorId: 'u2' }, { id: 'b2', name: 'Água', amountCents: 1, dueOn: '2026-09-30', authorId: 'u1' }],
    recurrences: [
      { id: 'r1', name: 'Aluguel', amountCents: 180000, frequency: 'monthly', dueDay: 5, dueMonth: null, authorId: 'u2' },
      { id: 'r2', name: 'Água', amountCents: 9000, frequency: 'monthly', dueDay: 30, dueMonth: null, authorId: 'u1' },
    ],
  })
  expect([v.overdue.map((b) => b.id), v.due.map((b) => b.id)]).toEqual([['b1'], ['b2']])
  expect(v.recurring.map((r) => [r.name, r.canManage])).toEqual([['Aluguel', false], ['Água', true]])
  expect(v.recurring[0].caption).toMatch(/ · criada por Alex$/)
  expect(v.overdue[0].author).toBe('Alex')
  expect(v.due[0].author).toBe('você')
})

test('administrador pode alterar qualquer conta que se repete', () => {
  const v = buildFamilyBills({
    today: '2026-09-28', meId: 'u1', isAdmin: true, members: [], bills: [],
    recurrences: [{ id: 'r1', name: 'Aluguel', amountCents: 1, frequency: 'monthly', dueDay: 5, dueMonth: null, authorId: 'u2' }],
  })
  expect(v.recurring[0].canManage).toBe(true)
  expect(v.recurring[0].caption).toBe('Todo mês · dia 5 · criada por Ex-membro')
})

test('nomes repetidos ganham a posição nos botões de remover e de tornar administrador; nomes únicos, não', () => {
  const m = (userId: string, displayName: string, joinedAt: string) => ({ userId, role: 'member' as const, displayName, joinedAt, leftAt: null })
  const family = fam({
    members: [
      { userId: 'u1', role: 'admin', displayName: 'Camila', joinedAt: '2026-07-01T12:00:00Z', leftAt: null },
      m('u2', 'Ana', '2026-08-01T12:00:00Z'),
      m('u3', 'Ana', '2026-08-02T12:00:00Z'),
      m('u4', 'Bruno', '2026-08-03T12:00:00Z'),
    ],
  })
  const view = buildFamiliaPage({ family, today: '2026-10-03' })
  const others = view.kind === 'member' ? view.members.filter((x) => !x.isMe) : []
  expect(others.map((x) => x.actionName)).toEqual(['Ana (1)', 'Ana (2)', 'Bruno'])
  expect(others.map((x) => x.label)).toEqual(['Ana', 'Ana', 'Bruno'])
})
