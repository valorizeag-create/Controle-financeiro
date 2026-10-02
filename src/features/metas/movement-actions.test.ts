import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), refresh: vi.fn(), after: [] as (() => unknown)[], budgetAlerts: vi.fn(async () => {}), goalAlert: vi.fn(async (_id: string) => {}) }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('@/lib/refresh', () => ({ refreshMoneyViews: h.refresh }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { h.after.push(fn) } }))
vi.mock('@/features/notificacoes/alerts', () => ({ queueBudgetAlerts: h.budgetAlerts, queueGoalAlert: h.goalAlert }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./movement-actions')

type Call = { op: string; filters: Record<string, unknown>; payload?: unknown }
const calls: Call[] = []
const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'

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
  calls.length = 0
  h.after.length = 0
  h.budgetAlerts.mockClear()
  h.goalAlert.mockClear()
  h.setFlash.mockClear()
  h.refresh.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const NBSP = String.fromCharCode(0xa0)
const TX = '9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e'

type Rpc = { data?: unknown; error?: unknown }
type GoalSelect = { name: string; target_cents: number } | { status: string } | null
function fakeSupabase(s: { goal?: GoalSelect; rpc?: Record<string, Rpc | Rpc[]> } = {}) {
  const queue: Record<string, Rpc[]> = Object.fromEntries(Object.entries(s.rpc ?? {}).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  return {
    from: (table: string) => ({
      select: (cols: string) => {
        const filters: Record<string, unknown> = {}
        const b = {
          eq(col: string, val: unknown) {
            filters[col] = val
            return b
          },
          is(col: string, val: unknown) {
            filters[col] = val
            return b
          },
          maybeSingle: async () => {
            calls.push({ op: `select:${table}:${cols}`, filters })
            const fallback = cols === 'status' ? { status: 'used' } : { name: 'Viagem para Salvador', target_cents: 400000 }
            return { data: s.goal === undefined ? fallback : s.goal, error: null }
          },
        }
        return b
      },
    }),
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      const r = queue[fn]?.length ? queue[fn].shift()! : {}
      return { data: r.data ?? null, error: r.error ?? null }
    },
  }
}

describe('depositToGoal (RN-13)', () => {
  test('guarda na meta da própria pessoa e confirma', async () => {
    h.supabase = fakeSupabase({ rpc: { deposit_to_goal: { data: 250000 } } })
    const url = await redirectOf(actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '20' })))
    expect(url).toBe(`/metas/${ID}`)
    expect(calls).toEqual([
      { op: 'select:goals:name, target_cents', filters: { id: ID, user_id: 'u1', deleted_on: null } },
      { op: 'rpc:deposit_to_goal', filters: {}, payload: { p_goal_id: ID, p_amount_cents: 2000 } },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Guardado. Seu mês já está atualizado.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('metade do caminho e meta completa usam a copy de comemoração (RF-30)', async () => {
    h.supabase = fakeSupabase({ rpc: { deposit_to_goal: { data: 200000 } } })
    await redirectOf(actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '1.000' })))
    expect(h.setFlash).toHaveBeenLastCalledWith('Metade do caminho até Viagem para Salvador.')
    h.supabase = fakeSupabase({ rpc: { deposit_to_goal: { data: 410000 } } })
    await redirectOf(actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '2.100' })))
    expect(h.setFlash).toHaveBeenLastCalledWith('Você chegou lá. Viagem para Salvador está completa.')
  })

  test('valor vazio fica no campo; meta excluída, de outra pessoa ou usada não grava (Review Focus 5)', async () => {
    h.supabase = fakeSupabase()
    expect(await actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '' }))).toMatchObject({ status: 'error', fieldErrors: { amount: 'Falta o valor.' } })
    h.supabase = fakeSupabase({ goal: null })
    expect(await actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '20' }))).toMatchObject({ status: 'error', message: SAVE_FAILED, values: { amount: '20' } })
    h.supabase = fakeSupabase({ rpc: { deposit_to_goal: { error: { message: 'Meta não encontrada.' } } } })
    expect(await actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '20' }))).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('aviso de meta perto de completar (depositToGoal)', () => {
  test('depois de guardar, pede ao banco para conferir se falta pouco para a meta', async () => {
    h.supabase = fakeSupabase({ rpc: { deposit_to_goal: { data: 250000 } } })
    await redirectOf(actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '20' })))
    expect(h.after.length).toBe(1)
    expect(h.goalAlert).not.toHaveBeenCalled()
    await h.after[0]()
    expect(h.goalAlert).toHaveBeenCalledWith(ID)
    expect(h.budgetAlerts).not.toHaveBeenCalled()
  })
  test('valor inválido ou falha: nenhum aviso', async () => {
    await actions.depositToGoal({ status: 'idle' }, form({ id: ID, amount: '' }))
    expect(h.after).toEqual([])
  })
})

describe('withdrawFromGoal (RN-14)', () => {
  test('tira e confirma', async () => {
    h.supabase = fakeSupabase({ rpc: { withdraw_from_goal: { data: 16000 } } })
    expect(await redirectOf(actions.withdrawFromGoal({ status: 'idle' }, form({ id: ID, amount: '20' })))).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:withdraw_from_goal', filters: {}, payload: { p_goal_id: ID, p_amount_cents: 2000 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Pronto. O valor voltou para o seu mês.')
  })

  test('tirar mais do que tem mostra quanto a meta tem, com o valor digitado no campo (Review Focus 4)', async () => {
    h.supabase = fakeSupabase({ rpc: { withdraw_from_goal: { error: { message: 'Valor maior que o guardado.' } }, goal_balance: { data: 18000 } } })
    const state = await actions.withdrawFromGoal({ status: 'idle' }, form({ id: ID, amount: '500' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { amount: `Esta meta tem R$${NBSP}180,00. Tire até esse valor.` }, values: { amount: '500' } })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('spendFromGoal (RN-15)', () => {
  const CAT = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'

  test('sem sobra: anota e volta para a meta', async () => {
    h.supabase = fakeSupabase({ rpc: { use_goal: { data: [{ tx_id: TX, funded_cents: 300000, leftover_cents: 0 }] } } })
    expect(await redirectOf(actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '3.400', categoryId: CAT })))).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:use_goal', filters: {}, payload: { p_goal_id: ID, p_amount_cents: 340000, p_category_id: CAT } }])
    expect(h.setFlash).toHaveBeenCalledWith('Anotado. Seu mês já está atualizado.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('com sobra: vai para a pergunta da sobra, sem aviso (RN-15b)', async () => {
    h.supabase = fakeSupabase({ rpc: { use_goal: { data: [{ tx_id: TX, funded_cents: 230000, leftover_cents: 18000 }] } } })
    expect(await redirectOf(actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '2.300', categoryId: CAT })))).toBe(`/metas/${ID}/sobra`)
    expect(h.setFlash).not.toHaveBeenCalled()
    expect(h.refresh).toHaveBeenCalled()
  })

  test('sem categoria ou categoria de outra pessoa: mensagem da copy no campo', async () => {
    h.supabase = fakeSupabase()
    expect(await actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '10', categoryId: '' }))).toMatchObject({ fieldErrors: { categoryId: 'Escolha uma categoria para esse gasto.' } })
    h.supabase = fakeSupabase({ rpc: { use_goal: { error: { message: 'Categoria não encontrada.' } } } })
    expect(await actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '10', categoryId: CAT }))).toMatchObject({ fieldErrors: { categoryId: 'Escolha uma categoria para esse gasto.' }, values: { amount: '10' } })
  })

  test('meta já usada (segunda aba): não grava de novo (Review Focus 1)', async () => {
    h.supabase = fakeSupabase({ rpc: { use_goal: { error: { message: 'Meta não encontrada.' } } } })
    expect(await actions.spendFromGoal({ status: 'idle' }, form({ id: ID, amount: '10', categoryId: CAT }))).toMatchObject({ status: 'error', message: SAVE_FAILED })
  })
})

describe('returnLeftover (RN-15b "Devolver")', () => {
  test('tira a sobra inteira e vai para o Seu mês', async () => {
    h.supabase = fakeSupabase({ goal: { status: 'used' }, rpc: { goal_balance: { data: 18000 }, withdraw_from_goal: { data: 0 } } })
    expect(await redirectOf(actions.returnLeftover(form({ id: ID })))).toBe('/inicio')
    expect(calls).toEqual([
      { op: 'select:goals:status', filters: { id: ID, user_id: 'u1', deleted_on: null } },
      { op: 'rpc:goal_balance', filters: {}, payload: { p_goal_id: ID } },
      { op: 'rpc:withdraw_from_goal', filters: {}, payload: { p_goal_id: ID, p_amount_cents: 18000 } },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Devolvido. Seu mês já está atualizado.')
  })

  test('devolver a sobra quando ela já foi devolvida (outra aba) não grava nada (Review Focus 1)', async () => {
    h.supabase = fakeSupabase({ goal: { status: 'used' }, rpc: { goal_balance: { data: 0 } } })
    expect(await redirectOf(actions.returnLeftover(form({ id: ID })))).toBe(`/metas/${ID}`)
    expect(calls.map((c) => c.op)).toEqual(['select:goals:status', 'rpc:goal_balance'])
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('meta não está mais "usada" (o uso foi desfeito em outra aba): não devolve o guardado inteiro (M-2)', async () => {
    h.supabase = fakeSupabase({ goal: { status: 'active' } })
    expect(await redirectOf(actions.returnLeftover(form({ id: ID })))).toBe(`/metas/${ID}?erro=1`)
    expect(calls).toEqual([{ op: 'select:goals:status', filters: { id: ID, user_id: 'u1', deleted_on: null } }])
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('meta excluída ou de outra pessoa: sem tela para voltar, vai para a lista', async () => {
    h.supabase = fakeSupabase({ goal: null })
    expect(await redirectOf(actions.returnLeftover(form({ id: ID })))).toBe('/metas')
    expect(calls).toEqual([{ op: 'select:goals:status', filters: { id: ID, user_id: 'u1', deleted_on: null } }])
  })
})

describe('deleteGoalUse (decisão 66)', () => {
  test('exclui o gasto pago com a meta e volta para a meta que o RPC devolveu', async () => {
    h.supabase = fakeSupabase({ rpc: { delete_goal_use: { data: ID } } })
    expect(await redirectOf(actions.deleteGoalUse(form({ transactionId: TX, goalId: ID })))).toBe(`/metas/${ID}`)
    expect(calls).toEqual([{ op: 'rpc:delete_goal_use', filters: {}, payload: { p_transaction_id: TX } }])
    expect(h.setFlash).toHaveBeenCalledWith('Excluído. Seu mês já está atualizado.')
  })

  test('a página redireciona pela meta que o RPC devolveu, não pelo campo do formulário (M-4)', async () => {
    const OTHER = 'a1b2c3d4-1111-4444-8888-0f1a2b3c4d5e'
    h.supabase = fakeSupabase({ rpc: { delete_goal_use: { data: ID } } })
    expect(await redirectOf(actions.deleteGoalUse(form({ transactionId: TX, goalId: OTHER })))).toBe(`/metas/${ID}`)
  })

  test('falha volta com aviso; ids inválidos vão para Metas sem chamar o banco', async () => {
    h.supabase = fakeSupabase({ rpc: { delete_goal_use: { error: { message: 'Gasto não encontrado.' } } } })
    expect(await redirectOf(actions.deleteGoalUse(form({ transactionId: TX, goalId: ID })))).toBe(`/metas/${ID}?erro=1`)
    calls.length = 0
    expect(await redirectOf(actions.deleteGoalUse(form({ transactionId: 'x', goalId: ID })))).toBe('/metas')
    expect(calls).toEqual([])
  })
})
