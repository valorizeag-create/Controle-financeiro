import 'server-only'
import { cookies } from 'next/headers'
import { FLASH_COOKIE_NAME as FLASH_COOKIE } from '@/features/shell/flash-name'

export async function setFlash(message: string) {
  const store = await cookies()
  store.set(FLASH_COOKIE, encodeURIComponent(message), { path: '/', maxAge: 30, sameSite: 'lax' })
}
