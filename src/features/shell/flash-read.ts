import { FLASH_COOKIE_NAME } from './flash-name'

// Lógica pura de leitura do cookie de aviso, isolada para ser testada sem
// precisar de um DOM: decodeURIComponent pode lançar URIError para uma
// sequência de escape inválida, e isso não pode derrubar a casca autenticada.
export function readFlash(cookieString: string): string | null {
  const match = cookieString.split('; ').find((c) => c.startsWith(`${FLASH_COOKIE_NAME}=`))
  if (!match) return null
  const raw = match.slice(match.indexOf('=') + 1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}
