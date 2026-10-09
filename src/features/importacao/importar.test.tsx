// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('./actions', () => ({ loadContextAction: vi.fn(), saveImport: vi.fn() }))
vi.mock('./ler-pdf', () => ({ readPdf: vi.fn() }))

import { Importar } from './importar'
import { loadContextAction, saveImport } from './actions'
import { readPdf } from './ler-pdf'
import type { ImportContext } from './queries'

const OUTROS = '00000000-0000-4000-8000-000000000009'
const CARD = '00000000-0000-4000-8000-0000000000c1'
const context: ImportContext = {
  categories: [
    { id: '00000000-0000-4000-8000-000000000001', name: 'Mercado', defaultKey: 'mercado' },
    { id: OUTROS, name: 'Outros', defaultKey: 'outros' },
  ],
  cards: [],
  existing: [],
  usedKeys: [],
  rules: [],
}
const cards = [{ id: CARD, nickname: 'Roxinho', kind: 'credit' as const, color: 'purple' as const, brand: null }]

const CSV = 'Data;Descrição;Valor\n01/10/2026;LOJA ALFA;-10,00\n02/10/2026;LOJA BETA;-20,00\n03/10/2026;SALARIO EMPRESA;1.000,00\n'

function choose(file: File) {
  fireEvent.change(screen.getByLabelText(/Escolher arquivo/), { target: { files: [file] } })
}

beforeEach(() => {
  vi.mocked(loadContextAction).mockResolvedValue(context)
  vi.mocked(saveImport).mockResolvedValue({ status: 'error', message: 'x' })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('escolher um CSV mostra o período encontrado e o botão de ver', async () => {
  render(<Importar cards={cards} today="2026-10-09" />)
  expect(screen.getByRole('heading', { name: 'Importar extrato' })).toBeTruthy()
  expect(screen.getByText('PDF, CSV ou OFX, até 5 MB.')).toBeTruthy()
  expect(screen.getByText('O arquivo é lido aqui no seu aparelho. Só os registros que você confirmar são salvos.')).toBeTruthy()
  choose(new File([CSV], 'extrato.csv', { type: 'text/csv' }))
  const de = (await screen.findByLabelText('De')) as HTMLInputElement
  const ate = screen.getByLabelText('Até') as HTMLInputElement
  expect(de.value).toBe('2026-10-01')
  expect(ate.value).toBe('2026-10-03')
  expect(de.min).toBe('2026-10-01')
  expect(ate.max).toBe('2026-10-03')
  expect(screen.getByRole('button', { name: 'Ver o que a Íris encontrou' })).toBeTruthy()
})

test('arquivo .txt e arquivo grande demais mostram a mensagem certa', async () => {
  render(<Importar cards={cards} today="2026-10-09" />)
  choose(new File(['x'], 'notas.txt'))
  expect((await screen.findByRole('alert')).textContent).toBe('Escolha um arquivo PDF, CSV ou OFX.')
  choose(new File([new Uint8Array(6 * 1024 * 1024)], 'grande.CSV'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Este arquivo passa de 5 MB. Escolha um período menor no app do banco.'))
})

test('PDF com senha, PDF sem texto e PDF sem lançamentos', async () => {
  render(<Importar cards={cards} today="2026-10-09" />)
  vi.mocked(readPdf).mockResolvedValueOnce({ error: 'senha' })
  choose(new File(['%PDF'], 'extrato.pdf'))
  expect((await screen.findByRole('alert')).textContent).toBe('Este PDF tem senha. Baixe de novo sem senha, ou use o CSV ou o OFX.')
  vi.mocked(readPdf).mockResolvedValueOnce({ error: 'sem-texto' })
  choose(new File(['%PDF'], 'extrato.pdf'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não conseguimos ler este PDF. Tente o arquivo CSV ou OFX do seu banco.'))
  vi.mocked(readPdf).mockResolvedValueOnce({ lines: [], skipped: 4 })
  choose(new File(['%PDF'], 'outro.pdf'))
  await waitFor(() => expect(readPdf).toHaveBeenCalledTimes(3))
  expect(screen.getByRole('alert').textContent).toBe('Não conseguimos ler este PDF. Tente o arquivo CSV ou OFX do seu banco.')
})

test('PDF lido chega ao período', async () => {
  vi.mocked(readPdf).mockResolvedValueOnce({ lines: [{ date: '2026-09-05', description: 'LOJA ALFA', amountCents: 1000, direction: 'out' }], skipped: 0 })
  render(<Importar cards={cards} today="2026-10-09" />)
  choose(new File(['%PDF'], 'Extrato.PDF'))
  expect(((await screen.findByLabelText('De')) as HTMLInputElement).value).toBe('2026-09-05')
})

test('OFX é lido no aparelho', async () => {
  const ofx = '<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260904<TRNAMT>-12.50<MEMO>LOJA GAMA</STMTTRN></OFX>'
  render(<Importar cards={cards} today="2026-10-09" />)
  choose(new File([ofx], 'extrato.ofx'))
  expect(((await screen.findByLabelText('Até')) as HTMLInputElement).value).toBe('2026-09-04')
})

test('CSV com cabeçalho desconhecido abre o ajuste de colunas e depois a revisão', async () => {
  const csv = 'quando;o que;quanto\n01/10/2026;LOJA ALFA;-10,00\n02/10/2026;LOJA BETA;-20,00\n'
  render(<Importar cards={cards} today="2026-10-09" />)
  choose(new File([csv], 'banco.csv'))
  expect(await screen.findByText('Qual coluna é a data? E a descrição? E o valor?')).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'LOJA ALFA' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Data'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Usar estas colunas' }))
  expect(((await screen.findByLabelText('De')) as HTMLInputElement).value).toBe('2026-10-01')
  fireEvent.click(screen.getByRole('button', { name: 'Ver o que a Íris encontrou' }))
  expect(await screen.findByRole('button', { name: 'Anotar 2 registros' })).toBeTruthy()
})

test('o período escolhido fica dentro do arquivo e é o que a revisão usa', async () => {
  render(<Importar cards={cards} today="2026-10-09" />)
  choose(new File([CSV], 'extrato.csv'))
  const de = (await screen.findByLabelText('De')) as HTMLInputElement
  fireEvent.change(de, { target: { value: '2026-09-01' } })
  expect(de.value).toBe('2026-10-01')
  fireEvent.change(de, { target: { value: '2026-10-02' } })
  fireEvent.click(screen.getByRole('button', { name: 'Ver o que a Íris encontrou' }))
  await waitFor(() => expect(loadContextAction).toHaveBeenCalledWith('2026-10-02', '2026-10-03'))
  expect(await screen.findByRole('button', { name: 'Anotar 2 registros' })).toBeTruthy()
})

test('se o contexto não carrega, mostra o aviso de erro', async () => {
  vi.mocked(loadContextAction).mockRejectedValueOnce(new Error('falhou'))
  render(<Importar cards={cards} today="2026-10-09" />)
  choose(new File([CSV], 'extrato.csv'))
  fireEvent.click(await screen.findByRole('button', { name: 'Ver o que a Íris encontrou' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Algo não saiu como esperado do nosso lado. Tente novamente em instantes.')
})

test('do cartão: "Anotar 3 registros" salva as 3 linhas com o cartão escolhido', async () => {
  render(<Importar cards={cards} today="2026-10-09" />)
  expect(screen.getByText('De onde é este extrato?')).toBeTruthy()
  expect((screen.getByRole('radio', { name: 'Conta do banco' }) as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByRole('radio', { name: 'Roxinho' }))
  choose(new File([CSV], 'extrato.csv'))
  fireEvent.click(await screen.findByRole('button', { name: 'Ver o que a Íris encontrou' }))
  const save = await screen.findByRole('button', { name: 'Anotar 3 registros' })
  expect(save).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: 'Pôr em Outros as 2 sem categoria' }))
  expect(save).toHaveProperty('disabled', false)
  fireEvent.click(save)
  await waitFor(() => expect(saveImport).toHaveBeenCalledTimes(1))
  const payload = vi.mocked(saveImport).mock.calls[0][0] as { cardId: string; lines: Array<Record<string, unknown>> }
  expect(payload.cardId).toBe(CARD)
  expect(payload.lines).toHaveLength(3)
  const gasto = payload.lines.find((l) => l.amountCents === 1000)!
  expect(gasto).toMatchObject({ kind: 'expense', occurredOn: '2026-10-01', categoryId: OUTROS, source: null, billId: null, note: 'Loja Alfa', merchantKey: 'loja alfa' })
  expect(gasto.importKey).toMatch(/^[0-9a-f]{64}$/)
  expect(payload.lines.find((l) => l.amountCents === 100000)).toMatchObject({ kind: 'income', source: 'Salário', categoryId: null })
})

test('Voltar na revisão volta para o arquivo, sem perder o período', async () => {
  render(<Importar cards={cards} today="2026-10-09" />)
  choose(new File([CSV], 'extrato.csv'))
  fireEvent.click(await screen.findByRole('button', { name: 'Ver o que a Íris encontrou' }))
  await screen.findByRole('button', { name: 'Anotar 3 registros' })
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  expect(((await screen.findByLabelText('De')) as HTMLInputElement).value).toBe('2026-10-01')
})

test('ajuste de colunas que não acha linhas avisa', async () => {
  const csv = 'quando;o que;quanto\n01/10/2026;LOJA ALFA;-10,00\n'
  render(<Importar cards={cards} today="2026-10-09" />)
  choose(new File([csv], 'banco.csv'))
  await screen.findByText('Qual coluna é a data? E a descrição? E o valor?')
  fireEvent.change(screen.getByLabelText('Data'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Usar estas colunas' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Nenhum registro neste período.')
  expect(screen.getByRole('button', { name: 'Usar estas colunas' })).toBeTruthy()
})

test('erro inesperado ao ler o arquivo mostra o aviso e libera a tela', async () => {
  render(<Importar cards={cards} today="2026-10-09" />)
  // Uma falha fora das previstas (o navegador não entrega o conteúdo do arquivo).
  const file = new File(['x'], 'extrato.csv')
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.reject(new Error('sem acesso')) })
  choose(file)
  expect((await screen.findByRole('alert')).textContent).toBe('Algo não saiu como esperado do nosso lado. Tente novamente em instantes.')
  choose(new File([CSV], 'extrato.csv'))
  expect(await screen.findByRole('button', { name: 'Ver o que a Íris encontrou' })).toHaveProperty('disabled', false)
})

test('trocar a origem enquanto carrega descarta o resultado; a revisão usa a origem da hora em que foi feita', async () => {
  let resolve!: (c: ImportContext) => void
  vi.mocked(loadContextAction).mockImplementationOnce(() => new Promise((r) => (resolve = r)))
  render(<Importar cards={cards} today="2026-10-09" />)
  choose(new File([CSV], 'extrato.csv'))
  fireEvent.click(await screen.findByRole('button', { name: 'Ver o que a Íris encontrou' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Roxinho' }))
  resolve(context)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver o que a Íris encontrou' })).toHaveProperty('disabled', false))
  expect(screen.queryByRole('button', { name: /^Anotar/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ver o que a Íris encontrou' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Pôr em Outros as 2 sem categoria' }))
  fireEvent.click(screen.getByRole('button', { name: 'Anotar 3 registros' }))
  await waitFor(() => expect(saveImport).toHaveBeenCalledTimes(1))
  expect(vi.mocked(saveImport).mock.calls[0][0]).toMatchObject({ cardId: CARD })
})

test('cartão e depois conta do banco: salva sem cartão', async () => {
  render(<Importar cards={cards} today="2026-10-09" />)
  fireEvent.click(screen.getByRole('radio', { name: 'Roxinho' }))
  choose(new File([CSV], 'extrato.csv'))
  fireEvent.click(await screen.findByRole('button', { name: 'Ver o que a Íris encontrou' }))
  await screen.findByRole('button', { name: 'Anotar 3 registros' })
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  fireEvent.click(await screen.findByRole('radio', { name: 'Conta do banco' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ver o que a Íris encontrou' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Pôr em Outros as 2 sem categoria' }))
  fireEvent.click(screen.getByRole('button', { name: 'Anotar 3 registros' }))
  await waitFor(() => expect(saveImport).toHaveBeenCalledTimes(1))
  expect(vi.mocked(saveImport).mock.calls[0][0]).toMatchObject({ cardId: null })
})
