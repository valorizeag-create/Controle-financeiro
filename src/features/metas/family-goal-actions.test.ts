import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), refresh: vi.fn() }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('@/lib/refresh', () => ({ refreshMoneyViews: h.refresh }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const actions = await import('./family-goal-actions')

type Call = { op: string; filters: Record<string, unknown>; payload?: unknown }
const calls: Call[] = []
const UUID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'
const UUID2 = '9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e'
const UUID3 = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const ADMIN_ONLY = 'Só quem administra a família pode fazer isso.'
const CHANGED = 'Esta meta mudou. Atualize a página para ver como ela está.'
const EMPTY = 'Esta meta não tem dinheiro guardado.'
const UNEXPECTED = 'Algo não saiu como esperado do nosso lado. Tente novamente em instantes.'
const NBSP = String.fromCharCode(0xa0)
const idle = { status: 'idle' } as const

type Rpc = { data?: unknown; error?: unknown }
function fakeSupabase(s: { family?: string | null; goal?: { name: string; target_cents: number } | null; rpc?: Record<string, Rpc> } = {}) {
  return {
    from: (table: string) => ({
      select: (cols: string) => {
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
            calls.push({ op: `select:${table}:${cols}`, filters })
            if (table === 'family_members') return { data: s.family === null ? null : { family_id: s.family ?? 'f1' }, error: null }
            return { data: s.goal === undefined ? { name: 'Reforma da cozinha', target_cents: 1000000 } : s.goal, error: null }
          },
        }
        return b
      },
    }),
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ op: `rpc:${fn}`, filters: {}, payload: args })
      const r = s.rpc?.[fn] ?? {}
      return { data: r.data ?? null, error: r.error ?? null }
    },
  }
}

const rpcCalls = () => calls.filter((c) => c.op.startsWith('rpc:'))

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
  h.setFlash.mockClear()
  h.refresh.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('updateFamilyGoal', () => {
  test('edita pela função do banco, sem mandar família nem papel, e abre a meta', async () => {
    h.supabase = fakeSupabase()
    const url = await redirectOf(
      actions.updateFamilyGoal(idle, form({ id: UUID, name: 'Reforma', target: '5.000', deadline: '2027-03', family_id: 'x', role: 'admin' })),
    )
    expect(url).toBe(`/metas/${UUID}`)
    expect(calls).toEqual([
      { op: 'rpc:update_family_goal', filters: {}, payload: { p_id: UUID, p_name: 'Reforma', p_target_cents: 500000, p_deadline: '2027-03-01' } },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('sem prazo manda null; erro no campo e id inválido não chegam ao banco', async () => {
    h.supabase = fakeSupabase()
    await redirectOf(actions.updateFamilyGoal(idle, form({ id: UUID, name: 'Reforma', target: '10', deadline: '' })))
    expect((calls[0].payload as { p_deadline: unknown }).p_deadline).toBeNull()
    calls.length = 0
    expect(await actions.updateFamilyGoal(idle, form({ id: UUID, name: '', target: '10', deadline: '' }))).toMatchObject({
      status: 'error',
      fieldErrors: { name: 'Falta o nome.' },
      values: { target: '10' },
    })
    expect(await actions.updateFamilyGoal(idle, form({ id: 'x', name: 'Reforma', target: '10', deadline: '' }))).toMatchObject({ status: 'error', message: SAVE_FAILED })
    expect(calls).toEqual([])
  })

  test('sem permissão (nem quem criou nem administrador): aviso calmo; impasse: tente de novo', async () => {
    h.supabase = fakeSupabase({ rpc: { update_family_goal: { error: { code: '42501', message: 'Só quem administra a família pode fazer isso.' } } } })
    expect(await actions.updateFamilyGoal(idle, form({ id: UUID, name: 'Reforma', target: '10', deadline: '' }))).toMatchObject({ message: ADMIN_ONLY, values: { name: 'Reforma' } })
    h.supabase = fakeSupabase({ rpc: { update_family_goal: { error: { code: '40P01', message: 'deadlock detected' } } } })
    expect(await actions.updateFamilyGoal(idle, form({ id: UUID, name: 'Reforma', target: '10', deadline: '' }))).toMatchObject({ message: UNEXPECTED })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deleteFamilyGoal', () => {
  test('exclui pela função do banco e avisa', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.deleteFamilyGoal(form({ id: UUID })))).toBe('/metas')
    expect(calls).toEqual([{ op: 'rpc:delete_family_goal', filters: {}, payload: { p_goal_id: UUID } }])
    expect(h.setFlash).toHaveBeenCalledWith('Meta excluída.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('não é administrador: aviso próprio de volta à meta; meta que sumiu: aviso na lista; impasse: volta para editar', async () => {
    h.supabase = fakeSupabase({ rpc: { delete_family_goal: { error: { code: '42501', message: 'Só quem administra a família pode fazer isso.' } } } })
    expect(await redirectOf(actions.deleteFamilyGoal(form({ id: UUID })))).toBe(`/metas/${UUID}`)
    expect(h.setFlash).toHaveBeenLastCalledWith(ADMIN_ONLY)
    h.supabase = fakeSupabase({ rpc: { delete_family_goal: { error: { message: 'Meta inválida.' } } } })
    expect(await redirectOf(actions.deleteFamilyGoal(form({ id: UUID })))).toBe('/metas')
    expect(h.setFlash).toHaveBeenLastCalledWith(CHANGED)
    h.setFlash.mockClear()
    h.supabase = fakeSupabase({ rpc: { delete_family_goal: { error: { code: '40P01', message: 'deadlock' } } } })
    expect(await redirectOf(actions.deleteFamilyGoal(form({ id: UUID })))).toBe(`/metas/${UUID}/editar?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('depositToFamilyGoal', () => {
  test('guardar: marco pela meta da família inteira (Metade do caminho…)', async () => {
    h.supabase = fakeSupabase({ rpc: { family_goal_totals: { data: [{ goal_id: UUID, saved_cents: 495000 }, { goal_id: UUID2, saved_cents: 1 }] } } })
    expect(await redirectOf(actions.depositToFamilyGoal(idle, form({ id: UUID, amount: '100,00' })))).toBe(`/metas/${UUID}`)
    expect(rpcCalls().at(-1)).toEqual({ op: 'rpc:deposit_family_goal', filters: {}, payload: { p_goal_id: UUID, p_amount_cents: 10000 } })
    expect(h.setFlash).toHaveBeenCalledWith('Metade do caminho até Reforma da cozinha.')
    expect(calls.find((c) => c.op.startsWith('select:goals'))?.filters).toEqual({ 'eq:id': UUID, 'eq:family_id': 'f1', 'eq:status': 'active', 'is:deleted_on': null })
    expect(h.refresh).toHaveBeenCalled()
  })

  test('total da família que completa a meta usa a copy de comemoração; fora de marco, o aviso de sempre', async () => {
    h.supabase = fakeSupabase({ rpc: { family_goal_totals: { data: [{ goal_id: UUID, saved_cents: '990000' }] } } })
    await redirectOf(actions.depositToFamilyGoal(idle, form({ id: UUID, amount: '100' })))
    expect(h.setFlash).toHaveBeenLastCalledWith('Você chegou lá. Reforma da cozinha está completa.')
    h.supabase = fakeSupabase({ rpc: { family_goal_totals: { data: [] } } })
    await redirectOf(actions.depositToFamilyGoal(idle, form({ id: UUID, amount: '10' })))
    expect(h.setFlash).toHaveBeenLastCalledWith('Guardado. Seu mês já está atualizado.')
  })

  test('sem família, meta de fora da família ou erro do banco: não grava e mantém o valor', async () => {
    h.supabase = fakeSupabase({ family: null })
    expect(await actions.depositToFamilyGoal(idle, form({ id: UUID, amount: '20' }))).toMatchObject({ message: CHANGED, values: { amount: '20' } })
    h.supabase = fakeSupabase({ goal: null })
    expect(await actions.depositToFamilyGoal(idle, form({ id: UUID, amount: '20' }))).toMatchObject({ message: CHANGED })
    expect(rpcCalls().map((c) => c.op)).not.toContain('rpc:deposit_family_goal')
    h.supabase = fakeSupabase({ rpc: { deposit_family_goal: { error: { code: '40P01', message: 'deadlock' } } } })
    expect(await actions.depositToFamilyGoal(idle, form({ id: UUID, amount: '20' }))).toMatchObject({ message: UNEXPECTED })
    expect(await actions.depositToFamilyGoal(idle, form({ id: UUID, amount: '' }))).toMatchObject({ fieldErrors: { amount: 'Falta o valor.' } })
    expect(await actions.depositToFamilyGoal(idle, form({ id: 'x', amount: '20' }))).toMatchObject({ message: SAVE_FAILED })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('withdrawFromFamilyGoal', () => {
  test('tira a própria parte e confirma', async () => {
    h.supabase = fakeSupabase()
    expect(await redirectOf(actions.withdrawFromFamilyGoal(idle, form({ id: UUID, amount: '20' })))).toBe(`/metas/${UUID}`)
    expect(calls).toEqual([{ op: 'rpc:withdraw_family_goal', filters: {}, payload: { p_goal_id: UUID, p_amount_cents: 2000 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Pronto. O valor voltou para o seu mês.')
  })

  test('tirar mais do que a própria parte: mensagem calma com a parte', async () => {
    h.supabase = fakeSupabase({ rpc: { withdraw_family_goal: { error: { message: 'Valor maior que o guardado.' } }, goal_balance: { data: 180000 } } })
    const s = await actions.withdrawFromFamilyGoal(idle, form({ id: UUID, amount: '2.000,00' }))
    expect(s.status === 'error' && s.fieldErrors?.amount).toBe(`Sua parte nesta meta é R$${NBSP}1.800,00. Tire até esse valor.`)
    expect(s.status === 'error' && s.values).toMatchObject({ amount: '2.000,00' })
    expect(h.setFlash).not.toHaveBeenCalled()
  })

  test('outras falhas: aviso calmo; impasse: tente de novo', async () => {
    h.supabase = fakeSupabase({ rpc: { withdraw_family_goal: { error: { message: 'Meta não encontrada.' } } } })
    expect(await actions.withdrawFromFamilyGoal(idle, form({ id: UUID, amount: '20' }))).toMatchObject({ message: CHANGED })
    h.supabase = fakeSupabase({ rpc: { withdraw_family_goal: { error: { code: '40P01', message: 'deadlock' } } } })
    expect(await actions.withdrawFromFamilyGoal(idle, form({ id: UUID, amount: '20' }))).toMatchObject({ message: UNEXPECTED })
  })
})

describe('textos por tipo de erro do banco', () => {
  test('uso: meta mudou, meta inválida e meta sem dinheiro guardado', async () => {
    for (const [message, text] of [['Meta não encontrada.', CHANGED], ['Meta inválida.', CHANGED], ['Meta sem dinheiro guardado.', EMPTY]]) {
      h.supabase = fakeSupabase({ rpc: { use_family_goal: { error: { message } } } })
      expect(await actions.spendFromFamilyGoal(idle, form({ id: UUID, amount: '10', categoryId: UUID3 }))).toMatchObject({ message: text, values: { amount: '10' } })
    }
  })

  test('guardar: meta já usada (fora do filtro de ativa) mostra que a meta mudou e não chama o banco', async () => {
    h.supabase = fakeSupabase({ goal: null })
    expect(await actions.depositToFamilyGoal(idle, form({ id: UUID, amount: '20' }))).toMatchObject({ message: CHANGED })
    expect(rpcCalls().map((c) => c.op)).not.toContain('rpc:deposit_family_goal')
    h.supabase = fakeSupabase()
    await redirectOf(actions.depositToFamilyGoal(idle, form({ id: UUID, amount: '20' })))
    expect(calls.find((c) => c.op.startsWith('select:goals'))?.filters).toMatchObject({ 'eq:status': 'active' })
  })

  test('tirar: erro ao ler a própria parte não mostra R$ 0,00', async () => {
    h.supabase = fakeSupabase({ rpc: { withdraw_family_goal: { error: { message: 'Valor maior que o guardado.' } }, goal_balance: { error: { message: 'x' } } } })
    expect(await actions.withdrawFromFamilyGoal(idle, form({ id: UUID, amount: '20' }))).toMatchObject({ message: SAVE_FAILED })
  })
})

describe('spendFromFamilyGoal', () => {
  test('usar: vai para a meta, sem pergunta da sobra', async () => {
    h.supabase = fakeSupabase({ rpc: { use_family_goal: { data: [{ tx_id: UUID2, funded_cents: 300000, leftover_cents: 100000 }] } } })
    expect(await redirectOf(actions.spendFromFamilyGoal(idle, form({ id: UUID, amount: '3.000,00', categoryId: UUID3 })))).toBe(`/metas/${UUID}`)
    expect(calls).toEqual([
      { op: 'rpc:use_family_goal', filters: {}, payload: { p_goal_id: UUID, p_amount_cents: 300000, p_category_id: UUID3 } },
    ])
    expect(h.setFlash).toHaveBeenCalledWith('Anotado. Seu mês já está atualizado.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('categoria ausente ou de outra pessoa: mensagem no campo; só administrador: aviso calmo', async () => {
    h.supabase = fakeSupabase()
    expect(await actions.spendFromFamilyGoal(idle, form({ id: UUID, amount: '10', categoryId: '' }))).toMatchObject({ fieldErrors: { categoryId: 'Escolha uma categoria para esse gasto.' } })
    h.supabase = fakeSupabase({ rpc: { use_family_goal: { error: { message: 'Categoria não encontrada.' } } } })
    expect(await actions.spendFromFamilyGoal(idle, form({ id: UUID, amount: '10', categoryId: UUID3 }))).toMatchObject({ fieldErrors: { categoryId: 'Escolha uma categoria para esse gasto.' }, values: { amount: '10' } })
    h.supabase = fakeSupabase({ rpc: { use_family_goal: { error: { code: '42501', message: 'Só quem administra a família pode fazer isso.' } } } })
    expect(await actions.spendFromFamilyGoal(idle, form({ id: UUID, amount: '10', categoryId: UUID3 }))).toMatchObject({ message: ADMIN_ONLY })
    h.supabase = fakeSupabase({ rpc: { use_family_goal: { error: { code: '40P01', message: 'deadlock' } } } })
    expect(await actions.spendFromFamilyGoal(idle, form({ id: UUID, amount: '10', categoryId: UUID3 }))).toMatchObject({ message: UNEXPECTED })
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

describe('deleteFamilyGoalUse', () => {
  test('desfaz pela função do banco e volta para a meta que ela devolveu, não a do formulário', async () => {
    h.supabase = fakeSupabase({ rpc: { delete_family_goal_use: { data: UUID } } })
    expect(await redirectOf(actions.deleteFamilyGoalUse(form({ transactionId: UUID2, goalId: UUID3 })))).toBe(`/metas/${UUID}`)
    expect(calls).toEqual([{ op: 'rpc:delete_family_goal_use', filters: {}, payload: { p_transaction_id: UUID2 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Excluído. Seu mês já está atualizado.')
    expect(h.refresh).toHaveBeenCalled()
  })

  test('uso que o banco não acha (toque duplo, outra família ou quem saiu): texto neutro, sem afirmar a causa', async () => {
    h.supabase = fakeSupabase({ rpc: { delete_family_goal_use: { error: { message: 'Gasto não encontrado.' } } } })
    expect(await redirectOf(actions.deleteFamilyGoalUse(form({ transactionId: UUID2, goalId: UUID })))).toBe(`/metas/${UUID}`)
    expect(h.setFlash).toHaveBeenCalledWith('Este uso não pode mais ser desfeito.')
    expect(h.setFlash).toHaveBeenCalledTimes(1)
  })

  test('só administrador e meta mudada têm texto próprio; sem goalId válido a falha volta para a lista', async () => {
    h.supabase = fakeSupabase({ rpc: { delete_family_goal_use: { error: { code: '42501', message: 'x' } } } })
    expect(await redirectOf(actions.deleteFamilyGoalUse(form({ transactionId: UUID2, goalId: UUID })))).toBe(`/metas/${UUID}`)
    expect(h.setFlash).toHaveBeenLastCalledWith(ADMIN_ONLY)
    h.supabase = fakeSupabase({ rpc: { delete_family_goal_use: { error: { message: 'Meta não encontrada.' } } } })
    expect(await redirectOf(actions.deleteFamilyGoalUse(form({ transactionId: UUID2, goalId: UUID })))).toBe('/metas')
    expect(h.setFlash).toHaveBeenLastCalledWith(CHANGED)
    h.supabase = fakeSupabase({ rpc: { delete_family_goal_use: { error: { message: 'Gasto não encontrado.' } } } })
    expect(await redirectOf(actions.deleteFamilyGoalUse(form({ transactionId: UUID2 })))).toBe('/metas')
  })

  test('impasse e erro inesperado voltam com o aviso calmo de tentar de novo', async () => {
    h.supabase = fakeSupabase({ rpc: { delete_family_goal_use: { error: { code: '40P01', message: 'deadlock' } } } })
    expect(await redirectOf(actions.deleteFamilyGoalUse(form({ transactionId: UUID2, goalId: UUID })))).toBe(`/metas/${UUID}?erro=1`)
    expect(h.setFlash).not.toHaveBeenCalled()
  })
})

test('ações com id que não é uuid não chegam ao banco', async () => {
  h.supabase = fakeSupabase()
  expect(await redirectOf(actions.deleteFamilyGoal(form({ id: 'x' })))).toBe('/metas')
  expect(await redirectOf(actions.deleteFamilyGoalUse(form({ transactionId: 'x', goalId: UUID })))).toBe('/metas')
  expect(calls).toEqual([])
})
