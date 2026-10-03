import { expect, test } from 'vitest'
import { CSV_BOM, csvDate, csvLine, csvMoney, csvMonth, csvText } from './csv'

test('texto comum vai entre aspas; vazio e nulo viram célula vazia', () => {
  expect(csvText('Mercado')).toBe('"Mercado"')
  expect(csvText('Família Souza — açaí 🍇')).toBe('"Família Souza — açaí 🍇"')
  expect(csvText('')).toBe('')
  expect(csvText(null)).toBe('')
  expect(csvText(undefined)).toBe('')
})

test.each([
  ['=1+1', `"'=1+1"`],
  ['+55 11 99999', `"'+55 11 99999"`],
  ['-50 de desconto', `"'-50 de desconto"`],
  ['-10', `"'-10"`],
  ['@SUM(A1:A9)', `"'@SUM(A1:A9)"`],
  ['\t=1+1', `"'\t=1+1"`],
  ['  =cmd|x', `"'  =cmd|x"`],
  ['\r=1+1', `"' =1+1"`],
  ['\n@x', `"' @x"`],
  ['＝1+1', `"'＝1+1"`],
  ['＋1', `"'＋1"`],
  ['－1', `"'－1"`],
  ['＠x', `"'＠x"`],
  ['\u0000=1+1', `"'=1+1"`],
  ['\u0001@x', `"'@x"`],
  ['\u001F\u007F-10', `"'-10"`],
  ['=cmd|\' /C calc\'!A0', `"'=cmd|' /C calc'!A0"`],
])('célula que viraria fórmula ganha apóstrofo: %j', (input, expected) => {
  expect(csvText(input)).toBe(expected)
})

test('o que não é fórmula não ganha apóstrofo', () => {
  expect(csvText('feira = barata')).toBe('"feira = barata"')
  expect(csvText('a-b')).toBe('"a-b"')
  expect(csvText('e-mail@casa')).toBe('"e-mail@casa"')
})

test('aspas dobram, ponto e vírgula fica dentro das aspas e quebra de linha vira espaço', () => {
  expect(csvText('diz "oi"; fim')).toBe('"diz ""oi""; fim"')
  expect(csvText('linha 1\r\nlinha 2\nlinha 3\rfim')).toBe('"linha 1 linha 2 linha 3 fim"')
})

test('valores sem R$ e sem milhar; datas e meses no formato do Brasil', () => {
  expect(csvMoney(123456)).toBe('1234,56')
  expect(csvMoney(5)).toBe('0,05')
  expect(csvMoney(0)).toBe('0,00')
  expect(csvMoney(-123456)).toBe('-1234,56')
  expect(csvMoney(9_999_999_999)).toBe('99999999,99')
  expect(csvDate('2026-10-02')).toBe('02/10/2026')
  expect(csvDate(null)).toBe('')
  expect(csvMonth('2026-03')).toBe('03/2026')
})

test('valor negativo do app fica numérico (sem aspas nem apóstrofo); o mesmo texto digitado pelo usuário é neutralizado', () => {
  expect(csvMoney(-1000)).toBe('-10,00')
  expect(csvText('-10')).toBe(`"'-10"`)
})

test('linha: células unidas por ponto e vírgula, com fim de linha do Windows; a marca de UTF-8 é um caractere só', () => {
  expect(csvLine([csvText('Luz'), csvMoney(18000), csvDate('2026-10-10'), ''])).toBe('"Luz";180,00;10/10/2026;\r\n')
  expect(CSV_BOM).toBe('\uFEFF')
})
