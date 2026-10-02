import { expect, test } from 'vitest'
import type { GoalMovementRow } from '@/features/metas/types'
import type { TxRow } from '@/features/registro/tx-row'
import type { ExportData } from './export-queries'
import { exportCsv, exportFileName } from './export-csv'

const base: TxRow = {
  id: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90', kind: 'expense', amountCents: 14230, categoryId: 'c-mercado', source: null, note: null,
  paymentMethod: null, occurredOn: '2026-10-02', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0,
  createdAt: '2026-10-02T12:00:00Z', cardId: null, cardDeleted: false, installmentPlanId: null, installmentNumber: null,
  installmentCount: null, goalId: null, familyId: null,
}
const data: ExportData = {
  profile: { displayName: 'Camila', email: 'camila@teste.iris.dev', initialBalanceCents: 100000, createdOn: '2026-09-01' },
  categories: [{ id: 'c-casa', name: 'Casa' }, { id: 'c-mercado', name: 'Mercado' }, { id: 'c-lazer', name: 'Lazer' }, { id: 'c-extras', name: '+Extras' }],
  cards: [{ id: 'k1', nickname: 'Roxinho', kind: 'credit', color: 'purple' }],
  recurrences: [{
    id: 'r1', kind: 'expense', name: 'Luz', amountCents: 18000, categoryId: 'c-casa', source: null, frequency: 'monthly',
    dueDay: 10, dueMonth: null, startsOn: '2026-09-01', endedOn: null, familyId: null,
  }],
  plans: [{ id: 'p1', totalCents: 60000, count: 6, purchasedOn: '2026-09-02', status: 'active', closedOn: null }],
  goals: [
    { id: 'g1', name: 'Viagem', targetCents: 400000, deadline: '2027-03', status: 'active', deletedOn: null, family: false },
    { id: 'g2', name: '@casa', targetCents: 100000, deadline: null, status: 'active', deletedOn: '2026-09-20', family: false },
  ],
  budgets: [{ month: '2026-10', categoryId: 'c-mercado', amountCents: 80000 }],
  prefs: { bills: true, income: true, budget: true, goal: true, summary: true, daily: false, comeback: true, family: true },
  family: null,
}
const txs: TxRow[] = [
  { ...base, note: '=1+1', cardId: 'k1', installmentPlanId: 'p1', installmentNumber: 2, installmentCount: 6, familyId: 'f1' },
  { ...base, id: 't2', kind: 'income', amountCents: 500000, categoryId: null, source: 'Salário', occurredOn: '2026-10-01' },
  { ...base, id: 't3', amountCents: 18000, categoryId: 'c-casa', occurredOn: '2026-10-10', status: 'pending', dueOn: '2026-10-10' },
  { ...base, id: 't4', amountCents: 150000, categoryId: 'c-lazer', occurredOn: '2026-09-30', goalId: 'g1', goalFundedCents: 100000 },
  { ...base, id: 't5', amountCents: 990, categoryId: 'c-extras', note: 'diz "oi"; fim\nsegunda linha', paymentMethod: 'pix' },
]
const moves: GoalMovementRow[] = [
  { id: 'm1', goalId: 'g1', kind: 'deposit', amountCents: 100000, occurredOn: '2026-09-15', transactionId: null, createdAt: '2026-09-15T12:00:00Z' },
  { id: 'm2', goalId: 'outra-familia', kind: 'return_on_exit', amountCents: 5000, occurredOn: '2026-09-18', transactionId: null, createdAt: '2026-09-18T12:00:00Z' },
]

async function* pages<T>(...p: T[][]) {
  for (const page of p) yield page
}
async function build(d: ExportData = data): Promise<string> {
  let out = ''
  for await (const part of exportCsv(d, pages(txs.slice(0, 3), txs.slice(3)), pages(moves))) out += part
  return out
}
const TITLES = ['Cadastro', 'Registros', 'Contas e entradas que se repetem', 'Compras parceladas', 'Cartões', 'Metas', 'Movimentos das metas', 'Planejamento', 'Categorias', 'Lembretes']

test('nome do arquivo sem dado pessoal', () => {
  expect(exportFileName('2026-10-02')).toBe('iris-meus-dados-2026-10-02.csv')
})

test('começa com a marca de UTF-8, tem os blocos na ordem e toda linha termina em \\r\\n', async () => {
  const csv = await build()
  expect(csv.startsWith('﻿"Cadastro"\r\n')).toBe(true)
  const positions = TITLES.map((t) => (csv.indexOf(`\r\n"${t}"\r\n`) === -1 ? csv.indexOf(`"${t}"\r\n`) : csv.indexOf(`\r\n"${t}"\r\n`)))
  expect(positions.every((p) => p >= 0)).toBe(true)
  expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  expect(csv).not.toContain('"Família"\r\n')
  expect(csv.endsWith('\r\n')).toBe(true)
  expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  expect(csv).not.toMatch(/undefined|null|NaN|\[object/)
  // nenhum identificador interno
  expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  expect(csv).not.toContain('k1')
})

test('cadastro e registros: cabeçalho e linhas exatas', async () => {
  const csv = await build()
  expect(csv).toContain('"Nome";"E-mail";"Quanto você tinha ao começar";"Cadastro criado em"\r\n"Camila";"camila@teste.iris.dev";1000,00;01/09/2026\r\n\r\n')
  expect(csv).toContain(
    '"Data";"Tipo";"Situação";"Valor";"Categoria";"De onde veio";"Nota";"Como pagou";"Parcela";"Gasto da família";"Pago com a meta";"Parte paga pela meta";"Vencimento"\r\n',
  )
  // uma nota com fórmula sai neutralizada na linha do registro
  expect(csv).toContain(`02/10/2026;"Gasto";"Confirmado";142,30;"Mercado";;"'=1+1";"Roxinho";"2 de 6";"Sim";;;\r\n`)
  expect(csv).toContain('01/10/2026;"Entrada";"Confirmado";5000,00;;"Salário";;;;"Não";;;\r\n')
  expect(csv).toContain('10/10/2026;"Gasto";"A pagar";180,00;"Casa";;;;;"Não";;;10/10/2026\r\n')
  expect(csv).toContain('30/09/2026;"Gasto";"Confirmado";1500,00;"Lazer";;;;;"Não";"Viagem";1000,00;\r\n')
  expect(csv).toContain(`02/10/2026;"Gasto";"Confirmado";9,90;"'+Extras";;"diz ""oi""; fim segunda linha";"Pix";;"Não";;;\r\n`)
})

test('os outros blocos', async () => {
  const csv = await build()
  expect(csv).toContain('"Luz";"Conta";180,00;"Casa";;"Todo mês";10;;01/09/2026;;"Não"\r\n')
  expect(csv).toContain('02/09/2026;600,00;6;"Em andamento";\r\n')
  expect(csv).toContain('"Roxinho";"Crédito";"Roxo"\r\n')
  expect(csv).toContain('"Viagem";4000,00;03/2027;"Ativa";"Não"\r\n')
  expect(csv).toContain(`"'@casa";1000,00;;"Excluída";"Não"\r\n`)
  expect(csv).toContain('15/09/2026;"Viagem";"Guardou";1000,00\r\n')
  expect(csv).toContain('18/09/2026;"Meta da família";"Voltou ao sair da família";50,00\r\n')
  expect(csv).toContain('10/2026;"Mercado";800,00\r\n')
  expect(csv).toContain('"Lembrete";"Ligado"\r\n"Contas perto do vencimento";"Sim"\r\n')
  expect(csv).toContain('"Lembrete para anotar";"Não"\r\n')
  expect(csv.match(/";"(Sim|Não)"\r\n/g)!.length).toBeGreaterThanOrEqual(8)
})

test('com família, o último bloco é o dela; bloco vazio fica só com título e cabeçalho', async () => {
  const csv = await build({ ...data, cards: [], family: { name: 'Família Souza', role: 'admin', joinedOn: '2026-09-10' } })
  expect(csv).toContain('"Cartões"\r\n"Apelido";"Tipo";"Cor"\r\n\r\n')
  expect(csv.endsWith('"Família"\r\n"Família";"Papel";"Desde"\r\n"Família Souza";"Administra";10/09/2026\r\n\r\n')).toBe(true)
})

test('erro numa página de registros interrompe o arquivo', async () => {
  async function* broken(): AsyncGenerator<TxRow[]> {
    yield txs.slice(0, 1)
    throw new Error('caiu')
  }
  const it = exportCsv(data, broken(), pages(moves))
  let failed = false
  try {
    for await (const _part of it) void _part
  } catch {
    failed = true
  }
  expect(failed).toBe(true)
})
