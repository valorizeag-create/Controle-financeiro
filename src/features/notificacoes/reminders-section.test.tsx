// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { PREF_DEFAULTS } from '@/domain/notifications'

vi.mock('./actions', () => ({ setNotificationPref: async () => {} }))
vi.mock('./push-device', () => ({ PushDevice: () => <p>aparelho</p> }))
const { RemindersSection } = await import('./reminders-section')

afterEach(() => cleanup())
const names = () => screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label') ?? s.textContent)

describe('RemindersSection', () => {
  test('uma chave por tipo, na ordem do protótipo, com o padrão (RF-47, RF-50)', () => {
    render(<RemindersSection prefs={PREF_DEFAULTS} hasFamily={false} vapidPublicKey={null} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Lembretes' })).toBeTruthy()
    expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-checked'))).toEqual(['true', 'true', 'true', 'true', 'true', 'true', 'false'])
    for (const label of ['Contas perto do vencimento', 'Entradas a receber', 'Planejado quase no limite', 'Meta perto de ser concluída', 'Resumo do mês', 'Depois de alguns dias sem registro', 'Lembrete para anotar']) {
      expect(screen.getByRole('switch', { name: label })).toBeTruthy()
    }
    expect(screen.queryByRole('switch', { name: 'Avisos da família' })).toBeNull()
    expect(screen.getByText('Todo dia às 21h')).toBeTruthy()
    expect(screen.getByText('aparelho')).toBeTruthy()
    expect(names().length).toBe(7)
  })
  test('"Avisos da família" só para quem tem família', () => {
    render(<RemindersSection prefs={{ ...PREF_DEFAULTS, family: false }} hasFamily vapidPublicKey={null} />)
    expect(screen.getByRole('switch', { name: 'Avisos da família' }).getAttribute('aria-checked')).toBe('false')
  })
})
