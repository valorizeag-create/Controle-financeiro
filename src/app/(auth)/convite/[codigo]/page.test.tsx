import { beforeEach, expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'

vi.mock('server-only', () => ({}))
const rpc = vi.fn()
const getUser = vi.fn()
const createClient = vi.fn(async () => ({ auth: { getUser }, rpc }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/features/familia/actions', () => ({ acceptInvite: vi.fn() }))

const { default: ConvitePage } = await import('./page')

const code = 'a'.repeat(32)
const render = (codigo: string, erro?: string) =>
  ConvitePage({ params: Promise.resolve({ codigo }), searchParams: Promise.resolve(erro ? { erro } : {}) }) as Promise<ReactElement<{ view: { kind: string } }>>

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  createClient.mockClear()
})

test('código fora do formato: inválido, sem tocar no banco', async () => {
  expect((await render('../x')).props.view.kind).toBe('invalid')
  expect(createClient).not.toHaveBeenCalled()
  expect(rpc).not.toHaveBeenCalled()
})

test('sem sessão: mostra o convite sem chamar a prévia', async () => {
  getUser.mockResolvedValue({ data: { user: null } })
  expect((await render(code)).props.view.kind).toBe('signed-out')
  expect(rpc).not.toHaveBeenCalled()
})

test('com sessão: pede a prévia e mostra o convite', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  rpc.mockResolvedValue({ data: [{ family_name: 'Família Souza', invited_by: 'Camila' }], error: null })
  const el = await render(code)
  expect(rpc).toHaveBeenCalledWith('invite_preview', { p_code: code })
  expect(el.props.view).toEqual({ kind: 'ready', code, familyName: 'Família Souza', invitedBy: 'Camila' })
})

test('erro=convite e erro=familia não pedem a prévia', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  expect((await render(code, 'convite')).props.view.kind).toBe('invalid')
  expect((await render(code, 'familia')).props.view.kind).toBe('has-family')
  expect(rpc).not.toHaveBeenCalled()
})
