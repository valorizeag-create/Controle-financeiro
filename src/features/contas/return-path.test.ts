import { expect, test } from 'vitest'
import { safeReturnPath } from './return-path'

test('volta só para o Seu mês ou para Contas (Review Focus 4)', () => {
  expect(safeReturnPath('/inicio')).toBe('/inicio')
  expect(safeReturnPath('/contas')).toBe('/contas')
  expect(safeReturnPath('/contas?mes=2026-09')).toBe('/contas?mes=2026-09')
  expect(safeReturnPath('/contas?mes=2026-09&aba=vencidas')).toBe('/contas?mes=2026-09&aba=vencidas')
  for (const bad of ['//evil.com', 'https://evil.com', '/contas?mes=2026-09&x=1', '/extrato', '/contas/../entrar', '', '/inicio?mes=2026-13']) {
    expect(safeReturnPath(bad)).toBe('/contas')
  }
})
