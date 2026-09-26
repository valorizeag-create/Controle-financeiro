import { expect, test } from 'vitest'
import { needsOnboarding } from './gate'

test('cadastro que não concluiu (inclusive quem parou no meio) vai para as boas-vindas (Review Focus 3)', () => {
  expect(needsOnboarding({ onboarded_at: null })).toBe(true)
})

test('quem já concluiu nunca é mandado de volta', () => {
  expect(needsOnboarding({ onboarded_at: '2026-09-25T12:00:00+00:00' })).toBe(false)
})

test('sem perfil legível (falha momentânea) não redireciona, para não prender a pessoa num vai e vem', () => {
  expect(needsOnboarding(null)).toBe(false)
})
