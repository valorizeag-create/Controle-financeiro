// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { AnimatedMoney } from './animated-money'

const NBSP = String.fromCharCode(0xa0)

// Quadros de animação controlados à mão: cada `frame(ms)` roda os callbacks pendentes nesse instante.
// Cancelar remove de verdade o pedido, como no navegador.
let pending: { id: number; cb: FrameRequestCallback }[] = []
let nextId = 0
function frame(ms: number) {
  const now = pending
  pending = []
  act(() => now.forEach(({ cb }) => cb(ms)))
}

function motion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce') }))
}

beforeEach(() => {
  pending = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++nextId
    pending.push({ id, cb })
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    pending = pending.filter((p) => p.id !== id)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('conta de zero até o valor e termina mostrando só o valor final', () => {
  motion(false)
  const { container } = render(<AnimatedMoney cents={124000} />)
  frame(0)
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(`R$${NBSP}0,00`)
  expect(container.querySelector('[data-counting]')).not.toBeNull()
  frame(350)
  const middle = container.querySelector('[aria-hidden="true"]')?.textContent ?? ''
  expect(middle).not.toBe(`R$${NBSP}0,00`)
  expect(middle).not.toBe(`R$${NBSP}1.240,00`)
  frame(700)
  expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  expect(container.querySelector('[data-counting]')).toBeNull()
  expect(container.textContent).toBe(`R$${NBSP}1.240,00`)
})

test('o valor final fica no texto o tempo todo (leitor de tela não lê os números contando)', () => {
  motion(false)
  const { container } = render(<AnimatedMoney cents={124000} />)
  frame(0)
  frame(200)
  const real = [...container.querySelectorAll('span')].filter((s) => !s.closest('[aria-hidden="true"]') && s.children.length === 0)
  expect(real.map((s) => s.textContent)).toEqual([`R$${NBSP}1.240,00`])
})

test('ao mudar o valor, conta do anterior até o novo', () => {
  motion(false)
  const { container, rerender } = render(<AnimatedMoney cents={124000} />)
  frame(0)
  frame(700)
  rerender(<AnimatedMoney cents={64000} />)
  frame(1000)
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(`R$${NBSP}1.240,00`)
  frame(1700)
  expect(container.textContent).toBe(`R$${NBSP}640,00`)
})

test('com "reduzir movimento" ligado, mostra o valor final direto', () => {
  motion(true)
  const { container } = render(<AnimatedMoney cents={124000} />)
  expect(pending).toHaveLength(0)
  expect(container.textContent).toBe(`R$${NBSP}1.240,00`)
})

test('sem matchMedia (navegador antigo), mostra o valor final direto', () => {
  vi.stubGlobal('matchMedia', undefined)
  const { container } = render(<AnimatedMoney cents={-14230} />)
  expect(pending).toHaveLength(0)
  expect(container.textContent).toBe(`−R$${NBSP}142,30`)
})

test('conta mesmo quando o efeito roda duas vezes (StrictMode, remontagem)', () => {
  motion(false)
  const { container } = render(<StrictMode><AnimatedMoney cents={124000} /></StrictMode>)
  frame(0)
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(`R$${NBSP}0,00`)
  frame(700)
  expect(container.textContent).toBe(`R$${NBSP}1.240,00`)
})
