import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

// Ficam fora da sessão: a rota da tarefa dos avisos (api/jobs/ — quem autoriza é
// o código de disparo, nunca um cookie) e os arquivos do PWA (service worker,
// página "Sem conexão", manifest e ícones).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/jobs/|sw\\.js$|sem-conexao\\.html$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)'],
}
