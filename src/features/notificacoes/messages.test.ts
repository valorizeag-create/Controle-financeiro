import { describe, expect, test } from 'vitest'
import { isAllowedTarget, NOTIFICATION_KINDS } from '@/domain/notifications'
import { notificationMessage, PUSH_TITLE } from './messages'

const NBSP = String.fromCharCode(0xa0)
const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

const SAMPLES = {
  bill_tomorrow: { name: 'Luz', id: ID, due_on: '2026-10-02', family: false },
  bill_today: { name: 'Luz', id: ID, due_on: '2026-10-01', family: false },
  income_today: { name: 'Salário', id: ID, due_on: '2026-10-01', family: false },
  budget_near: { name: 'Mercado' },
  goal_near: { name: 'Viagem', id: ID, remaining_cents: 40000 },
  month_summary: { month: '2026-09' },
  daily_reminder: {},
  comeback: {},
  family_event: { event_kind: 'member_left', member_name: 'Alex', goal_name: 'Viagem', amount_cents: 30000 },
} as const

describe('notificationMessage', () => {
  test('título fixo', () => expect(PUSH_TITLE).toBe('Íris'))

  test('conta que vence amanhã: frase da copy, abre Contas com a confirmação, tem o botão de pagar', () => {
    expect(notificationMessage('bill_tomorrow', SAMPLES.bill_tomorrow)).toEqual({
      body: 'Luz vence amanhã. Quer marcar como paga?', url: `/contas?mes=2026-10&pagar=${ID}`, tag: `bill-${ID}`, pay: true,
    })
  })
  test('conta de hoje', () => {
    expect(notificationMessage('bill_today', SAMPLES.bill_today)).toEqual({
      body: 'Hoje é o dia de Luz.', url: `/contas?mes=2026-10&pagar=${ID}`, tag: `bill-${ID}`, pay: true,
    })
  })
  test('conta da família abre Família → Contas', () => {
    expect(notificationMessage('bill_today', { ...SAMPLES.bill_today, family: true })?.url).toBe(`/familia/contas?pagar=${ID}`)
  })
  test('entrada a receber abre Contas no mês, sem botão de pagar', () => {
    expect(notificationMessage('income_today', SAMPLES.income_today)).toEqual({
      body: 'Hoje é o dia de receber Salário.', url: '/contas?mes=2026-10', tag: `income-${ID}`, pay: false,
    })
  })
  test('planejado, meta, resumo, lembrete e retomada usam a copy', () => {
    expect(notificationMessage('budget_near', SAMPLES.budget_near)).toMatchObject({ body: 'Você já usou boa parte do que planejou para Mercado.', url: '/planejamento', pay: false })
    expect(notificationMessage('goal_near', SAMPLES.goal_near)).toMatchObject({ body: `Faltam só R$${NBSP}400,00 para Viagem.`, url: `/metas/${ID}` })
    expect(notificationMessage('month_summary', SAMPLES.month_summary)).toMatchObject({ body: 'Seu mês de setembro está fechado. Quer ver como foi?', url: '/relatorios?periodo=mes-passado' })
    expect(notificationMessage('daily_reminder', SAMPLES.daily_reminder)).toMatchObject({ body: 'Teve algum gasto hoje? Leva só alguns segundos.', url: '/anotar' })
    expect(notificationMessage('comeback', SAMPLES.comeback)).toMatchObject({ body: 'Seu mês continua aqui. Quer atualizar?', url: '/inicio' })
  })
  test('avisos da família usam as frases da decisão 108', () => {
    expect(notificationMessage('family_event', SAMPLES.family_event)).toMatchObject({
      body: `Alex saiu da família, e R$${NBSP}300,00 da meta Viagem voltaram para Alex.`, url: '/familia',
    })
    expect(notificationMessage('family_event', { event_kind: 'member_deleted', member_name: null, goal_name: null, amount_cents: null })?.body)
      .toBe('Um membro saiu da família.')
  })
  test('nomes longos nos avisos da família são cortados em 60 caracteres', () => {
    const m = notificationMessage('family_event', {
      event_kind: 'member_left', member_name: 'a'.repeat(500), goal_name: `  ${'m'.repeat(61)}  `, amount_cents: 100,
    })
    const person = `${'a'.repeat(59)}…`
    expect(m?.body).toBe(`${person} saiu da família, e R$${NBSP}1,00 da meta ${'m'.repeat(59)}… voltaram para ${person}.`)
    expect(notificationMessage('family_event', { ...SAMPLES.family_event, member_name: 'a'.repeat(60) })?.body).toContain('a'.repeat(60))
  })
  test('todo aviso: destino da lista fixa, sem exclamação, sem "baix"', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const m = notificationMessage(kind, SAMPLES[kind])
      expect(m, kind).not.toBeNull()
      expect(isAllowedTarget(m!.url), kind).toBe(true)
      expect(m!.body).not.toContain('!')
      expect(m!.body.toLowerCase()).not.toContain('baix')
    }
  })
  test('dados que não servem: nada (nunca lança)', () => {
    expect(notificationMessage('bill_today', { name: '', id: ID, due_on: '2026-10-01', family: false })).toBeNull()
    expect(notificationMessage('bill_today', { name: 'Luz', id: 'x', due_on: '2026-10-01', family: false })).toBeNull()
    expect(notificationMessage('bill_today', null)).toBeNull()
    expect(notificationMessage('goal_near', { name: 'Viagem', id: ID, remaining_cents: 0 })).toBeNull()
    expect(notificationMessage('goal_near', { name: 'Viagem', id: ID, remaining_cents: 1.5 })).toBeNull()
    expect(notificationMessage('month_summary', { month: '2026-13' })).toBeNull()
    expect(notificationMessage('family_event', { event_kind: 'outro' })).toBeNull()
  })
  test('destino nunca vem dos dados: id e data hostis são recusados', () => {
    expect(notificationMessage('bill_today', { name: 'Luz', id: `${ID}&x=//evil.com`, due_on: '2026-10-01', family: false })).toBeNull()
    expect(notificationMessage('bill_today', { name: 'Luz', id: ID, due_on: '2026-10-01&x=1', family: false })).toBeNull()
    expect(notificationMessage('goal_near', { name: 'Viagem', id: '../entrar', remaining_cents: 100 })).toBeNull()
  })
  test('o texto só carrega o que veio nos campos do aviso (sem e-mail nem cartão)', () => {
    const m = notificationMessage('family_event', { ...SAMPLES.family_event, email: 'a@b.com', card: 'Nubank' })
    expect(m?.body).not.toMatch(/@|Nubank/)
  })
})
