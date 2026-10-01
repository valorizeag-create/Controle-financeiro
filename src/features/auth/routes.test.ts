import { expect, test } from 'vitest'
import { inviteReturn, isAnonOnlyPath, isPublicPath, safeNext, withNext } from './routes'

test('rotas públicas e rotas só para quem não entrou', () => {
  expect(isPublicPath('/entrar')).toBe(true)
  expect(isPublicPath('/auth/callback')).toBe(true)
  expect(isPublicPath('/inicio')).toBe(false)
  expect(isPublicPath('/nova-senha')).toBe(false)
  expect(isAnonOnlyPath('/criar-cadastro')).toBe(true)
  expect(isAnonOnlyPath('/inicio')).toBe(false)
})

test('safeNext só aceita caminhos internos', () => {
  expect(safeNext('/nova-senha')).toBe('/nova-senha')
  expect(safeNext('//malicioso.com')).toBe('/inicio')
  expect(safeNext('https://malicioso.com')).toBe('/inicio')
  expect(safeNext('/\\malicioso.com')).toBe('/inicio')
  expect(safeNext(null)).toBe('/inicio')
  expect(safeNext('/\t/malicioso.com')).toBe('/inicio')
  expect(safeNext('/a\\b')).toBe('/inicio')
  expect(safeNext('/%0a')).toBe('/%0a')
})

const CODE = 'a'.repeat(32)

test('o convite é público; outras rotas parecidas não', () => {
  expect(isPublicPath('/convite/abc')).toBe(true)
  expect(isPublicPath(`/convite/${CODE}`)).toBe(true)
  expect(isPublicPath('/convitex')).toBe(false)
  expect(isPublicPath('/convite/')).toBe(false)
  expect(isPublicPath('/convite/a/b')).toBe(false)
  expect(isPublicPath('/familia')).toBe(false)
  expect(safeNext('/convite/abc')).toBe('/convite/abc')
})

test('volta ao convite: só o formato exato, só caminho interno', () => {
  expect(inviteReturn(`/convite/${CODE}`)).toBe(`/convite/${CODE}`)
  for (const bad of [null, undefined, '', '/convite/abc', `/convite/${CODE}x`, `/convite/${CODE}?x=1`, '/extrato', '//evil.com', `//convite/${CODE}`, 'https://evil.com', `/convite/${'a'.repeat(31)}/`, `/convite/${CODE}\n`, `/convite/${CODE}/`, `/convite/${CODE}#x`, `/convite/../${CODE}`, `/\\convite/${CODE}`, `/convite\\${CODE}`, `%2Fconvite%2F${CODE}`, `/convite/${'a'.repeat(31)}@`, `/convite/${'a'.repeat(31)}.`, `/Convite/${CODE}`, ['/convite/' + CODE], ['a', 'b'], 42, {}]) {
    expect(inviteReturn(bad)).toBeNull()
  }
  expect(withNext('/criar-cadastro', `/convite/${CODE}`)).toBe(`/criar-cadastro?next=%2Fconvite%2F${CODE}`)
  expect(withNext('/criar-cadastro', undefined)).toBe('/criar-cadastro')
  expect(withNext('/criar-cadastro', '/extrato')).toBe('/criar-cadastro')
})
