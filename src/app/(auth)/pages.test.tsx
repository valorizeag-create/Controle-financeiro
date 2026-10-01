import { expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'

vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/forms', () => ({ SignInForm: () => null, SignUpForm: () => null }))
vi.mock('@/features/auth/google-button', () => ({ GoogleButton: () => null }))

const { default: EntrarPage } = await import('./entrar/page')
const { default: CriarCadastroPage } = await import('./criar-cadastro/page')

// Props que as páginas passam aos formulários (ignora os elementos internos).
function nextProps(tree: ReactElement): unknown[] {
  const out: unknown[] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const el = n as ReactElement<{ next?: unknown; children?: unknown }>
    if (el.props && 'next' in el.props) out.push(el.props.next)
    walk(el.props?.children)
  }
  walk(tree)
  return out
}

test('?next repetido (lista) é ignorado nas duas páginas, sem quebrar', async () => {
  const next = ['/convite/a', '/convite/b']
  expect(nextProps(await EntrarPage({ searchParams: Promise.resolve({ next }) }))).toEqual([undefined, undefined])
  expect(nextProps(await CriarCadastroPage({ searchParams: Promise.resolve({ next }) }))).toEqual([undefined, undefined])
})

test('só o convite no formato exato chega aos formulários', async () => {
  const next = `/convite/${'a'.repeat(32)}`
  expect(nextProps(await EntrarPage({ searchParams: Promise.resolve({ next }) }))).toEqual([next, next])
  expect(nextProps(await CriarCadastroPage({ searchParams: Promise.resolve({ next }) }))).toEqual([next, next])
  expect(nextProps(await EntrarPage({ searchParams: Promise.resolve({ next: '/extrato' }) }))).toEqual([undefined, undefined])
})
