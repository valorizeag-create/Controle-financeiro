import { expect, test } from 'vitest'
import { notificationMessage } from '@/features/notificacoes/messages'
import { inviteReturn, isAnonOnlyPath, loginPath, isPublicPath, safeNext, withNext } from './routes'

const ID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'

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

test('volta da notificação de conta a pagar: só os dois formatos exatos', () => {
  const personal = `/contas?mes=2026-10&pagar=${ID}`
  const family = `/familia/contas?pagar=${ID}`
  expect(inviteReturn(personal)).toBe(personal)
  expect(inviteReturn(family)).toBe(family)
  expect(loginPath(personal)).toBe(`/entrar?next=${encodeURIComponent(personal)}`)
  expect(loginPath('/contas')).toBe('/entrar')
  for (const bad of [`/contas?mes=2026-13&pagar=${ID}`, `/contas?pagar=${ID}`, `/contas?mes=2026-10&pagar=${ID}&x=1`, `/contas?mes=2026-10&pagar=${ID.toUpperCase()}`, '/contas?mes=2026-10&pagar=abc', `/familia/contas?pagar=${ID}
`, `/contas?pagar=${ID}&mes=2026-10`, `/contas?mes=2026-10&mes=2026-09&pagar=${ID}`, `/contas?mes=2026-10&pagar=${ID}&pagar=${ID}`, `/contas?mes=2026-10&pagar=${ID}#x`, `/contas?mes=2026-10&pagar=${ID}@evil.com`, `/contas%3Fmes=2026-10&pagar=${ID}`, `/familia/contas%3Fpagar=${ID}`, `/familia/contas/${ID}`, `/extrato?pagar=${ID}`, `//familia/contas?pagar=${ID}`]) {
    expect(inviteReturn(bad), bad).toBeNull()
    expect(loginPath(bad), bad).toBe('/entrar')
  }
  expect(inviteReturn([personal])).toBeNull()
})

test('os dois formatos de retorno são exatamente os links que o aviso de conta gera', () => {
  for (const family of [false, true]) {
    const url = notificationMessage('bill_today', { name: 'Luz', id: ID, due_on: '2026-10-01', family })?.url
    expect(inviteReturn(url), String(url)).toBe(url)
  }
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
