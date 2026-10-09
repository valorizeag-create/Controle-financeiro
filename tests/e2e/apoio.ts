// Apoio dos testes de ponta a ponta do Plano 10: cliente administrativo (só testes), usuários com prefixo
// único por worker e por execução, sementes que respeitam as guardas do banco e as conferências de
// acessibilidade (axe) e de rolagem horizontal.
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { todayInSaoPaulo } from '../../src/domain/dates'

export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
export const PASSWORD = 'senha-forte-123'
export const today = todayInSaoPaulo()

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const WORKER = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? '0'

// Prefixo único por worker e por execução: a limpeza de um worker nunca apaga usuários do outro.
export function users(tag: string): {
  makeUser(name: string): Promise<{ id: string; email: string }>
  cleanup(): Promise<void>
} {
  const prefix = `e2e-${tag}-w${WORKER}-${RUN_ID}-`
  const created: string[] = []
  const userExists = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user !== null
  return {
    async makeUser(name) {
      const email = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.iris.dev`
      const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: name } })
      if (error) throw error
      created.push(data.user.id)
      const { error: e2 } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', data.user.id)
      if (e2) throw e2
      return { id: data.user.id, email }
    },
    async cleanup() {
      const remove = async (id: string) => {
        if (!(await userExists(id))) return
        const first = await admin.auth.admin.deleteUser(id)
        if (first.error) {
          const second = await admin.auth.admin.deleteUser(id)
          if (second.error) throw second.error
        }
      }
      // Sem usuário criado (testes @publico, que rodam sem banco) não há o que limpar nem banco a consultar.
      if (created.length === 0) return
      for (const id of created) await remove(id)
      const known = new Set(created)
      let page = 1
      for (;;) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        for (const u of data.users) {
          if (u.email?.startsWith(prefix) && !known.has(u.id)) await remove(u.id)
        }
        if (data.users.length < 1000) break
        page += 1
      }
    },
  }
}

export async function category(userId: string, key: string): Promise<string> {
  const { data, error } = await admin.from('categories').select('id').eq('user_id', userId).eq('default_key', key).single()
  if (error) throw error
  return data.id
}

export async function seedExpense(userId: string, key: string, cents: number, note: string): Promise<void> {
  const { error } = await admin.from('transactions').insert({
    user_id: userId, kind: 'expense', amount_cents: cents, category_id: await category(userId, key), occurred_on: today, note,
  })
  if (error) throw error
}

// month: AAAA-MM
export async function seedBudget(userId: string, key: string, cents: number, month: string): Promise<void> {
  const { error } = await admin.from('budgets').insert({ user_id: userId, month: `${month}-01`, category_id: await category(userId, key), amount_cents: cents })
  if (error) throw error
}

export async function seedGoal(userId: string, name: string, targetCents: number): Promise<void> {
  const { error } = await admin.from('goals').insert({ user_id: userId, name, target_cents: targetCents })
  if (error) throw error
}

// Conta mensal (recorrência de despesa), categoria "casa".
export async function seedBill(userId: string, name: string, cents: number, dueDay: number): Promise<void> {
  const { error } = await admin.from('recurrences').insert({
    user_id: userId, kind: 'expense', name, amount_cents: cents, category_id: await category(userId, 'casa'),
    frequency: 'monthly', due_day: dueDay, starts_on: today,
  })
  if (error) throw error
}

export async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/inicio/)
}

// Compara com a largura da tela do aparelho, não com a da página: no celular emulado (isMobile),
// conteúdo largo demais alarga a própria página, e scrollWidth e clientWidth crescem juntos.
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const screen = page.viewportSize()?.width ?? Infinity
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  const limit = Math.min(client, screen)
  expect(scroll, `${label}: rolagem horizontal (${scroll} > ${limit})`).toBeLessThanOrEqual(limit)
}

// Nenhuma regra é desligada: qualquer violação WCAG 2.0/2.1/2.2 A ou AA reprova.
export async function expectNoA11yViolations(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const resumo = violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(' ')}`).join('\n')}`)
    .join('\n')
  expect(violations, `${label}: violações de acessibilidade\n${resumo}`).toEqual([])
}
