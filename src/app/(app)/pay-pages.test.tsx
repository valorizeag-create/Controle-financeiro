// @vitest-environment node
import { isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const OTHER = '11111111-1111-4111-8111-111111111111'

const h = vi.hoisted(() => ({
  tx: [] as unknown[],
  bills: [] as unknown[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/features/registro/queries', () => ({
  loadLedger: async () => ({ profile: { displayName: 'A', initialBalanceCents: 0 }, categories: [{ id: 'c1', name: 'Casa', defaultKey: null }], transactions: h.tx, goalMovements: [] }),
}))
vi.mock('@/features/contas/queries', () => ({ loadRecurrences: async () => [] }))
vi.mock('@/features/familia/queries', () => ({
  loadMyFamily: async () => ({ meId: 'u1', role: 'admin', members: [] }),
  loadFamilyBills: async () => h.bills,
  loadFamilyRecurrences: async () => [],
}))
vi.mock('@/features/contas/actions', () => ({ markBillPaid: async () => {} }))
vi.mock('@/features/familia/money-actions', () => ({ payFamilyBill: async () => {} }))
vi.mock('@/features/notificacoes/bills-reminder-card', () => ({ BillsReminderCard: () => null }))
vi.mock('@/lib/env', () => ({ env: { vapidPublicKey: '' } }))

// Procura, na árvore devolvida pela página, o elemento PayFromNotification.
function findPay(node: ReactNode): { id: string; name: string; back: string } | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findPay(n)
      if (f) return f
    }
    return null
  }
  if (!isValidElement(node)) return null
  const props = node.props as { id?: string; name?: string; back?: string; action?: unknown; children?: ReactNode }
  if (typeof node.type === 'function' && node.type.name === 'PayFromNotification') return { id: props.id as string, name: props.name as string, back: props.back as string }
  return findPay(props.children)
}

const tx = (over: Record<string, unknown>) => ({
  id: ID, kind: 'expense', status: 'pending', amountCents: 10000, categoryId: 'c1', note: 'Luz', source: null,
  occurredOn: '2026-10-05', dueOn: '2026-10-05', paidOn: null, paymentMethod: null, cardId: null, cardDeleted: false,
  installmentPlanId: null, installmentNumber: null, goalId: null, familyId: null, ...over,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-10T15:00:00Z'))
  h.tx = []
  h.bills = []
})

describe('/contas com ?pagar=', () => {
  const run = async (pagar: string | string[] | undefined, aba?: string) => {
    const { default: Page } = await import('./contas/page')
    return findPay(await Page({ searchParams: Promise.resolve({ mes: '2026-10', aba, pagar }) }))
  }

  test('conta a pagar: abre a confirmação', async () => {
    h.tx = [tx({ dueOn: '2026-10-20' })]
    expect(await run(ID)).toMatchObject({ id: ID, back: '/contas?mes=2026-10' })
  })
  test('conta vencida (ainda não paga) também abre, mesmo sem a aba', async () => {
    h.tx = [tx({ dueOn: '2026-10-05' })]
    expect(await run(ID)).toMatchObject({ id: ID })
    expect(await run(ID, 'vencidas')).toMatchObject({ id: ID })
  })
  test('paga, de outra pessoa, inexistente ou id estranho: página normal, sem confirmação', async () => {
    h.tx = [tx({ status: 'confirmed', paidOn: '2026-10-06' })]
    expect(await run(ID)).toBeNull()
    expect(await run(ID, 'pagas')).toBeNull()
    h.tx = [tx({ dueOn: '2026-10-20' })]
    expect(await run(OTHER)).toBeNull()
    expect(await run('abc')).toBeNull()
    expect(await run([ID, ID])).toBeNull()
    expect(await run(undefined)).toBeNull()
  })
})

describe('/familia/contas com ?pagar=', () => {
  const bill = (over: Record<string, unknown>) => ({ id: ID, name: 'Luz', amountCents: 5000, dueOn: '2026-10-20', authorId: 'u2', ...over })
  const run = async (pagar: string | undefined) => {
    const { default: Page } = await import('./familia/contas/page')
    return findPay(await Page({ searchParams: Promise.resolve({ pagar }) }))
  }

  test('a pagar e vencida abrem; ausente da lista da família: página normal', async () => {
    h.bills = [bill({})]
    expect(await run(ID)).toMatchObject({ id: ID, name: 'Luz', back: '/familia/contas' })
    h.bills = [bill({ dueOn: '2026-10-02' })]
    expect(await run(ID)).toMatchObject({ id: ID })
    expect(await run(OTHER)).toBeNull()
    h.bills = []
    expect(await run(ID)).toBeNull()
  })
})
