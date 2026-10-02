// @vitest-environment node
import { renderToString } from 'react-dom/server'
import { expect, test, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
const { PayFromNotification } = await import('./pay-from-notification')

test('renderizado no servidor com o painel aberto não lança (não existe document lá)', () => {
  expect(typeof document).toBe('undefined')
  expect(() => renderToString(<PayFromNotification id="b1" name="Luz" back="/contas?mes=2026-10" action={async () => {}} />)).not.toThrow()
})
