import { CSV_BOM, CSV_EOL, csvDate, csvLine, csvMoney, csvMonth, csvText } from '@/domain/csv'
import type { ISODate } from '@/domain/dates'
import type { GoalMovementKind } from '@/domain/summary'
import { PREF_LABELS, PREF_ORDER } from '@/domain/notifications'
import { cardColor } from '@/features/cartoes/palette'
import { CARD_BRAND_LABELS, CARD_KIND_LABELS, paymentText } from '@/features/cartoes/types'
import type { GoalMovementRow } from '@/features/metas/types'
import type { PlanStatus } from '@/features/parcelas/types'
import type { TxRow } from '@/features/registro/tx-row'
import type { ExportData } from './export-queries'

// As páginas não são um retrato único do banco: uma anotação feita durante o envio
// pode duplicar ou pular uma linha. Aceito.
// Arquivo da pessoa, em blocos: título, cabeçalho, linhas e uma linha vazia.
// Todo texto digitado por gente passa por csvText (neutraliza fórmula); dinheiro
// e datas, pelos ajudantes tipados. Nenhum identificador interno entra.

export function exportFileName(today: ISODate): string {
  return `iris-meus-dados-${today}.csv`
}

const FAMILY_GOAL = 'Meta da família'
const yesNo = (v: boolean): string => csvText(v ? 'Sim' : 'Não')
const head = (title: string, headers: string[]): string => csvLine([csvText(title)]) + csvLine(headers.map(csvText))
const block = (title: string, headers: string[], rows: string[][]): string =>
  head(title, headers) + rows.map(csvLine).join('') + CSV_EOL

const MOVEMENT_LABELS: Record<GoalMovementKind, string> = {
  deposit: 'Guardou',
  withdraw: 'Tirou',
  use: 'Usou',
  return_on_exit: 'Voltou ao sair da família',
}
const PLAN_LABELS: Record<PlanStatus, string> = { active: 'Em andamento', settled: 'Quitada', refunded: 'Devolvida' }

export async function* exportCsv(
  data: ExportData,
  txPages: AsyncIterable<TxRow[]>,
  movePages: AsyncIterable<GoalMovementRow[]>,
): AsyncGenerator<string> {
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]))
  const goalName = new Map(data.goals.map((g) => [g.id, g.name]))
  const category = (id: string | null): string => csvText((id && categoryName.get(id)) || '')
  const planById = new Map(data.plans.map((p) => [p.id, p]))
  const purchase = (id: string | null): string => {
    const plan = id ? planById.get(id) : undefined
    return plan ? csvText(`Compra de ${csvDate(plan.purchasedOn)}`) : ''
  }
  const goal = (id: string): string => csvText(goalName.get(id) ?? FAMILY_GOAL)

  const { profile } = data
  yield CSV_BOM +
    block(
      'Cadastro',
      ['Nome', 'E-mail', 'Quanto você tinha ao começar', 'Cadastro criado em'],
      [[csvText(profile.displayName), csvText(profile.email), csvMoney(profile.initialBalanceCents), csvDate(profile.createdOn)]],
    )

  yield head('Registros', [
    'Data', 'Tipo', 'Situação', 'Valor', 'Categoria', 'De onde veio', 'Nota', 'Como pagou', 'Parcela',
    'Gasto da família', 'Pago com a meta', 'Parte paga pela meta', 'Vencimento', 'Pago em', 'Compra parcelada',
  ])
  for await (const page of txPages) {
    yield page
      .map((t) =>
        csvLine([
          csvDate(t.occurredOn),
          csvText(t.kind === 'expense' ? 'Gasto' : 'Entrada'),
          csvText(t.status === 'confirmed' ? 'Confirmado' : t.kind === 'expense' ? 'A pagar' : 'A receber'),
          csvMoney(t.amountCents),
          category(t.categoryId),
          csvText(t.source),
          csvText(t.note),
          csvText(paymentText(t, data.cards)),
          csvText(t.installmentNumber !== null && t.installmentCount !== null ? `${t.installmentNumber} de ${t.installmentCount}` : null),
          yesNo(t.familyId !== null),
          t.goalId ? goal(t.goalId) : '',
          t.goalFundedCents > 0 ? csvMoney(t.goalFundedCents) : '',
          csvDate(t.dueOn),
          csvDate(t.paidOn),
          purchase(t.installmentPlanId),
        ]),
      )
      .join('')
  }
  yield CSV_EOL

  yield block(
    'Contas e entradas que se repetem',
    ['Nome', 'Tipo', 'Valor', 'Categoria', 'De onde veio', 'Frequência', 'Dia', 'Mês', 'Começou em', 'Encerrada em', 'Conta da família', 'Nota', 'Como paga'],
    data.recurrences.map((r) => [
      csvText(r.name),
      csvText(r.kind === 'expense' ? 'Conta' : 'Entrada'),
      csvMoney(r.amountCents),
      category(r.categoryId),
      csvText(r.source),
      csvText(r.frequency === 'monthly' ? 'Todo mês' : 'Todo ano'),
      String(r.dueDay),
      r.frequency === 'yearly' && r.dueMonth !== null ? String(r.dueMonth) : '',
      csvDate(r.startsOn),
      csvDate(r.endedOn),
      yesNo(r.familyId !== null),
      csvText(r.note),
      csvText(paymentText({ cardId: r.cardId, cardDeleted: false, paymentMethod: r.paymentMethod }, data.cards)),
    ]),
  )

  yield block(
    'Compras parceladas',
    ['Data da compra', 'Total', 'Parcelas', 'Situação', 'Encerrada em'],
    data.plans.map((p) => [csvDate(p.purchasedOn), csvMoney(p.totalCents), String(p.count), csvText(PLAN_LABELS[p.status]), csvDate(p.closedOn)]),
  )

  yield block(
    'Cartões',
    ['Apelido', 'Tipo', 'Cor', 'Bandeira'],
    data.cards.map((c) => [
      csvText(c.nickname),
      csvText(CARD_KIND_LABELS[c.kind]),
      csvText(cardColor(c.color).label),
      c.brand ? csvText(CARD_BRAND_LABELS[c.brand]) : '',
    ]),
  )

  yield block(
    'Metas',
    ['Nome', 'Valor da meta', 'Prazo', 'Situação', 'Meta da família'],
    data.goals.map((g) => [
      csvText(g.name),
      csvMoney(g.targetCents),
      g.deadline ? csvMonth(g.deadline) : '',
      csvText(g.deletedOn ? 'Excluída' : g.status === 'used' ? 'Usada' : 'Ativa'),
      yesNo(g.family),
    ]),
  )

  yield head('Movimentos das metas', ['Data', 'Meta', 'Movimento', 'Valor'])
  for await (const page of movePages) {
    yield page.map((m) => csvLine([csvDate(m.occurredOn), goal(m.goalId), csvText(MOVEMENT_LABELS[m.kind]), csvMoney(m.amountCents)])).join('')
  }
  yield CSV_EOL

  const budgets = data.budgets
    .map((b) => ({ b, name: categoryName.get(b.categoryId) ?? '' }))
    .sort((x, y) => x.b.month.localeCompare(y.b.month) || x.name.localeCompare(y.name, 'pt-BR'))
  yield block(
    'Planejamento',
    ['Mês', 'Categoria', 'Planejado'],
    budgets.map(({ b, name }) => [csvMonth(b.month), csvText(name), csvMoney(b.amountCents)]),
  )

  yield block('Categorias', ['Nome'], data.categories.map((c) => [csvText(c.name)]))

  yield block('Lembretes', ['Lembrete', 'Ligado'], PREF_ORDER.map((k) => [csvText(PREF_LABELS[k]), yesNo(data.prefs[k])]))

  if (data.family) {
    yield block(
      'Família',
      ['Família', 'Papel', 'Desde'],
      [[csvText(data.family.name), csvText(data.family.role === 'admin' ? 'Administra' : 'Participa'), csvDate(data.family.joinedOn)]],
    )
  }
}
