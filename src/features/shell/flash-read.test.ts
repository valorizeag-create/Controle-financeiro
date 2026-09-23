import { expect, test } from 'vitest'
import { readFlash } from './flash-read'

test('decodifica a mensagem quando o cookie existe', () => {
  expect(readFlash('iris_flash=Ol%C3%A1')).toBe('Olá')
})

test('retorna null quando o cookie não existe', () => {
  expect(readFlash('outro=1')).toBeNull()
})

test('retorna null, sem lançar, para uma sequência de escape inválida', () => {
  expect(readFlash('iris_flash=%E0%A4%A')).toBeNull()
})

test('preserva "=" dentro do valor', () => {
  expect(readFlash('iris_flash=a=b')).toBe('a=b')
})
