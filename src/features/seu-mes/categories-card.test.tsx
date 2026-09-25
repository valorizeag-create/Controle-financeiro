// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CategoriesCard } from './categories-card'

afterEach(() => cleanup())

test('coluna do nome é flexível e trunca, e a coluna do valor não tem largura fixa (evita overflow de valores grandes)', () => {
  render(
    <CategoriesCard
      categories={[{ name: 'Um nome de categoria bem comprido para testar', cents: 1000000, share: 0.6 }]}
    />,
  )
  const list = screen.getByText('Um nome de categoria bem comprido para testar').closest('li')!
  expect(list.className).not.toMatch(/\b\d+px_1fr_\d+px\b/)
  expect(list.className).toMatch(/grid-cols-\[minmax\(0,6rem\)_1fr_auto\]/)

  const name = screen.getByText('Um nome de categoria bem comprido para testar')
  expect(name.className).toMatch(/truncate/)
  expect(name.className).toMatch(/min-w-0/)

  expect(screen.getByText('R$ 10.000,00')).toBeTruthy()
})
