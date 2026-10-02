// Avisos do celular: tipos, preferências e destino do toque. Sem banco nem tela.

export const NOTIFICATION_KINDS = [
  'bill_tomorrow', 'bill_today', 'income_today', 'budget_near', 'goal_near',
  'month_summary', 'daily_reminder', 'comeback', 'family_event',
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const PREF_KINDS = ['bills', 'income', 'budget', 'goal', 'summary', 'daily', 'comeback', 'family'] as const
export type PrefKind = (typeof PREF_KINDS)[number]

const PREF_OF: Record<NotificationKind, PrefKind> = {
  bill_tomorrow: 'bills',
  bill_today: 'bills',
  income_today: 'income',
  budget_near: 'budget',
  goal_near: 'goal',
  month_summary: 'summary',
  daily_reminder: 'daily',
  comeback: 'comeback',
  family_event: 'family',
}

export function prefOf(kind: NotificationKind): PrefKind {
  return PREF_OF[kind]
}

// Tudo ligado, menos o lembrete para anotar (RF-47).
export const PREF_DEFAULTS: Record<PrefKind, boolean> = {
  bills: true, income: true, budget: true, goal: true, summary: true, daily: false, comeback: true, family: true,
}

export const PREF_LABELS: Record<PrefKind, string> = {
  bills: 'Contas perto do vencimento',
  income: 'Entradas a receber',
  budget: 'Planejado quase no limite',
  goal: 'Meta perto de ser concluída',
  summary: 'Resumo do mês',
  daily: 'Lembrete para anotar',
  comeback: 'Depois de alguns dias sem registro',
  family: 'Avisos da família',
}

export const PREF_ORDER: PrefKind[] = ['bills', 'income', 'budget', 'goal', 'summary', 'comeback', 'family', 'daily']

export function isPrefKind(v: unknown): v is PrefKind {
  return typeof v === 'string' && (PREF_KINDS as readonly string[]).includes(v)
}

// Linha gravada vence o padrão; tipo desconhecido é ignorado.
export function resolvePrefs(rows: { kind: string; enabled: boolean }[]): Record<PrefKind, boolean> {
  const out = { ...PREF_DEFAULTS }
  for (const r of rows) if (isPrefKind(r.kind)) out[r.kind] = r.enabled === true
  return out
}

export const COMEBACK_DAYS = 5
export const GOAL_NEAR_TENTHS = 1 // falta no máximo 1/10 do valor da meta
export const REMINDER_HOUR = 9 // contas e entradas, às 9h de Brasília
export const DAILY_REMINDER_HOUR = 21 // lembrete para anotar, às 21h de Brasília

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const MONTH = '20\\d{2}-(0[1-9]|1[0-2])'
const TARGETS = [
  /^\/(inicio|anotar|planejamento|familia)$/,
  /^\/relatorios\?periodo=mes-passado$/,
  new RegExp(`^/contas\\?mes=${MONTH}(&pagar=${UUID})?$`),
  new RegExp(`^/familia/contas\\?pagar=${UUID}$`),
  new RegExp(`^/metas/${UUID}$`),
]

// Destino do toque no aviso: só caminho interno, de formatos fixos.
export function isAllowedTarget(path: string): boolean {
  if (typeof path !== 'string' || path.length > 200) return false
  if (/[\\\u0000-\u001f\u007f%]/.test(path)) return false
  return TARGETS.some((re) => re.test(path))
}
