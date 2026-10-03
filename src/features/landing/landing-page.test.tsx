// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { LANDING, trustItems } from './content'
import { LandingPage } from './landing-page'

afterEach(() => cleanup())
const show = (released = false) => render(<LandingPage trust={trustItems({ legalReady: released, dataReleased: released })} />)

test('um h1 (o título da copy) e um h2 por seção, na ordem da copy', () => {
  show()
  expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([LANDING.hero.title])
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    LANDING.problem.title, LANDING.turn.title, LANDING.solution.title, LANDING.features.title,
    LANDING.benefits.title, LANDING.experience.title, LANDING.trust.title, LANDING.final.title,
  ])
})

test('marcos: cabeçalho, conteúdo (alvo do pular) e rodapé; o pular é o primeiro link', () => {
  const { container } = show()
  expect(screen.getByRole('banner')).toBeTruthy()
  expect(screen.getByRole('main').id).toBe('conteudo')
  expect(screen.getByRole('contentinfo')).toBeTruthy()
  expect(container.querySelector('a')?.textContent).toBe('Pular para o conteúdo')
  for (const title of [LANDING.problem.title, LANDING.trust.title]) expect(screen.getByRole('region', { name: title })).toBeTruthy()
})

test('três CTAs "Começar a ver meu mês" levam ao cadastro; "Ver como funciona" leva à seção 4; "Entrar" no topo', () => {
  show()
  const ctas = screen.getAllByRole('link', { name: 'Começar a ver meu mês' })
  expect(ctas).toHaveLength(3)
  for (const c of ctas) expect(c.getAttribute('href')).toBe('/criar-cadastro')
  expect(screen.getByRole('link', { name: 'Ver como funciona' }).getAttribute('href')).toBe('#como-funciona')
  expect(document.getElementById('como-funciona')).toBe(screen.getByRole('region', { name: LANDING.solution.title }))
  expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Entrar' }).getAttribute('href')).toBe('/entrar')
})

test('rodapé: Termos de uso e Política de privacidade', () => {
  show()
  const legal = screen.getByRole('navigation', { name: 'Textos legais' })
  expect(within(legal).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
    ['Termos de uso', '/termos'],
    ['Política de privacidade', '/privacidade'],
  ])
})

test('Confiança: sem "Seus dados são seus." enquanto não liberado; com a liberação, aparece', () => {
  show(false)
  expect(screen.queryByText('Seus dados são seus.')).toBeNull()
  cleanup()
  show(true)
  expect(screen.getByText('Seus dados são seus.')).toBeTruthy()
})

test('o desenho do Seu mês é decorativo; a página não fala em baixar o app', () => {
  const { container } = show()
  expect(container.querySelector('[data-landing-preview]')?.getAttribute('aria-hidden')).toBe('true')
  expect(document.body.textContent ?? '').not.toMatch(/baixe|download|app store|google play/i)
})
