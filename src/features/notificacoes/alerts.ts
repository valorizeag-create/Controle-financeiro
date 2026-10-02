import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { monthOf, todayInSaoPaulo } from '@/domain/dates'
import { loadLedger } from '@/features/registro/queries'
import { loadBudgets } from '@/features/planejamento/queries'
import { buildPlanejamento } from '@/features/planejamento/view-model'

// Avisos de "falta pouco" depois de um registro. Melhor esforço: rodam fora do caminho da
// resposta (after) e nunca lançam. O log leva só o código do erro, nunca mensagem nem dado pessoal.
const code = (e: unknown): string => {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const c = (e as { code: unknown }).code
    if (typeof c === 'string' || typeof c === 'number') return String(c).slice(0, 20)
  }
  return 'erro'
}

export async function queueBudgetAlerts(): Promise<void> {
  try {
    const today = todayInSaoPaulo()
    const month = monthOf(today)
    const budgets = await loadBudgets([month])
    // Sem planejado neste mês nada pode disparar: não lê o extrato nem chama o banco de novo.
    if (budgets.length === 0) return
    const { categories, transactions } = await loadLedger()
    const view = buildPlanejamento({ month, today, categories, transactions, budgets })
    const near = view.lines.filter((line) => line.state === 'near')
    if (near.length === 0) return
    const supabase = await createClient()
    for (const line of near) {
      const { error } = await supabase.rpc('queue_own_notification', { p_kind: 'budget_near', p_id: line.categoryId })
      if (error) throw error
    }
  } catch (e) {
    console.error('queueBudgetAlerts', code(e))
  }
}

// Quem decide se falta pouco para a meta (e quem mais da família é avisado) é o banco.
export async function queueGoalAlert(goalId: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('queue_own_notification', { p_kind: 'goal_near', p_id: goalId })
    if (error) throw error
  } catch (e) {
    console.error('queueGoalAlert', code(e))
  }
}
