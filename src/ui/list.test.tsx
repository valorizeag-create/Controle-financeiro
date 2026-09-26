// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ListCard, ListRow, ListSection, RowLink, RowStatic } from './list'
import { PageHeader } from './page-header'

afterEach(() => cleanup())

test('linha com link mostra rótulo, valor e seta; linha fixa não é link', () => {
  render(
    <ListSection title="Seu dinheiro">
      <ListCard>
        <ListRow><RowLink href="/configuracoes/saldo-inicial" caption="Quanto você tinha ao começar" title="R$ 6.000,00" /></ListRow>
        <ListRow><RowLink href="/categorias" title="Categorias" value="11" /></ListRow>
        <ListRow><RowStatic caption="E-mail" title="ana@teste.iris.dev" /></ListRow>
      </ListCard>
    </ListSection>,
  )
  expect(screen.getByRole('region', { name: 'Seu dinheiro' })).toBeTruthy()
  const saldo = screen.getByRole('link', { name: /Quanto você tinha ao começar/ })
  expect(saldo.getAttribute('href')).toBe('/configuracoes/saldo-inicial')
  expect(saldo.textContent).toContain('R$ 6.000,00')
  expect(screen.getByRole('link', { name: /Categorias/ }).textContent).toContain('11')
  expect(screen.getByText('ana@teste.iris.dev').closest('a')).toBeNull()
})

test('cabeçalho tem título e Voltar; em páginas principais o Voltar some no desktop', () => {
  const { rerender } = render(<PageHeader title="Criar categoria" backHref="/categorias" />)
  expect(screen.getByRole('heading', { level: 1, name: 'Criar categoria' })).toBeTruthy()
  const back = screen.getByRole('link', { name: 'Voltar' })
  expect(back.getAttribute('href')).toBe('/categorias')
  expect(back.className).not.toContain('md:hidden')
  rerender(<PageHeader title="Configurações" backHref="/mais" backOnMobileOnly />)
  expect(screen.getByRole('link', { name: 'Voltar' }).className).toContain('md:hidden')
})
