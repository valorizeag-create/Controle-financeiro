import { redirect } from 'next/navigation'
import { monthLabel, monthOf, parseMonthKey, todayInSaoPaulo } from '@/domain/dates'
import { UNEXPECTED } from '@/features/auth/errors'
import { loadFamilyBills, loadFamilyExpenses, loadFamilyGoals, loadMyFamily } from '@/features/familia/queries'
import { buildFamilyMonth } from '@/features/familia/view-model'
import { FamilyMonth } from '@/features/familia/family-month'
import { ViewSwitch } from '@/features/familia/view-switch'
import { loadGoalMovements } from '@/features/metas/queries'
import { MonthNav } from '@/features/seu-mes/month-nav'
import { FormAlert } from '@/ui/form-alert'

type Props = { searchParams: Promise<{ mes?: string; erro?: string | string[] }> }

export default async function InicioFamiliaPage({ searchParams }: Props) {
  const today = todayInSaoPaulo()
  const { mes, erro } = await searchParams
  const month = parseMonthKey(mes) ?? monthOf(today)
  const family = await loadMyFamily()
  if (!family) redirect('/familia')

  const [expenses, bills, goals, myMovements] = await Promise.all([
    loadFamilyExpenses(month),
    loadFamilyBills(),
    loadFamilyGoals(family.id),
    loadGoalMovements(),
  ])
  const view = buildFamilyMonth({ month, today, meId: family.meId, isAdmin: family.role === 'admin', expenses, bills, goals, myMovements })
  const me = family.members.find((m) => m.userId === family.meId && m.leftAt === null)?.displayName
  // Valores desconhecidos de `erro` são ignorados.
  const showError = erro === '1'

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pt-5 md:px-9 md:pt-7">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">{family.name}</span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-[26px]">{me ? `Oi, ${me}.` : 'Oi.'}</h1>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <ViewSwitch month={month} current="familia" />
          <MonthNav month={month} label={monthLabel(month)} basePath="/inicio/familia" />
        </div>
      </header>
      {showError && <FormAlert>{UNEXPECTED}</FormAlert>}
      <FamilyMonth view={view} />
    </main>
  )
}
