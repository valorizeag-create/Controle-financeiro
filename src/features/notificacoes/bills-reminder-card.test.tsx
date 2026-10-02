// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  state: 'off' as string,
  enable: vi.fn(async (_k: string) => 'on' as 'on' | 'blocked' | 'failed'),
}))
vi.mock('./push-client', () => ({ deviceState: async () => h.state, enablePush: h.enable }))

const { BillsReminderCard } = await import('./bills-reminder-card')
const KEY = `B${'A'.repeat(86)}`
const ASK = 'Quer um lembrete antes de cada conta vencer?'

beforeEach(() => { h.state = 'off'; h.enable.mockClear(); h.enable.mockResolvedValue('on'); window.localStorage.clear() })
afterEach(() => cleanup())

describe('BillsReminderCard', () => {
  test('desligado e sem decisão: convida; nada é pedido ao abrir', async () => {
    render(<BillsReminderCard vapidPublicKey={KEY} />)
    await screen.findByText(ASK)
    expect(h.enable).not.toHaveBeenCalled()
  })
  test('ativar: pede com a chave pública e confirma', async () => {
    render(<BillsReminderCard vapidPublicKey={KEY} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar lembretes' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Lembretes ativados.'))
    expect(h.enable).toHaveBeenCalledWith(KEY)
  })
  test('"Agora não" guarda a marca e some', async () => {
    render(<BillsReminderCard vapidPublicKey={KEY} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }))
    expect(screen.queryByText(ASK)).toBeNull()
    expect(window.localStorage.getItem('iris:lembretes:depois')).not.toBeNull()
  })
  test.each(['on', 'blocked', 'unsupported', 'needs-install'])('estado %s: não mostra o cartão', async (state) => {
    h.state = state
    render(<BillsReminderCard vapidPublicKey={KEY} />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByText(ASK)).toBeNull()
  })
  test('já disse "Agora não" antes: não aparece', async () => {
    window.localStorage.setItem('iris:lembretes:depois', '1')
    render(<BillsReminderCard vapidPublicKey={KEY} />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByText(ASK)).toBeNull()
  })
})
