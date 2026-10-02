import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    url: string
    constructor(url: string) {
      super(`redirect:${url}`)
      this.url = url
    }
  }
  return { RedirectSignal, supabase: null as unknown, setFlash: vi.fn(async (_m: string) => {}), revalidatePath: vi.fn() }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.supabase,
  requireUser: async () => ({ id: 'u1', email: 'ana@teste.iris.dev' }),
}))
vi.mock('@/lib/flash', () => ({ setFlash: h.setFlash }))
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new h.RedirectSignal(url)
  },
}))

const { completeOnboardingBalance, skipOnboardingBalance, updateDisplayName, updateInitialBalance } = await import('./actions')

type Call = { op: string; id: unknown; payload: unknown }
const calls: Call[] = []

function fakeSupabase(s: { fails?: boolean } = {}) {
  return {
    from: (table: string) => ({
      update: (payload: unknown) => ({
        eq: async (_col: string, id: unknown) => {
          calls.push({ op: `update:${table}`, id, payload })
          return { error: s.fails ? { message: 'falhou' } : null }
        },
      }),
    }),
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

const NOW = '2026-09-30T15:00:00.000Z'
const WRONG_VALUE = 'Esse valor não parece certo. Use apenas números.'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  calls.length = 0
  h.setFlash.mockClear()
  h.revalidatePath.mockClear()
  h.supabase = fakeSupabase()
})

afterEach(() => vi.useRealTimers())

describe('onboarding: Quanto você tem hoje?', () => {
  test('grava o saldo inicial, conclui o onboarding e segue para o primeiro gasto', async () => {
    const url = await redirectOf(completeOnboardingBalance({ status: 'idle' }, form({ initialBalance: 'R$ 6.000' })))
    expect(url).toBe('/boas-vindas/instalar')
    expect(calls).toEqual([{ op: 'update:profiles', id: 'u1', payload: { initial_balance_cents: 600000, onboarded_at: NOW } }])
  })
  test('campo vazio vale R$ 0,00 (é opcional)', async () => {
    await redirectOf(completeOnboardingBalance({ status: 'idle' }, form({ initialBalance: '  ' })))
    expect(calls[0].payload).toEqual({ initial_balance_cents: 0, onboarded_at: NOW })
  })
  test('valor negativo ou estranho é recusado sem gravar', async () => {
    for (const raw of ['-100', '12a']) {
      const state = await completeOnboardingBalance({ status: 'idle' }, form({ initialBalance: raw }))
      expect(state).toMatchObject({ status: 'error', fieldErrors: { initialBalance: WRONG_VALUE }, values: { initialBalance: raw } })
    }
    expect(calls).toEqual([])
  })
  test('falha no banco mantém o que foi digitado', async () => {
    h.supabase = fakeSupabase({ fails: true })
    const state = await completeOnboardingBalance({ status: 'idle' }, form({ initialBalance: '6.000' }))
    expect(state).toMatchObject({
      status: 'error',
      message: 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.',
      values: { initialBalance: '6.000' },
    })
  })
  test('Pular conclui o onboarding sem mexer no saldo', async () => {
    expect(await redirectOf(skipOnboardingBalance())).toBe('/boas-vindas/instalar')
    expect(calls).toEqual([{ op: 'update:profiles', id: 'u1', payload: { onboarded_at: NOW } }])
  })
  test('Pular com falha no banco volta para a mesma tela com aviso', async () => {
    h.supabase = fakeSupabase({ fails: true })
    expect(await redirectOf(skipOnboardingBalance())).toBe('/boas-vindas/saldo?erro=1')
  })
})

describe('Configurações', () => {
  test('muda o saldo inicial e avisa', async () => {
    const url = await redirectOf(updateInitialBalance({ status: 'idle' }, form({ initialBalance: '1.500,50' })))
    expect(url).toBe('/configuracoes')
    expect(calls).toEqual([{ op: 'update:profiles', id: 'u1', payload: { initial_balance_cents: 150050 } }])
    expect(h.setFlash).toHaveBeenCalledWith('Alterações salvas.')
    expect(h.revalidatePath).toHaveBeenCalledWith('/inicio')
  })
  test('muda o nome, sem espaços sobrando, e atualiza o menu lateral', async () => {
    const url = await redirectOf(updateDisplayName({ status: 'idle' }, form({ displayName: '  Joana ' })))
    expect(url).toBe('/configuracoes')
    expect(calls).toEqual([{ op: 'update:profiles', id: 'u1', payload: { display_name: 'Joana' } }])
    expect(h.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
  test('nome vazio pede o nome', async () => {
    const state = await updateDisplayName({ status: 'idle' }, form({ displayName: '   ' }))
    expect(state).toMatchObject({ status: 'error', fieldErrors: { displayName: 'Falta o seu nome.' } })
    expect(calls).toEqual([])
  })
})
