import { expect, test } from 'vitest'
import { MAX_PERIOD_MONTHS, PERIOD_ERROR, PERIOD_OPTIONS, periodHref, resolvePeriod } from './period'

const today = '2026-09-28'

test('filtros da copy, nessa ordem (RF-40)', () => {
  expect(PERIOD_OPTIONS).toEqual([
    { key: 'este-mes', label: 'Este mês' },
    { key: 'mes-passado', label: 'Mês passado' },
    { key: '3-meses', label: 'Últimos 3 meses' },
    { key: 'personalizado', label: 'Personalizado' },
  ])
  expect(periodHref('mes-passado')).toBe('/relatorios?periodo=mes-passado')
  expect(MAX_PERIOD_MONTHS).toBe(12)
})

test('padrão: últimos 3 meses, terminando no mês atual (protótipo)', () => {
  const p = { key: '3-meses', from: '2026-07', to: '2026-09', months: ['2026-07', '2026-08', '2026-09'], error: null }
  expect(resolvePeriod({}, today)).toEqual(p)
  expect(resolvePeriod({ periodo: 'qualquer' }, today)).toEqual(p)
})

test('este mês e mês passado; mês passado em janeiro é dezembro do ano anterior (Review Focus 5)', () => {
  expect(resolvePeriod({ periodo: 'este-mes' }, today).months).toEqual(['2026-09'])
  expect(resolvePeriod({ periodo: 'mes-passado' }, today).months).toEqual(['2026-08'])
  expect(resolvePeriod({ periodo: 'mes-passado' }, '2027-01-05').months).toEqual(['2026-12'])
  expect(resolvePeriod({ periodo: '3-meses' }, '2027-01-05').months).toEqual(['2026-11', '2026-12', '2027-01'])
})

test('personalizado: sem datas mostra os 3 meses; um ano inteiro é aceito (mensal e anual)', () => {
  expect(resolvePeriod({ periodo: 'personalizado' }, today)).toEqual({
    key: 'personalizado', from: '2026-07', to: '2026-09', months: ['2026-07', '2026-08', '2026-09'], error: null,
  })
  const year = resolvePeriod({ periodo: 'personalizado', de: '2026-01', ate: '2026-12' }, today)
  expect(year.months).toHaveLength(12)
  expect([year.from, year.to, year.error]).toEqual(['2026-01', '2026-12', null])
})

test('período personalizado inválido: aviso calmo e os 3 meses (Review Focus 5)', () => {
  for (const [de, ate] of [['2026-10', '2026-09'], ['2025-09', '2026-09'], ['abc', '2026-09'], ['1999-12', '2000-01'], ['2026-01', ''], ['', '2026-01']]) {
    expect(resolvePeriod({ periodo: 'personalizado', de, ate }, today)).toEqual({
      key: 'personalizado', from: '2026-07', to: '2026-09', months: ['2026-07', '2026-08', '2026-09'], error: PERIOD_ERROR,
    })
  }
  expect(PERIOD_ERROR).toBe('Escolha um período de até 12 meses.')
})
