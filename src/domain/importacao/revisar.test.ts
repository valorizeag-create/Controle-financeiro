import { describe, expect, it } from 'vitest'
import type { Category } from '@/features/registro/queries'
import type { TxRow } from '@/features/registro/tx-row'
import { buildReview, frozenDescription, importKeys } from './revisar'
import type { RawLine } from './tipos'

const categories: Category[] = [{ id: 'c-mercado', name: 'Supermercado', defaultKey: 'mercado' }]

const out = (date: string, description: string, amountCents: number): RawLine => ({ date, description, amountCents, direction: 'out' })
const inn = (date: string, description: string, amountCents: number): RawLine => ({ date, description, amountCents, direction: 'in' })

function tx(p: Partial<TxRow> & { importKey?: string | null }): TxRow & { importKey: string | null } {
  return {
    id: 't1', kind: 'expense', amountCents: 8900, categoryId: null, source: null, note: null, paymentMethod: null,
    occurredOn: '2026-10-05', status: 'confirmed', dueOn: null, paidOn: null, goalFundedCents: 0, createdAt: '2026-10-05T00:00:00Z',
    cardId: null, cardDeleted: false, installmentPlanId: null, installmentNumber: null, installmentCount: null, goalId: null,
    familyId: null, importKey: null, ...p,
  }
}

const base = { from: '2026-10-01', to: '2026-10-31', origin: 'conta' as const, rules: [], categories, existing: [], usedKeys: new Set<string>() }

describe('importKeys', () => {
  it('gera SHA-256 hex, estável, e distingue linhas idênticas', async () => {
    const l = out('2026-10-07', 'PADARIA DO ZE', 1000)
    const a = await importKeys([l, l, out('2026-10-08', 'OUTRA', 5)])
    const b = await importKeys([l, l, out('2026-10-08', 'OUTRA', 5)])
    expect(a).toEqual(b)
    expect(a[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(new Set(a).size).toBe(3)
  })
})

describe('chave de importação congelada', () => {
  it('normalização mínima da descrição: minúsculas, sem acento, espaços colapsados', () => {
    expect(frozenDescription('  Compra no Débito   PADARIA DO ZÉ  SAO PAULO SP ')).toBe('compra no debito padaria do ze sao paulo sp')
  })

  it('valor literal da chave de uma linha fixa (não pode mudar nunca)', async () => {
    const [k] = await importKeys([out('2026-10-07', 'Compra no Débito PADARIA DO ZÉ  SAO PAULO SP', 1234)])
    expect(k).toBe('c4daa9a732587a6b4d40e1b26278f7a081a726389ebdf78c25bd847623fcc84d')
  })
})

describe('buildReview', () => {
  it('inclui from e to e exclui o dia anterior e o seguinte', async () => {
    const r = await buildReview({
      ...base,
      lines: [out('2026-09-30', 'A', 100), out('2026-10-01', 'B', 100), out('2026-10-31', 'C', 100), out('2026-11-01', 'D', 100)],
    })
    expect(r.lines.map((l) => l.description).sort()).toEqual(['B', 'C'])
  })

  it('esconde linhas já importadas e conta', async () => {
    const lines = [out('2026-10-07', 'MERCADO X', 1000), out('2026-10-08', 'OUTRO', 200)]
    const keys = await importKeys(lines)
    const r = await buildReview({ ...base, lines, usedKeys: new Set([keys[0]]) })
    expect(r.alreadyImported).toBe(1)
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].description).toBe('OUTRO')
  })

  it('chaves são estáveis com períodos diferentes', async () => {
    const lines = [out('2026-10-05', 'A', 100), out('2026-10-07', 'PADARIA', 1000), out('2026-10-07', 'PADARIA', 1000), out('2026-10-20', 'B', 5)]
    const wide = await buildReview({ ...base, lines })
    const narrow = await buildReview({ ...base, from: '2026-10-06', to: '2026-10-10', lines })
    const wideKeys = new Set(wide.lines.map((l) => l.importKey))
    expect(narrow.lines).toHaveLength(2)
    for (const l of narrow.lines) expect(wideKeys.has(l.importKey)).toBe(true)
  })

  it('chaves são estáveis com um arquivo maior que o contém', async () => {
    const shared = [out('2026-10-07', 'PADARIA', 1000), out('2026-10-07', 'PADARIA', 1000), out('2026-10-09', 'X', 50)]
    const small = await buildReview({ ...base, lines: shared })
    const big = await buildReview({ ...base, lines: [out('2026-10-01', 'ANTES', 1), ...shared, out('2026-10-30', 'DEPOIS', 2)] })
    const bigKeys = new Set(big.lines.map((l) => l.importKey))
    expect(small.lines).toHaveLength(3)
    for (const l of small.lines) expect(bigKeys.has(l.importKey)).toBe(true)
  })

  it('linhas idênticas em outra ordem dão o mesmo conjunto de chaves', async () => {
    const a = out('2026-10-07', 'PADARIA', 1000)
    const b = out('2026-10-08', 'OUTRA', 20)
    const k1 = (await importKeys([a, b, a, a])).sort()
    const k2 = (await importKeys([a, a, b, a])).sort()
    expect(k1).toEqual(k2)
  })

  it('linha que casa com anotação e com conta pendente fica como já anotada e não consome a conta', async () => {
    const existing = [tx({ id: 'manual', amountCents: 10000, occurredOn: '2026-10-10' }), tx({ id: 'bill', status: 'pending', amountCents: 10000, dueOn: '2026-10-10' })]
    const r = await buildReview({ ...base, lines: [out('2026-10-10', 'A', 10000), out('2026-10-12', 'B', 10000)], existing })
    expect(r.lines.find((l) => l.description === 'A')).toMatchObject({ reason: 'ja-anotada', checked: false, billId: null })
    expect(r.lines.find((l) => l.description === 'B')).toMatchObject({ billId: 'bill', checked: true })
  })

  it('anotação à mão: 2 dias casa, 3 dias não, inclusive na virada de mês', async () => {
    const run = (date: string, occurredOn: string) =>
      buildReview({ ...base, to: '2026-11-30', lines: [out(date, 'X', 8900)], existing: [tx({ occurredOn })] }).then((r) => r.lines[0].reason)
    expect(await run('2026-10-07', '2026-10-05')).toBe('ja-anotada')
    expect(await run('2026-10-08', '2026-10-05')).toBeNull()
    expect(await run('2026-11-01', '2026-10-30')).toBe('ja-anotada')
    expect(await run('2026-11-02', '2026-10-30')).toBeNull()
    expect(await run('2026-11-03', '2026-10-30')).toBeNull()
  })

  it('anotação à mão escolhe a data mais próxima', async () => {
    const existing = [tx({ id: 'B', occurredOn: '2026-10-07' }), tx({ id: 'A', occurredOn: '2026-10-05' })]
    const r = await buildReview({ ...base, lines: [out('2026-10-05', 'L1', 8900), out('2026-10-08', 'L2', 8900)], existing })
    expect(r.lines.find((l) => l.description === 'L1')?.similarTxId).toBe('A')
    expect(r.lines.find((l) => l.description === 'L2')?.similarTxId).toBe('B')
  })

  it('conta pendente: limites de 5 dias e 5%', async () => {
    const run = (date: string, cents: number) =>
      buildReview({ ...base, lines: [out(date, 'X', cents)], existing: [tx({ id: 'bill', status: 'pending', amountCents: 10000, dueOn: '2026-10-10' })] }).then((r) => r.lines[0].billId)
    expect(await run('2026-10-15', 10500)).toBe('bill')
    expect(await run('2026-10-05', 9500)).toBe('bill')
    expect(await run('2026-10-16', 10000)).toBeNull()
    expect(await run('2026-10-10', 10501)).toBeNull()
  })

  it('conta com vencimento no sábado paga na segunda casa', async () => {
    const bill = tx({ id: 'bill', status: 'pending', amountCents: 10000, dueOn: '2026-10-10' })
    const r = await buildReview({ ...base, lines: [out('2026-10-12', 'X', 10000)], existing: [bill] })
    expect(r.lines[0].billId).toBe('bill')
  })

  it('marca como já anotada à mão, uma vez por registro', async () => {
    const r = await buildReview({
      ...base,
      lines: [out('2026-10-07', 'PADARIA', 8900), out('2026-10-07', 'PADARIA', 8900)],
      existing: [tx({ id: 'manual' })],
    })
    const anotadas = r.lines.filter((l) => l.reason === 'ja-anotada')
    expect(anotadas).toHaveLength(1)
    expect(anotadas[0]).toMatchObject({ checked: false, similarTxId: 'manual' })
    const outra = r.lines.find((l) => l.reason === null)!
    expect(outra.checked).toBe(true)
    expect(outra.similarTxId).toBeNull()
  })

  it('não casa com registro importado, pendente, de outro tipo ou a mais de 2 dias', async () => {
    const r = await buildReview({
      ...base,
      lines: [out('2026-10-07', 'PADARIA', 8900)],
      existing: [
        tx({ id: 'b', status: 'pending', dueOn: '2026-10-20' }),
        tx({ id: 'c', kind: 'income' }),
        tx({ id: 'd', occurredOn: '2026-10-04' }),
      ],
    })
    expect(r.lines[0].reason).toBeNull()
  })

  it('casa com conta pendente (até 5%)', async () => {
    const pend = tx({ id: 'bill', status: 'pending', amountCents: 10000, dueOn: '2026-10-10', occurredOn: '2026-10-10', categoryId: 'c-mercado' })
    const r = await buildReview({ ...base, lines: [out('2026-10-12', 'ENERGIA', 10200)], existing: [pend] })
    expect(r.lines[0]).toMatchObject({ billId: 'bill', categoryId: 'c-mercado', checked: true, reason: null })
    const r2 = await buildReview({ ...base, lines: [out('2026-10-12', 'ENERGIA', 12000)], existing: [pend] })
    expect(r2.lines[0].billId).toBeNull()
  })

  it('cada conta pendente casa uma vez só', async () => {
    const pend = tx({ id: 'bill', status: 'pending', amountCents: 10000, dueOn: '2026-10-10' })
    const r = await buildReview({ ...base, lines: [out('2026-10-10', 'A', 10000), out('2026-10-11', 'B', 10000)], existing: [pend] })
    expect(r.lines.filter((l) => l.billId === 'bill')).toHaveLength(1)
  })

  it('fatura e transferência vêm desmarcadas', async () => {
    const r = await buildReview({
      ...base,
      lines: [out('2026-10-05', 'PAGAMENTO FATURA NUBANK', 50000), out('2026-10-06', 'APLICACAO CDB', 30000)],
    })
    expect(r.lines.find((l) => l.description.includes('FATURA'))).toMatchObject({ checked: false, reason: 'fatura' })
    expect(r.lines.find((l) => l.description.includes('APLICACAO'))).toMatchObject({ checked: false, reason: 'transferencia' })
  })

  it('cartão: pagamento desmarcado e estorno vira entrada', async () => {
    const r = await buildReview({
      ...base,
      origin: 'cartao',
      lines: [inn('2026-10-05', 'PAGAMENTO RECEBIDO', 50000), inn('2026-10-06', 'ESTORNO LOJA X', 3000)],
    })
    expect(r.lines.find((l) => l.description === 'PAGAMENTO RECEBIDO')).toMatchObject({ checked: false, reason: 'pagamento-fatura-no-cartao' })
    expect(r.lines.find((l) => l.description.startsWith('ESTORNO'))).toMatchObject({ kind: 'income', checked: true })
  })

  it('cartão Nubank em CSV (compras positivas, pagamento negativo): sentido invertido', async () => {
    const r = await buildReview({
      ...base,
      origin: 'cartao',
      lines: [
        inn('2026-10-03', 'SUPERMERCADO ABC', 4590),
        inn('2026-10-04', 'LOJA QUALQUER', 12000),
        inn('2026-10-04', 'FARMACIA', 2500),
        out('2026-10-05', 'Pagamento recebido', 120000),
        out('2026-10-06', 'Estorno LOJA QUALQUER', 3000),
      ],
    })
    const by = (d: string) => r.lines.find((l) => l.description === d)
    expect(by('SUPERMERCADO ABC')).toMatchObject({ kind: 'expense', checked: true, categoryId: 'c-mercado', reason: null })
    expect(by('LOJA QUALQUER')).toMatchObject({ kind: 'expense', checked: true })
    expect(by('Pagamento recebido')).toMatchObject({ checked: false, reason: 'pagamento-fatura-no-cartao' })
    expect(by('Estorno LOJA QUALQUER')).toMatchObject({ kind: 'income', checked: true })
  })

  it('cartão em OFX (compras negativas): nada muda', async () => {
    const r = await buildReview({
      ...base,
      origin: 'cartao',
      lines: [
        out('2026-10-03', 'SUPERMERCADO ABC', 4590),
        out('2026-10-04', 'LOJA QUALQUER', 12000),
        inn('2026-10-05', 'PAGAMENTO RECEBIDO', 120000),
        inn('2026-10-06', 'ESTORNO LOJA', 3000),
      ],
    })
    const by = (d: string) => r.lines.find((l) => l.description === d)
    expect(by('SUPERMERCADO ABC')).toMatchObject({ kind: 'expense', checked: true, categoryId: 'c-mercado' })
    expect(by('LOJA QUALQUER')).toMatchObject({ kind: 'expense', checked: true })
    expect(by('PAGAMENTO RECEBIDO')).toMatchObject({ checked: false, reason: 'pagamento-fatura-no-cartao' })
    expect(by('ESTORNO LOJA')).toMatchObject({ kind: 'income', checked: true })
  })

  it('cartão: as chaves não dependem da convenção de sinal do arquivo', async () => {
    const asCsv = [inn('2026-10-03', 'LOJA', 4590), inn('2026-10-04', 'OUTRA', 100), out('2026-10-05', 'Pagamento recebido', 9000)]
    const asOfx = [out('2026-10-03', 'LOJA', 4590), out('2026-10-04', 'OUTRA', 100), inn('2026-10-05', 'Pagamento recebido', 9000)]
    const a = await buildReview({ ...base, origin: 'cartao', lines: asCsv })
    const b = await buildReview({ ...base, origin: 'cartao', lines: asOfx })
    expect(a.lines.map((l) => l.importKey).sort()).toEqual(b.lines.map((l) => l.importKey).sort())
  })

  it('conta do banco não inverte, mesmo com mais entradas que saídas', async () => {
    const r = await buildReview({
      ...base,
      lines: [inn('2026-10-03', 'PIX RECEBIDO A', 100), inn('2026-10-04', 'PIX RECEBIDO B', 100), out('2026-10-05', 'PADARIA', 50)],
    })
    expect(r.lines.filter((l) => l.kind === 'income')).toHaveLength(2)
  })

  it('registro importado antes de outro arquivo (outra chave) conta como já anotado', async () => {
    const r = await buildReview({
      ...base,
      lines: [out('2026-10-07', 'PADARIA DO ZE', 8900)],
      existing: [tx({ id: 'pdf', importKey: 'f'.repeat(64), occurredOn: '2026-10-06' })],
    })
    expect(r.lines[0]).toMatchObject({ reason: 'ja-anotada', checked: false, similarTxId: 'pdf' })
  })

  it('registro com chave deste arquivo fica no caminho de já importada, não de já anotada', async () => {
    const lines = [out('2026-10-07', 'PADARIA', 8900), out('2026-10-07', 'PADARIA', 8900)]
    const keys = await importKeys(lines)
    const r = await buildReview({
      ...base,
      lines,
      existing: [tx({ id: 'imp', importKey: keys[0], occurredOn: '2026-10-07' })],
      usedKeys: new Set([keys[0]]),
    })
    expect(r.alreadyImported).toBe(1)
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toMatchObject({ reason: null, checked: true, similarTxId: null })
  })

  it('ordem: marcadas sem categoria primeiro, depois por data decrescente', async () => {
    const r = await buildReview({
      ...base,
      lines: [
        out('2026-10-20', 'SUPERMERCADO ABC', 1000),
        out('2026-10-02', 'COISA ESTRANHA', 500),
        inn('2026-10-25', 'PIX RECEBIDO FULANO', 700),
        out('2026-10-10', 'OUTRA COISA ESTRANHA', 300),
      ],
    })
    const d = r.lines.map((l) => l.date)
    expect(d).toEqual(['2026-10-10', '2026-10-02', '2026-10-25', '2026-10-20'])
  })
})
