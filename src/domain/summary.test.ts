import { describe, expect, test } from 'vitest'
import { summarizeMonth, type GoalMovement, type LedgerTx } from './summary'

const tx = (p: Partial<LedgerTx> & Pick<LedgerTx, 'kind' | 'amountCents' | 'occurredOn'>): LedgerTx => ({
  status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, ...p,
})
const base = { month: '2026-09', today: '2026-09-22', initialBalanceCents: 0 }

describe('summarizeMonth', () => {
  test('exemplo do protótipo: 5.000 − 3.460 − 300 = 1.240; menos 600 de contas = 640', () => {
    const s = summarizeMonth({
      ...base,
      transactions: [
        tx({ kind: 'income', amountCents: 500000, occurredOn: '2026-09-05' }),
        tx({ kind: 'expense', amountCents: 346000, occurredOn: '2026-09-10' }),
        tx({ kind: 'expense', amountCents: 18000, occurredOn: '2026-09-25', status: 'pending', dueOn: '2026-09-25' }),
        tx({ kind: 'expense', amountCents: 12000, occurredOn: '2026-09-28', status: 'pending', dueOn: '2026-09-28' }),
        tx({ kind: 'expense', amountCents: 30000, occurredOn: '2026-09-30', status: 'pending', dueOn: '2026-09-30' }),
      ],
      goalMovements: [{ kind: 'deposit', amountCents: 30000, occurredOn: '2026-09-19' }],
    })
    expect(s.entrouCents).toBe(500000)
    expect(s.saiuCents).toBe(346000)
    expect(s.goalLine).toEqual({ label: 'Guardado este mês', amountCents: 30000 })
    expect(s.disponivelCents).toBe(124000)
    expect(s.contasAPagarCents).toBe(60000)
    expect(s.disponivelDepoisContasCents).toBe(64000)
  })

  test('sem guardar nem tirar, a linha de metas some', () => {
    const s = summarizeMonth({ ...base, transactions: [], goalMovements: [] })
    expect(s.goalLine).toBeNull()
    expect(s.disponivelCents).toBe(0)
  })

  test('tirar mais do que guardou vira "Tirado das metas" e volta para o Disponível', () => {
    const moves: GoalMovement[] = [
      { kind: 'deposit', amountCents: 10000, occurredOn: '2026-09-02' },
      { kind: 'withdraw', amountCents: 30000, occurredOn: '2026-09-12' },
    ]
    const s = summarizeMonth({ ...base, transactions: [], goalMovements: moves })
    expect(s.goalLine).toEqual({ label: 'Tirado das metas', amountCents: 20000 })
    expect(s.disponivelCents).toBe(20000)
  })

  test('gasto pago com meta: só a diferença sai do mês (RN-15, RN-15a)', () => {
    const s = summarizeMonth({
      ...base,
      transactions: [tx({ kind: 'expense', amountCents: 340000, occurredOn: '2026-09-15', goalFundedCents: 300000 })],
      goalMovements: [
        { kind: 'deposit', amountCents: 300000, occurredOn: '2026-07-01' },
        { kind: 'use', amountCents: 300000, occurredOn: '2026-09-15' },
      ],
    })
    expect(s.saiuCents).toBe(40000)
    expect(s.disponivelCents).toBe(-40000)
    expect(s.guardadoTotalCents).toBe(0)
    expect(s.saldoTotalCents).toBe(-340000)
  })

  test('entrada a receber não conta', () => {
    const s = summarizeMonth({
      ...base,
      transactions: [tx({ kind: 'income', amountCents: 80000, occurredOn: '2026-09-30', status: 'pending', dueOn: '2026-09-30' })],
      goalMovements: [],
    })
    expect(s.entrouCents).toBe(0)
    expect(s.saldoTotalCents).toBe(0)
  })

  test('conta paga com atraso conta no mês do pagamento (A1)', () => {
    const late = tx({ kind: 'expense', amountCents: 18000, occurredOn: '2026-09-28', dueOn: '2026-09-28', paidOn: '2026-10-02' })
    const sep = summarizeMonth({ ...base, transactions: [late], goalMovements: [] })
    const oct = summarizeMonth({ ...base, month: '2026-10', today: '2026-10-05', transactions: [late], goalMovements: [] })
    expect(sep.saiuCents).toBe(0)
    expect(oct.saiuCents).toBe(18000)
  })

  test('parcela futura não entra no mês nem no Saldo total', () => {
    const s = summarizeMonth({
      ...base,
      transactions: [tx({ kind: 'expense', amountCents: 7980, occurredOn: '2026-11-22' })],
      goalMovements: [],
    })
    expect(s.saiuCents).toBe(0)
    expect(s.saldoTotalCents).toBe(0)
  })

  test('sobra do mês anterior não entra no Disponível, só no Saldo total (RN-02)', () => {
    const s = summarizeMonth({
      ...base,
      initialBalanceCents: 600000,
      transactions: [tx({ kind: 'income', amountCents: 100000, occurredOn: '2026-08-10' })],
      goalMovements: [{ kind: 'deposit', amountCents: 20000, occurredOn: '2026-08-11' }],
    })
    expect(s.disponivelCents).toBe(0)
    expect(s.saldoTotalCents).toBe(700000)
    expect(s.guardadoTotalCents).toBe(20000)
  })

  test('mês corrente conta conta vencida de mês anterior ainda não paga', () => {
    const overdue = tx({ kind: 'expense', amountCents: 18000, occurredOn: '2026-08-28', status: 'pending', dueOn: '2026-08-28' })

    const currentMonth = summarizeMonth({ ...base, month: '2026-09', today: '2026-09-22', transactions: [overdue], goalMovements: [] })
    expect(currentMonth.contasAPagarCents).toBe(18000)

    const ownMonth = summarizeMonth({ ...base, month: '2026-08', today: '2026-09-22', transactions: [overdue], goalMovements: [] })
    expect(ownMonth.contasAPagarCents).toBe(18000)

    const laterMonth = summarizeMonth({ ...base, month: '2026-10', today: '2026-09-22', transactions: [overdue], goalMovements: [] })
    expect(laterMonth.contasAPagarCents).toBe(0)
  })

  test('mês futuro mostra gasto confirmado futuro como previsão (Saiu conta, Saldo total não)', () => {
    const s = summarizeMonth({
      ...base,
      month: '2026-11',
      today: '2026-09-22',
      transactions: [tx({ kind: 'expense', amountCents: 7980, occurredOn: '2026-11-22' })],
      goalMovements: [],
    })
    expect(s.saiuCents).toBe(7980)
    expect(s.saldoTotalCents).toBe(0)
  })
})
