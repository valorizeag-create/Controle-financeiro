import { expect, test } from 'vitest'
import { passwordUpdateMessage } from './errors'

test('sessão antiga pede para entrar de novo, com instrução clara (Review Focus 5)', () => {
  expect(passwordUpdateMessage('reauthentication_needed')).toBe('Por segurança, saia e entre de novo antes de mudar a senha.')
})

test('senha igual à atual', () => {
  expect(passwordUpdateMessage('same_password')).toBe('Essa já é a sua senha. Escolha uma diferente.')
})

test('qualquer outro erro usa a mensagem geral', () => {
  expect(passwordUpdateMessage('unexpected_failure')).toBe('Algo não saiu como esperado do nosso lado. Tente novamente em instantes.')
  expect(passwordUpdateMessage(undefined)).toBe('Algo não saiu como esperado do nosso lado. Tente novamente em instantes.')
})
