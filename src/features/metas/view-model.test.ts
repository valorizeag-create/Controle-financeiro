import { describe, expect, test } from 'vitest'
import type { GoalMovementRow, GoalRow } from './types'
import { buildGoalDetail, buildMetas, pickFeatured, summarizeGoal } from './view-model'

const NBSP = String.fromCharCode(0xa0)
const brl = (s: string) => `R$${NBSP}${s}`
const today = '2026-09-28'

const goal = (p: Partial<GoalRow> & Pick<GoalRow, 'id' | 'name'>): GoalRow => ({
  targetCents: 400000, deadline: null, status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z', ...p,
})
let seq = 0
const mv = (p: Partial<GoalMovementRow> & Pick<GoalMovementRow, 'goalId' | 'kind' | 'amountCents' | 'occurredOn'>): GoalMovementRow => ({
  id: `m${++seq}`, transactionId: null, createdAt: `${p.occurredOn}T12:00:00Z`, ...p,
})

const viagem = goal({ id: 'g1', name: 'Viagem para Salvador', deadline: '2027-03' })
const viagemMoves = [
  mv({ goalId: 'g1', kind: 'deposit', amountCents: 30000, occurredOn: '2026-09-19' }),
  mv({ goalId: 'g1', kind: 'withdraw', amountCents: 12000, occurredOn: '2026-08-02' }),
  mv({ goalId: 'g1', kind: 'deposit', amountCents: 230000, occurredOn: '2026-07-15' }),
]

describe('resumo de uma meta (RF-29)', () => {
  test('exemplo do protótipo: 62%, faltam R$ 1.520,00, até mar. 2027, cerca de R$ 254 por mês', () => {
    const s = summarizeGoal(viagem, viagemMoves, today)
    expect(s).toMatchObject({ balanceCents: 248000, percent: 62, remainingCents: 152000, complete: false })
    expect(s.remainingText).toBe(`Faltam ${brl('1.520,00')} para Viagem para Salvador.`)
    expect(s.shortRemaining).toBe(`Faltam ${brl('1.520,00')}`)
    expect(s.deadlineShort).toBe('até mar. 2027')
    expect(s.suggestion).toEqual({ untilLabel: 'março de 2027', perMonth: `${brl('254')} por mês` })
  })

  test('sem prazo; e meta completa não mostra quanto falta nem sugestão', () => {
    const reserva = goal({ id: 'g2', name: 'Reserva de emergência', targetCents: 1000000 })
    expect(summarizeGoal(reserva, [], today)).toMatchObject({ percent: 0, deadlineShort: 'sem prazo', suggestion: null })
    const full = summarizeGoal(viagem, [mv({ goalId: 'g1', kind: 'deposit', amountCents: 400000, occurredOn: today })], today)
    expect(full).toMatchObject({ complete: true, percent: 100, remainingText: null, shortRemaining: 'Meta completa', suggestion: null })
  })

  test('só conta os movimentos da própria meta', () => {
    expect(summarizeGoal(viagem, [...viagemMoves, mv({ goalId: 'g9', kind: 'deposit', amountCents: 999, occurredOn: today })], today).balanceCents).toBe(248000)
  })
})

describe('lista de metas', () => {
  test('guardado em metas, ativas, concluídas; excluídas não aparecem (Review Focus 3)', () => {
    const goals = [
      viagem,
      goal({ id: 'g2', name: 'Reserva de emergência', targetCents: 1000000, createdAt: '2026-08-01T12:00:00Z' }),
      goal({ id: 'g3', name: 'Computador novo', status: 'used', usedOn: '2026-07-20' }),
      goal({ id: 'g4', name: 'Bicicleta', status: 'used', usedOn: '2025-11-03' }),
      goal({ id: 'g5', name: 'Antiga', deletedOn: '2026-09-01' }),
    ]
    const movements = [
      ...viagemMoves,
      mv({ goalId: 'g3', kind: 'deposit', amountCents: 50000, occurredOn: '2026-06-01' }),
      mv({ goalId: 'g3', kind: 'use', amountCents: 32000, occurredOn: '2026-07-20', transactionId: 't1' }),
      mv({ goalId: 'g5', kind: 'deposit', amountCents: 7000, occurredOn: '2026-08-01' }),
      mv({ goalId: 'g5', kind: 'withdraw', amountCents: 7000, occurredOn: '2026-09-01' }),
    ]
    const v = buildMetas({ goals, movements, today })
    expect(v.totalCents).toBe(248000 + 18000)
    expect(v.active.map((s) => s.goal.name)).toEqual(['Viagem para Salvador', 'Reserva de emergência'])
    expect(v.concluded).toEqual([
      { id: 'g3', name: 'Computador novo', caption: 'Computador novo · usada em julho' },
      { id: 'g4', name: 'Bicicleta', caption: 'Bicicleta · usada em novembro de 2025' },
    ])
    expect(v.empty).toBe(false)
  })

  test('sem metas (ou só excluídas): vazio', () => {
    expect(buildMetas({ goals: [], movements: [], today }).empty).toBe(true)
    expect(buildMetas({ goals: [goal({ id: 'g5', name: 'Antiga', deletedOn: '2026-09-01' })], movements: [], today }).empty).toBe(true)
  })
})

describe('tela da meta', () => {
  test('ativa: histórico do protótipo, pode guardar, tirar e usar', () => {
    const v = buildGoalDetail({ goal: viagem, movements: viagemMoves, today })
    expect(v.state).toBe('active')
    expect(v.celebration).toBeNull()
    expect(v.balanceText).toBe(`Você tem ${brl('2.480,00')} guardados em Viagem para Salvador.`)
    expect([v.canDeposit, v.canWithdraw, v.canUse]).toEqual([true, true, true])
    expect(v.history.map((h) => [h.label, h.dateLabel, h.amountText, h.positive])).toEqual([
      ['Guardou', '19 de setembro', `+ ${brl('300,00')}`, true],
      ['Tirou', '2 de agosto', `− ${brl('120,00')}`, false],
      ['Guardou', '15 de julho', `+ ${brl('2.300,00')}`, true],
    ])
  })

  test('completa: comemoração da copy (RF-30)', () => {
    const v = buildGoalDetail({ goal: viagem, movements: [mv({ goalId: 'g1', kind: 'deposit', amountCents: 400000, occurredOn: today })], today })
    expect(v.state).toBe('complete')
    expect(v.celebration).toBe('Você chegou lá. Viagem para Salvador está completa.')
    expect(v.canUse).toBe(true)
  })

  test('usada com sobra: só dá para tirar; o uso aparece com o gasto', () => {
    const used = goal({ id: 'g3', name: 'Computador novo', status: 'used', usedOn: '2026-07-20' })
    const v = buildGoalDetail({
      goal: used,
      movements: [
        mv({ goalId: 'g3', kind: 'use', amountCents: 32000, occurredOn: '2026-07-20', transactionId: 't1' }),
        mv({ goalId: 'g3', kind: 'deposit', amountCents: 50000, occurredOn: '2025-12-30' }),
      ],
      today,
    })
    expect(v.state).toBe('used')
    expect(v.usedText).toBe('Usada em 20 de julho de 2026.')
    expect([v.canDeposit, v.canWithdraw, v.canUse]).toEqual([false, true, false])
    expect(v.history[0]).toMatchObject({ label: 'Usou', amountText: `− ${brl('320,00')}`, transactionId: 't1' })
    expect(v.history[1].dateLabel).toBe('30 de dezembro de 2025')
  })
})

test('meta em destaque: a ativa mais adiantada que ainda não chegou lá (decisão 70)', () => {
  const a = summarizeGoal(viagem, viagemMoves, today) // 62%
  const b = summarizeGoal(goal({ id: 'g2', name: 'Presente', targetCents: 10000 }), [mv({ goalId: 'g2', kind: 'deposit', amountCents: 10000, occurredOn: today })], today) // completa
  const c = summarizeGoal(goal({ id: 'g3', name: 'Curso', targetCents: 100000, deadline: '2026-12' }), [mv({ goalId: 'g3', kind: 'deposit', amountCents: 62000, occurredOn: today })], today) // 62%, prazo mais perto
  expect(pickFeatured([a, b, c])?.goal.id).toBe('g3')
  expect(pickFeatured([b])).toBeNull()
  expect(pickFeatured([])).toBeNull()
})
