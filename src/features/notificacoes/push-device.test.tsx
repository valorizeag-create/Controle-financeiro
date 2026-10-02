// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  state: 'off' as string,
  enable: vi.fn(async (_k: string) => 'on' as 'on' | 'blocked' | 'failed'),
  disable: vi.fn(async () => {}),
}))
vi.mock('./push-client', () => ({ deviceState: async () => h.state, enablePush: h.enable, disablePush: h.disable }))

const { PushDevice } = await import('./push-device')
const KEY = `B${'A'.repeat(86)}`

beforeEach(() => { h.state = 'off'; h.enable.mockClear(); h.disable.mockClear(); h.enable.mockResolvedValue('on') })
afterEach(() => cleanup())

describe('PushDevice (RF-08: a permissão só é pedida por um toque)', () => {
  test('desligado: botão "Ativar lembretes"; nada é pedido ao abrir a tela', async () => {
    render(<PushDevice vapidPublicKey={KEY} />)
    await screen.findByRole('button', { name: 'Ativar lembretes' })
    expect(h.enable).not.toHaveBeenCalled()
  })
  test('ativar: pede, confirma e passa a oferecer "Desativar neste aparelho"', async () => {
    render(<PushDevice vapidPublicKey={KEY} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar lembretes' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Lembretes ativados.'))
    expect(h.enable).toHaveBeenCalledWith(KEY)
    expect(screen.getByRole('button', { name: 'Desativar neste aparelho' })).toBeTruthy()
  })
  test('ligado: diz que está ativo e desativa', async () => {
    h.state = 'on'
    render(<PushDevice vapidPublicKey={KEY} />)
    expect((await screen.findByText('Os lembretes estão ativos neste aparelho.'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desativar neste aparelho' }))
    await screen.findByRole('button', { name: 'Ativar lembretes' })
    expect(h.disable).toHaveBeenCalled()
  })
  test('bloqueado no navegador', async () => {
    h.state = 'blocked'
    render(<PushDevice vapidPublicKey={KEY} />)
    await screen.findByText('Os lembretes estão bloqueados neste navegador. Para receber, libere as notificações da Íris nas configurações do navegador.')
    expect(screen.queryByRole('button')).toBeNull()
  })
  test('iPhone fora da tela de início', async () => {
    h.state = 'needs-install'
    render(<PushDevice vapidPublicKey={KEY} />)
    await screen.findByText('No iPhone, os lembretes funcionam depois de adicionar a Íris à tela de início.')
    expect(screen.getByRole('link', { name: 'Adicionar à tela de início' }).getAttribute('href')).toBe('/configuracoes/instalar')
  })
  test.each(['unsupported'])('sem suporte (%s) ou sem chave configurada', async (state) => {
    h.state = state
    render(<PushDevice vapidPublicKey={KEY} />)
    await screen.findByText('Este navegador não recebe lembretes.')
    cleanup()
    h.state = 'off'
    render(<PushDevice vapidPublicKey={null} />)
    await screen.findByText('Este navegador não recebe lembretes.')
  })
  test('não conseguiu ativar: mensagem calma, botão continua', async () => {
    h.enable.mockResolvedValue('failed')
    render(<PushDevice vapidPublicKey={KEY} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar lembretes' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não conseguimos ativar os lembretes agora. Tente de novo em instantes.'))
    expect(screen.getByRole('button', { name: 'Ativar lembretes' })).toBeTruthy()
  })
})
