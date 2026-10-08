// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { GoalSummary, MetasView } from './view-model'
import { MetasList } from './metas-list'

afterEach(() => cleanup())

const NBSP = String.fromCharCode(0xa0)
const summary = (p: Partial<GoalSummary> & { id: string; name: string }): GoalSummary => ({
  goal: { id: p.id, name: p.name, targetCents: 400000, deadline: '2027-03', status: 'active', usedOn: null, deletedOn: null, createdAt: '2026-07-01T12:00:00Z' },
  balanceCents: 248000, percent: 62, remainingCents: 152000, complete: false, remainingText: null,
  shortRemaining: `Faltam R$${NBSP}1.520,00`, deadlineShort: 'até mar. 2027', suggestion: null, ...p,
})

test('lista do protótipo: guardado em metas, "Só suas" e "Concluídas"', () => {
  const view: MetasView = {
    totalCents: 428000, empty: false, family: [],
    active: [summary({ id: 'g1', name: 'Viagem para Salvador' })],
    concluded: [{ id: 'g3', name: 'Computador novo', caption: 'Computador novo · usada em julho' }],
  }
  render(<MetasList view={view} />)
  expect(screen.getByText('Guardado em metas').parentElement?.textContent).toContain(`R$${NBSP}4.280,00`)
  expect(screen.getByRole('heading', { name: 'Só suas' })).toBeTruthy()
  const link = screen.getByRole('link', { name: /^Viagem para Salvador/ })
  expect(link.getAttribute('href')).toBe('/metas/g1')
  expect(link.textContent).toContain('62%')
  expect(link.textContent).toContain(`Faltam R$${NBSP}1.520,00`)
  expect(link.textContent).toContain('até mar. 2027')
  expect(within(link).getByRole('progressbar', { name: 'Progresso de Viagem para Salvador' })).toBeTruthy()
  const done = screen.getByRole('region', { name: 'Concluídas' })
  expect(within(done).getByRole('link', { name: 'Computador novo · usada em julho' }).getAttribute('href')).toBe('/metas/g3')
})

test('sem metas: convite da copy para criar a primeira', () => {
  render(<MetasList view={{ totalCents: 0, empty: true, active: [], family: [], concluded: [] }} />)
  expect(screen.getByText('Nenhuma meta por enquanto. Uma viagem, uma reserva, um presente: o que você quer tornar possível?')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Criar meta' }).getAttribute('href')).toBe('/metas/nova')
  expect(screen.queryByText('Guardado em metas')).toBeNull()
})

test('"Da família": sem metas da família a seção não existe; com uma, vem depois de "Só suas" com o total e só a minha parte', () => {
  const personal = [summary({ id: 'g1', name: 'Viagem para Salvador' })]
  const { rerender } = render(<MetasList view={{ totalCents: 0, empty: false, active: personal, family: [], concluded: [] }} />)
  expect(screen.queryByRole('heading', { name: 'Da família' })).toBeNull()
  rerender(
    <MetasList
      view={{
        totalCents: 0, empty: false, active: personal, concluded: [],
        family: [{ id: 'f1', name: 'Reforma da cozinha', percent: 30, remainingCents: 700000, myPartCents: 180000 }],
      }}
    />,
  )
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
  expect(headings.indexOf('Da família')).toBeGreaterThan(headings.indexOf('Só suas'))
  const link = screen.getByRole('link', { name: /^Reforma da cozinha/ })
  expect(link.getAttribute('href')).toBe('/metas/f1')
  expect(link.textContent).toContain('30%')
  expect(link.textContent).toContain(`Faltam R$${NBSP}7.000`)
  expect(link.textContent).toContain(`Sua parte: R$${NBSP}1.800`)
})

test('só metas da família: sem "Só suas" e sem o convite de lista vazia', () => {
  render(
    <MetasList
      view={{
        totalCents: 180000, empty: false, active: [], concluded: [],
        family: [{ id: 'f1', name: 'Reforma da cozinha', percent: 30, remainingCents: 700000, myPartCents: 180000 }],
      }}
    />,
  )
  expect(screen.queryByRole('heading', { name: 'Só suas' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Da família' })).toBeTruthy()
})

test('desktop: os cartões de cada lista ficam em duas colunas a partir de 1024 px', () => {
  const view: MetasView = {
    totalCents: 428000, empty: false, concluded: [],
    active: [summary({ id: 'g1', name: 'Viagem para Salvador' })],
    family: [{ id: 'f1', name: 'Casa nova', percent: 40, remainingCents: 1000, myPartCents: 500 } as MetasView['family'][number]],
  }
  render(<MetasList view={view} />)
  for (const name of ['Só suas', 'Da família']) {
    const list = screen.getByRole('heading', { name }).nextElementSibling as HTMLElement
    expect(list.className).toContain('grid')
    expect(list.className).toContain('lg:grid-cols-2')
  }
})

test('"Da família" é uma região com nome, como "Só suas"', () => {
  const view: MetasView = {
    totalCents: 0, empty: false, active: [], concluded: [],
    family: [{ id: 'f1', name: 'Reforma da casa', percent: 40, remainingCents: 60000, myPartCents: 20000 }],
  }
  render(<MetasList view={view} />)
  expect(screen.getByRole('region', { name: 'Da família' })).toBeTruthy()
})
