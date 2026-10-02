import { monthOf, parseMonthKey, todayInSaoPaulo } from '@/domain/dates'
import { loadLedger } from '@/features/registro/queries'
import { loadRecurrences } from '@/features/contas/queries'
import { buildContas, parseContasTab } from '@/features/contas/view-model'
import { markBillPaid } from '@/features/contas/actions'
import { payTarget } from '@/features/contas/pay-target'
import { ContasTabs, BillsList, IncomeList, RecurringList, contasHref } from '@/features/contas/contas-sections'
import { BillsReminderCard } from '@/features/notificacoes/bills-reminder-card'
import { PayFromNotification } from '@/features/notificacoes/pay-from-notification'
import { MonthNav } from '@/features/seu-mes/month-nav'
import { env } from '@/lib/env'
import { Button } from '@/ui/button'
import { Money } from '@/ui/money'
import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

export default async function ContasPage({ searchParams }: { searchParams: Promise<{ mes?: string; aba?: string; erro?: string; pagar?: string | string[] }> }) {
  const today = todayInSaoPaulo()
  const { mes, aba, erro, pagar } = await searchParams
  const month = parseMonthKey(mes) ?? monthOf(today)
  const tab = parseContasTab(aba)
  // loadLedger gera as ocorrências do mês antes de ler (Task 3).
  const [{ profile, categories, transactions, goalMovements }, recurrences] = await Promise.all([loadLedger(), loadRecurrences()])
  const v = buildContas({ month, today, tab, profile, categories, transactions, recurrences, goalMovements })
  const back = contasHref(month, tab)
  // Aberto por uma notificação: só uma conta ainda a pagar do mês (a pagar ou vencida), em qualquer aba.
  const target = payTarget(pagar, v.payable)
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 pt-4 md:px-9 md:pt-7">
      {target && <PayFromNotification id={target.id} name={target.name} back={back} action={markBillPaid} />}
      <div className="flex items-center gap-2">
        <div className="flex-1"><PageHeader title="Contas" backHref="/mais" backOnMobileOnly /></div>
        <Button href="/contas/nova" variant="secondary" className="min-h-11 px-4 text-sm">Nova conta</Button>
      </div>
      <MonthNav month={month} label={v.label} basePath="/contas" query={tab === 'a-pagar' ? {} : { aba: tab }} />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <ContasTabs month={month} tab={tab} counts={v.counts} />
      <section data-testid="contas-resumo" aria-label="Resumo do mês" className="flex flex-col gap-2 rounded-card border border-brand-wash-border bg-brand-wash p-4">
        <div className="flex justify-between"><span>{v.aPagarLabel}</span><Money cents={v.aPagarCents} className="font-semibold text-ink" /></div>
        <div className="flex justify-between"><span>Disponível depois</span><Money cents={v.disponivelDepoisCents} className="font-semibold text-brand-ink" /></div>
      </section>
      {env.vapidPublicKey && (v.bills.length > 0 || v.recurringBills.length > 0) && <BillsReminderCard vapidPublicKey={env.vapidPublicKey} />}
      <BillsList tab={tab} bills={v.bills} back={back} />
      {v.incomes.length > 0 && <IncomeList items={v.incomes} />}
      <RecurringList title="Contas que se repetem" empty="Nenhuma conta que se repete ainda." items={v.recurringBills} />
      {v.recurringIncomes.length > 0 && <RecurringList title="Entradas que se repetem" empty="" items={v.recurringIncomes} />}
    </main>
  )
}
