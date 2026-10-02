import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInSaoPaulo, type ISODate, type MonthKey } from '@/domain/dates'
import { resolvePrefs, type PrefKind } from '@/domain/notifications'
import { orderCategories } from '@/features/categorias/names'
import { CARD_COLUMNS, toCardRow, type CardRawRow, type CardRow } from '@/features/cartoes/types'
import { RECURRENCE_COLUMNS, toRecurrenceRow, type RecurrenceRawRow, type RecurrenceRow } from '@/features/contas/types'
import { GOAL_COLUMNS, MOVEMENT_COLUMNS, toGoalRow, toMovementRow, type GoalMovementRawRow, type GoalMovementRow, type GoalRawRow } from '@/features/metas/types'
import { PLAN_COLUMNS, toPlanRow, type PlanRawRow, type PlanRow } from '@/features/parcelas/types'
import { BUDGET_COLUMNS, toBudgetRow, type BudgetRawRow, type BudgetRow } from '@/features/planejamento/types'
import { fetchAllPages } from '@/features/registro/paging'
import { TX_COLUMNS, toTxRow, type TxRawRow, type TxRow } from '@/features/registro/tx-row'

// Tudo o que é DA PESSOA e só isso. Cada leitura filtra pelo id de requireUser()
// além da RLS. As únicas leituras sem user_id são as que não têm dono pessoa:
// o nome da família dela e as metas dessa família (user_id nulo), e mesmo estas
// só entram na parte em que a pessoa tem movimento. Nada de endereço de push,
// fila de avisos, convites ou dados dos outros membros. Toda lista é lida em
// páginas (o banco devolve no máximo 1000 linhas por resposta).

export interface ExportGoal {
  id: string
  name: string
  targetCents: number
  deadline: MonthKey | null
  status: 'active' | 'used'
  deletedOn: ISODate | null
  family: boolean
}

export type ExportRecurrence = RecurrenceRow & { familyId: string | null; note: string | null; paymentMethod: string | null; cardId: string | null }

export interface ExportData {
  profile: { displayName: string; email: string; initialBalanceCents: number; createdOn: ISODate }
  categories: { id: string; name: string }[]
  cards: CardRow[]
  recurrences: ExportRecurrence[]
  plans: PlanRow[]
  goals: ExportGoal[]
  budgets: BudgetRow[]
  prefs: Record<PrefKind, boolean>
  family: { name: string; role: 'admin' | 'member'; joinedOn: ISODate } | null
}

export const EXPORT_PAGE = 1000

type RecurrenceExtra = { family_id: string | null; note: string | null; payment_method: string | null; card_id: string | null }

// A sessão e a conexão são resolvidas na rota, ANTES de devolver a resposta (o
// cookie só pode ser lido dentro do pedido; o envio em partes roda depois).
// Aqui nada chama requireUser(), createClient() nem cookies().
export interface ExportScope {
  supabase: SupabaseClient
  user: { id: string; email?: string | null }
}

type Result = { data: unknown[] | null; error: unknown }
type Raw = Record<string, unknown>

const day = (timestamp: string): ISODate => todayInSaoPaulo(new Date(timestamp))

function allPages<T>(fetchPage: (from: number, to: number) => PromiseLike<Result>): Promise<T[]> {
  return fetchAllPages<T>(async (from, to) => {
    const { data, error } = await fetchPage(from, to)
    return { data: data as T[] | null, error }
  }, EXPORT_PAGE)
}

async function* pagesOf<T>(fetchPage: (from: number, to: number) => PromiseLike<Result>): AsyncGenerator<T[]> {
  for (let from = 0; ; from += EXPORT_PAGE) {
    const { data, error } = await fetchPage(from, from + EXPORT_PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as T[]
    yield page
    if (page.length < EXPORT_PAGE) return
  }
}

async function loadProfile(supabase: SupabaseClient, user: { id: string; email?: string | null }): Promise<ExportData['profile']> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, initial_balance_cents, created_at')
    .eq('id', user.id)
    .single<{ display_name: string; initial_balance_cents: number | string; created_at: string }>()
  if (error) throw error
  return {
    displayName: data.display_name,
    email: user.email ?? '',
    initialBalanceCents: Number(data.initial_balance_cents),
    createdOn: day(data.created_at),
  }
}

async function loadFamily(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; info: NonNullable<ExportData['family']> } | null> {
  const { data, error } = await supabase
    .from('family_members')
    .select('family_id, role, joined_at')
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle<{ family_id: string; role: string; joined_at: string }>()
  if (error) throw error
  if (!data) return null
  const family = await supabase.from('families').select('name').eq('id', data.family_id).maybeSingle<{ name: string }>()
  if (family.error) throw family.error
  if (!family.data) return null
  return {
    id: data.family_id,
    info: { name: family.data.name, role: data.role === 'admin' ? 'admin' : 'member', joinedOn: day(data.joined_at) },
  }
}

function toExportGoal(raw: GoalRawRow, family: boolean): ExportGoal {
  const g = toGoalRow(raw)
  return { id: g.id, name: g.name, targetCents: g.targetCents, deadline: g.deadline, status: g.status, deletedOn: g.deletedOn, family }
}

// Metas da família atual em que a pessoa tem movimento (só o nome e o valor da
// meta, que são da família toda; as partes dos outros nunca são lidas).
async function loadFamilyGoals(supabase: SupabaseClient, userId: string, familyId: string): Promise<ExportGoal[]> {
  const [goals, mine] = await Promise.all([
    allPages<GoalRawRow>((from, to) =>
      supabase.from('goals').select(GOAL_COLUMNS).eq('family_id', familyId).order('created_at').order('id').range(from, to),
    ),
    allPages<{ goal_id: string }>((from, to) =>
      supabase.from('goal_movements').select('goal_id').eq('user_id', userId).order('id').range(from, to),
    ),
  ])
  const ids = new Set(mine.map((m) => m.goal_id))
  return goals.filter((g) => ids.has(g.id)).map((g) => toExportGoal(g, true))
}

export async function loadExportData({ supabase, user }: ExportScope): Promise<ExportData> {
  const uid = user.id

  const [profile, categories, cards, recurrences, plans, goals, budgets, prefs, membership] = await Promise.all([
    loadProfile(supabase, user),
    allPages<Raw>((from, to) =>
      supabase.from('categories').select('id, name, default_key, sort_order').eq('user_id', uid).order('sort_order').order('id').range(from, to),
    ),
    allPages<CardRawRow>((from, to) =>
      supabase.from('cards').select(CARD_COLUMNS).eq('user_id', uid).order('created_at').order('id').range(from, to),
    ),
    allPages<RecurrenceRawRow & RecurrenceExtra>((from, to) =>
      supabase.from('recurrences').select(`${RECURRENCE_COLUMNS}, family_id, note, payment_method, card_id`).eq('user_id', uid).order('name').order('id').range(from, to),
    ),
    allPages<PlanRawRow>((from, to) =>
      supabase.from('installment_plans').select(PLAN_COLUMNS).eq('user_id', uid).order('purchased_on').order('id').range(from, to),
    ),
    allPages<GoalRawRow>((from, to) =>
      supabase.from('goals').select(GOAL_COLUMNS).eq('user_id', uid).order('created_at').order('id').range(from, to),
    ),
    allPages<BudgetRawRow>((from, to) =>
      supabase.from('budgets').select(BUDGET_COLUMNS).eq('user_id', uid).order('month').order('category_id').range(from, to),
    ),
    supabase.from('notification_prefs').select('kind, enabled').eq('user_id', uid),
    loadFamily(supabase, uid),
  ])
  if (prefs.error) throw prefs.error

  const familyGoals = membership ? await loadFamilyGoals(supabase, uid, membership.id) : []

  return {
    profile,
    categories: orderCategories(
      categories.map((c) => ({
        id: c.id as string,
        name: c.name as string,
        defaultKey: c.default_key as string | null,
        sortOrder: c.sort_order as number,
      })),
    ).map(({ id, name }) => ({ id, name })),
    cards: cards.map(toCardRow),
    recurrences: recurrences.map((r) => ({ ...toRecurrenceRow(r), familyId: r.family_id, note: r.note, paymentMethod: r.payment_method, cardId: r.card_id })),
    plans: plans.map(toPlanRow),
    goals: [...goals.map((g) => toExportGoal(g, false)), ...familyGoals],
    budgets: budgets.map(toBudgetRow),
    prefs: resolvePrefs((prefs.data ?? []) as { kind: string; enabled: boolean }[]),
    family: membership?.info ?? null,
  }
}

// Mesma ordem de loadLedger. Não usa personalLedger: a conta da família que a
// pessoa criou e ainda não foi paga é linha dela e entra no arquivo.
export async function* exportTransactionPages({ supabase, user }: ExportScope): AsyncGenerator<TxRow[]> {
  for await (const page of pagesOf<TxRawRow>((from, to) =>
    supabase
      .from('transactions')
      .select(TX_COLUMNS)
      .eq('user_id', user.id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )) {
    yield page.map(toTxRow)
  }
}

export async function* exportMovementPages({ supabase, user }: ExportScope): AsyncGenerator<GoalMovementRow[]> {
  for await (const page of pagesOf<GoalMovementRawRow>((from, to) =>
    supabase
      .from('goal_movements')
      .select(MOVEMENT_COLUMNS)
      .eq('user_id', user.id)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )) {
    yield page.map(toMovementRow)
  }
}
