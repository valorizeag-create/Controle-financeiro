import 'server-only'
import { cookies } from 'next/headers'
import { FLASH_COOKIE_NAME as FLASH_COOKIE } from '@/features/shell/flash-name'

export async function setFlash(message: string) {
  const store = await cookies()
  // `cookies().set(...)` já codifica o valor internamente (ResponseCookies do
  // Next). Codificar aqui de novo causaria dupla codificação (ex.: espaços
  // virando "%2520" em vez de "%20"), e o usuário veria o texto cru na tela.
  store.set(FLASH_COOKIE, message, { path: '/', maxAge: 30, sameSite: 'lax' })
}
