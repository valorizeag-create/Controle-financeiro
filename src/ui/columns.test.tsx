// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AsideColumn, Columns, MainColumn, WIDE } from './columns'

afterEach(() => cleanup())

test('uma coluna no celular; duas a partir de 1024 px, sem reordenar o DOM', () => {
  const { container } = render(
    <Columns>
      <AsideColumn><p>resumo</p></AsideColumn>
      <MainColumn><p>lista</p></MainColumn>
      <AsideColumn row={2}><p>ajuda</p></AsideColumn>
    </Columns>,
  )
  const root = container.querySelector('[data-columns]') as HTMLElement
  expect(root.className).toMatch(/^flex flex-col gap-4 /)
  expect(root.className).toContain('lg:grid')
  expect(root.className).toContain('lg:grid-cols-[minmax(0,1fr)_340px]')
  expect(root.className).not.toMatch(/(^|\s)md:/)
  const cols = [...root.children].map((c) => [c.getAttribute('data-column'), c.textContent])
  expect(cols).toEqual([['aside', 'resumo'], ['main', 'lista'], ['aside', 'ajuda']])
  const [aside1, main, aside2] = [...root.children] as HTMLElement[]
  expect(main.className).toContain('lg:col-start-1')
  expect(main.className).toContain('lg:row-span-2')
  expect(aside1.className).toContain('lg:col-start-2')
  expect(aside1.className).toContain('lg:row-start-1')
  expect(aside2.className).toContain('lg:row-start-2')
  for (const el of [root, main, aside1, aside2]) expect(el.className).not.toMatch(/(^|\s)(lg:)?(order-|flex-row-reverse|flex-col-reverse)/)
  expect(WIDE).toBe('lg:max-w-[1180px]')
})
