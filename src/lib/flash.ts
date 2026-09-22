import 'server-only'
import { cookies } from 'next/headers'

export const FLASH_COOKIE = 'iris_flash'

export async function setFlash(message: string) {
  const store = await cookies()
  store.set(FLASH_COOKIE, encodeURIComponent(message), { path: '/', maxAge: 30, sameSite: 'lax' })
}
