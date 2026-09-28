import { describe, expect, test } from 'vitest'
import { MAX_GOAL_NAME, crossedMilestone, goalBalance, goalProgress, monthlySuggestion, splitGoalUse } from './goals'
import { formatWholeBRL } from './money'
import { summarizeMonth, type GoalMovement, type LedgerTx } from './summary'

const NBSP = String.fromCharCode(0xa0)

describe('guardado de uma meta', () => {
  test('guardar soma; tirar, usar e devolver na saída subtraem', () => {
    expect(
      goalBalance([
        { kind: 'deposit', amountCents: 230000 },
        { kind: 'deposit', amountCents: 30000 },
        { kind: 'withdraw', amountCents: 12000 },
        { kind: 'use', amountCents: 5000 },
        { kind: 'return_on_exit', amountCents: 1000 },
      ]),
    ).toBe(242000)
    expect(goalBalance([])).toBe(0)
  })

  test('nome da meta vai até 40 caracteres', () => {
    expect(MAX_GOAL_NAME).toBe(40)
  })
})

describe('progresso (RF-29)', () => {
  test('exemplo do protótipo: R$ 2.480 de R$ 4.000 = 62%, faltam R$ 1.520', () => {
    expect(goalProgress(248000, 400000)).toEqual({ percent: 62, remainingCents: 152000, complete: false })
  })

  test('arredonda para baixo e para em 100%; passar do valor também é completa', () => {
    expect(goalProgress(399999, 400000)).toEqual({ percent: 99, remainingCents: 1, complete: false })
    expect(goalProgress(400000, 400000)).toEqual({ percent: 100, remainingCents: 0, complete: true })
    expect(goalProgress(500000, 400000)).toEqual({ percent: 100, remainingCents: 0, complete: true })
    expect(goalProgress(0, 1000000)).toEqual({ percent: 0, remainingCents: 1000000, complete: false })
  })
})

describe('quanto guardar por mês (RF-29)', () => {
  test('protótipo: faltam R$ 1.520 até março de 2027, em setembro de 2026 → cerca de R$ 254 por mês', () => {
    const s = monthlySuggestion({ remainingCents: 152000, deadline: '2027-03', today: '2026-09-28' })
    expect(s).toBe(25400)
    expect(formatWholeBRL(s!)).toBe(`R$${NBSP}254`)
  })

  test('prazo neste mês: tudo o que falta, em reais inteiros para cima', () => {
    expect(monthlySuggestion({ remainingCents: 10050, deadline: '2026-09', today: '2026-09-28' })).toBe(10100)
  })

  test('sem prazo, prazo que já passou ou nada faltando: sem sugestão', () => {
    expect(monthlySuggestion({ remainingCents: 152000, deadline: null, today: '2026-09-28' })).toBeNull()
    expect(monthlySuggestion({ remainingCents: 152000, deadline: '2026-08', today: '2026-09-28' })).toBeNull()
    expect(monthlySuggestion({ remainingCents: 0, deadline: '2027-03', today: '2026-09-28' })).toBeNull()
  })
})

describe('usar o dinheiro da meta (RN-15)', () => {
  test('gasto maior: a meta paga o que tem, a diferença sai do mês (RN-15a)', () => {
    expect(splitGoalUse(340000, 300000)).toEqual({ fundedCents: 300000, fromMonthCents: 40000, leftoverCents: 0 })
  })

  test('gasto igual: a meta paga tudo e zera', () => {
    expect(splitGoalUse(300000, 300000)).toEqual({ fundedCents: 300000, fromMonthCents: 0, leftoverCents: 0 })
  })

  test('gasto menor: a sobra fica na meta — protótipo "Sobraram R$ 180,00" (RN-15b)', () => {
    expect(splitGoalUse(230000, 248000)).toEqual({ fundedCents: 230000, fromMonthCents: 0, leftoverCents: 18000 })
  })
})

describe('marcos da meta (RF-30)', () => {
  test('metade do caminho e meta completa, uma vez só', () => {
    expect(crossedMilestone(100000, 200000, 400000)).toBe('half')
    expect(crossedMilestone(190000, 400000, 400000)).toBe('complete')
    expect(crossedMilestone(100000, 450000, 400000)).toBe('complete')
    expect(crossedMilestone(250000, 300000, 400000)).toBeNull()
    expect(crossedMilestone(400000, 410000, 400000)).toBeNull()
    expect(crossedMilestone(0, 199999, 400000)).toBeNull()
  })
})

describe('os números do mês com metas (RNF-11)', () => {
  const tx = (p: Partial<LedgerTx>): LedgerTx => ({
    kind: 'expense', amountCents: 0, occurredOn: '2026-09-01', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, ...p,
  })

  test('guardar em agosto e usar em setembro: o gasto nunca sai duas vezes (Review Focus 2)', () => {
    const split = splitGoalUse(340000, 300000)
    const transactions: LedgerTx[] = [
      tx({ kind: 'income', amountCents: 500000, occurredOn: '2026-08-05' }),
      tx({ amountCents: 340000, occurredOn: '2026-09-15', goalFundedCents: split.fundedCents }),
    ]
    const goalMovements: GoalMovement[] = [
      { kind: 'deposit', amountCents: 300000, occurredOn: '2026-08-10' },
      { kind: 'use', amountCents: split.fundedCents, occurredOn: '2026-09-15' },
    ]
    const at = (month: string) => summarizeMonth({ month, today: '2026-09-28', initialBalanceCents: 0, transactions, goalMovements })
    expect(at('2026-08').goalLine).toEqual({ label: 'Guardado este mês', amountCents: 300000 })
    expect(at('2026-08').disponivelCents).toBe(200000)
    expect(at('2026-09').saiuCents).toBe(40000)
    expect(at('2026-09').goalLine).toBeNull()
    expect(at('2026-09').disponivelCents).toBe(-40000)
    expect(at('2026-09').saldoTotalCents).toBe(500000 - 340000)
    expect(at('2026-09').guardadoTotalCents).toBe(0)
  })

  test('excluir a meta: agosto continua "Guardado"; o que estava guardado volta hoje (A6, RN-16, Review Focus 3)', () => {
    const goalMovements: GoalMovement[] = [
      { kind: 'deposit', amountCents: 50000, occurredOn: '2026-08-10' },
      { kind: 'withdraw', amountCents: 50000, occurredOn: '2026-09-28' },
    ]
    const at = (month: string) => summarizeMonth({ month, today: '2026-09-28', initialBalanceCents: 0, transactions: [], goalMovements })
    expect(at('2026-08').goalLine).toEqual({ label: 'Guardado este mês', amountCents: 50000 })
    expect(at('2026-09').goalLine).toEqual({ label: 'Tirado das metas', amountCents: 50000 })
    expect(at('2026-09').disponivelCents).toBe(50000)
    expect(at('2026-09').saldoTotalCents).toBe(0)
    expect(at('2026-09').guardadoTotalCents).toBe(0)
  })
})
