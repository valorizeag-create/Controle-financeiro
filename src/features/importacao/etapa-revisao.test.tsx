// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('./actions', () => ({ saveImport: vi.fn() }))

import { EtapaRevisao } from './etapa-revisao'
import { saveImport } from './actions'
import type { ExistingTx, ReviewLine } from '@/domain/importacao/revisar'
import type { ImportContext } from './queries'

const MERCADO = '00000000-0000-4000-8000-000000000001'
const CASA = '00000000-0000-4000-8000-000000000002'
const OUTROS = '00000000-0000-4000-8000-000000000009'
const categories = [
  { id: MERCADO, name: 'Mercado', defaultKey: 'mercado' },
  { id: CASA, name: 'Casa', defaultKey: 'casa' },
  { id: OUTROS, name: 'Outros', defaultKey: 'outros' },
]

let n = 0
function line(over: Partial<ReviewLine>): ReviewLine {
  n++
  return {
    importKey: n.toString(16).padStart(64, '0'),
    date: '2026-10-05',
    description: `LOJA ${n}`,
    note: `Loja ${n}`,
    merchantKey: `loja ${n}`,
    amountCents: 1000 * n,
    kind: 'expense',
    categoryId: null,
    source: null,
    checked: true,
    reason: null,
    similarTxId: null,
    billId: null,
    ...over,
  }
}

function existingTx(over: Partial<ExistingTx>): ExistingTx {
  return {
    id: 'tx', kind: 'expense', amountCents: 0, categoryId: null, source: null, note: null, paymentMethod: null,
    occurredOn: '2026-10-01', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, createdAt: '2026-10-01T00:00:00Z',
    cardId: null, cardDeleted: false, installmentPlanId: null, installmentNumber: null, installmentCount: null, goalId: null, familyId: null,
    importKey: null, ...over,
  }
}

function ctx(existing: ExistingTx[] = [], cats = categories): ImportContext {
  return { categories: cats, cards: [], existing, usedKeys: [], rules: [] }
}

function show(lines: ReviewLine[], opts: { alreadyImported?: number; skipped?: number; context?: ImportContext; cardId?: string | null } = {}) {
  return render(
    <EtapaRevisao
      lines={lines}
      alreadyImported={opts.alreadyImported ?? 0}
      skipped={opts.skipped ?? 0}
      context={opts.context ?? ctx()}
      cardId={opts.cardId ?? null}
      today="2026-10-09"
    />,
  )
}

const save = () => screen.getByRole('button', { name: /^Anotar/ })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('sem categoria vêm primeiro, destacadas; "Anotar" só liga depois de escolher', () => {
  const sem = line({ description: 'LOJA SEM', note: 'Loja Sem', amountCents: 2550, date: '2026-10-03' })
  const com = line({ description: 'MERCADO BOM', note: 'Mercado Bom', amountCents: 4000, categoryId: MERCADO, date: '2026-10-05' })
  show([sem, com])
  const rows = screen.getAllByRole('listitem')
  expect(within(rows[0]).getByText('Loja Sem')).toBeTruthy()
  expect(rows[0].getAttribute('data-sem-categoria')).toBe('true')
  expect(rows[1].getAttribute('data-sem-categoria')).toBeNull()
  // Lista por dia, com títulos.
  expect(screen.getByRole('heading', { name: '3 de outubro' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: '5 de outubro' })).toBeTruthy()
  expect(save()).toHaveProperty('disabled', true)
  expect(save().textContent).toBe('Anotar 2 registros')
  const select = screen.getByRole('combobox', { name: /Loja Sem.*25,50/ })
  expect((select as HTMLSelectElement).value).toBe('')
  expect(within(select).getByRole('option', { name: 'Escolha a categoria' })).toBeTruthy()
  fireEvent.change(select, { target: { value: CASA } })
  expect(save()).toHaveProperty('disabled', false)
  // A linha não sai do lugar depois de escolher.
  expect(within(screen.getAllByRole('listitem')[0]).getByText('Loja Sem')).toBeTruthy()
})

test('"Pôr em Outros as 2 sem categoria" liga o botão; desmarcar muda resumo e número', () => {
  show([
    line({}),
    line({}),
    line({ categoryId: MERCADO }),
    line({ kind: 'income', source: 'Salário', description: 'SALARIO', note: 'Salario' }),
  ])
  expect(screen.getByText('3 gastos · 1 entrada')).toBeTruthy()
  expect(save().textContent).toBe('Anotar 4 registros')
  expect(save()).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: 'Pôr em Outros as 2 sem categoria' }))
  expect(save()).toHaveProperty('disabled', false)
  expect(screen.queryByRole('button', { name: /^Pôr em Outros/ })).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: /Salario/ }))
  expect(screen.getByText('3 gastos · 0 entradas')).toBeTruthy()
  expect(save().textContent).toBe('Anotar 3 registros')
})

test('desmarcar a única linha sem categoria também libera o botão; nenhuma marcada desliga', () => {
  show([line({ note: 'Sem Nada' }), line({ categoryId: MERCADO })])
  expect(save()).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('checkbox', { name: /Sem Nada/ }))
  expect(save()).toHaveProperty('disabled', false)
  expect(screen.getByText('1 gasto · 0 entradas')).toBeTruthy()
  expect(save().textContent).toBe('Anotar 1 registro')
  fireEvent.click(screen.getAllByRole('checkbox')[1])
  expect(save()).toHaveProperty('disabled', true)
})

test('sem a categoria Outros, a ação em massa não aparece', () => {
  show([line({})], { context: ctx([], categories.filter((c) => c.defaultKey !== 'outros')) })
  expect(screen.queryByRole('button', { name: /^Pôr em Outros/ })).toBeNull()
})

test('trocar gasto por entrada mostra a origem e deixa escolher', () => {
  show([line({ note: 'Pix Ana', amountCents: 5000 })])
  const row = screen.getAllByRole('listitem')[0]
  fireEvent.click(within(row).getByRole('radio', { name: 'Entrada' }))
  const origem = within(row).getByRole('combobox', { name: /Pix Ana/ }) as HTMLSelectElement
  expect([...origem.options].map((o) => o.value)).toEqual(['', 'Salário', 'Freela', 'Presente', 'Outros'])
  fireEvent.change(origem, { target: { value: 'Freela' } })
  expect(screen.getByText('0 gastos · 1 entrada')).toBeTruthy()
  expect(save()).toHaveProperty('disabled', false)
})

test('motivos: já anotada, fatura, transferência, pagamento no cartão; começam desmarcadas e dá para marcar', () => {
  const manual = existingTx({ id: 'm1', kind: 'expense', amountCents: 3990, categoryId: MERCADO, occurredOn: '2026-10-04' })
  show(
    [
      line({ reason: 'ja-anotada', checked: false, similarTxId: 'm1', note: 'Mercado X', categoryId: MERCADO }),
      line({ reason: 'fatura', checked: false, note: 'Pag Fatura' }),
      line({ reason: 'transferencia', checked: false, note: 'Aplicacao' }),
      line({ reason: 'pagamento-fatura-no-cartao', checked: false, kind: 'income', note: 'Pagamento Recebido' }),
    ],
    { context: ctx([manual]) },
  )
  expect(screen.getByText('Parece que você já anotou isto: Mercado, R$ 39,90, 04/10/2026')).toBeTruthy()
  expect(screen.getByText('Pagamento de fatura: as compras do cartão já contam uma a uma.')).toBeTruthy()
  expect(screen.getByText('Parece dinheiro entre suas contas.')).toBeTruthy()
  expect(screen.getByText('Pagamento da própria fatura: não é gasto.')).toBeTruthy()
  for (const box of screen.getAllByRole('checkbox')) expect((box as HTMLInputElement).checked).toBe(false)
  expect(save()).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('checkbox', { name: /Mercado X/ }))
  expect(save().textContent).toBe('Anotar 1 registro')
  expect(save()).toHaveProperty('disabled', false)
})

test('conta a pagar: "Marcar {conta} como paga" vai no salvamento com o billId', async () => {
  const BILL = '00000000-0000-4000-8000-0000000000b1'
  const bill = existingTx({ id: BILL, status: 'pending', note: 'Aluguel', amountCents: 150000, dueOn: '2026-10-05', categoryId: CASA })
  show([line({ billId: BILL, categoryId: CASA, amountCents: 150000, note: 'Ted Imobiliaria', merchantKey: '' })], { context: ctx([bill]), cardId: null })
  expect(screen.getByText('Marcar Aluguel como paga')).toBeTruthy()
  expect(screen.queryByRole('combobox')).toBeNull()
  fireEvent.click(save())
  await waitFor(() => expect(saveImport).toHaveBeenCalledTimes(1))
  expect(vi.mocked(saveImport).mock.calls[0][0]).toEqual({
    cardId: null,
    lines: [expect.objectContaining({ billId: BILL, categoryId: CASA, kind: 'expense', amountCents: 150000, merchantKey: null, note: 'Ted Imobiliaria' })],
  })
})

test('contagens de linhas escondidas, no plural e no singular', () => {
  show([line({ categoryId: MERCADO })], { alreadyImported: 12, skipped: 3 })
  expect(screen.getByText('12 linhas já importadas antes.')).toBeTruthy()
  expect(screen.getByText('3 linhas que a Íris não entendeu.')).toBeTruthy()
  cleanup()
  show([line({ categoryId: MERCADO })], { alreadyImported: 1, skipped: 1 })
  expect(screen.getByText('1 linha já importada antes.')).toBeTruthy()
  expect(screen.getByText('1 linha que a Íris não entendeu.')).toBeTruthy()
})

test('nenhuma linha no período', () => {
  show([], { alreadyImported: 2 })
  expect(screen.getByText('Nenhum registro neste período.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Anotar/ })).toBeNull()
})

test('erro ao salvar aparece e o botão volta a funcionar', async () => {
  vi.mocked(saveImport).mockResolvedValueOnce({ status: 'error', message: 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.' })
  show([line({ categoryId: MERCADO })])
  fireEvent.click(save())
  // Desliga na hora: um segundo toque não salva de novo.
  expect(save()).toHaveProperty('disabled', true)
  fireEvent.click(save())
  expect((await screen.findByRole('alert')).textContent).toBe('Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.')
  expect(saveImport).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(save()).toHaveProperty('disabled', false))
})

test('o rodapé fica preso embaixo, com a área segura', () => {
  show([line({ categoryId: MERCADO })])
  const footer = save().closest('footer') as HTMLElement
  expect(footer.className).toContain('sticky')
  expect(footer.className).toContain('bottom-0')
  expect(footer.className).toContain('pb-[env(safe-area-inset-bottom)]')
})
