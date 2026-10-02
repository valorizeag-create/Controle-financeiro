import { expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/proxy', () => ({ updateSession: vi.fn() }))
const { config } = await import('./proxy')
const matcher = new RegExp(`^${config.matcher[0]}$`)

test('a sessão não passa pela rota da tarefa nem pelos arquivos do PWA', () => {
  for (const path of ['/api/jobs/notificacoes', '/api/jobs/', '/sw.js', '/sem-conexao.html', '/manifest.webmanifest', '/icons/icon-192.png']) {
    expect(matcher.test(path), path).toBe(false)
  }
})
test('as páginas do app continuam passando', () => {
  for (const path of ['/', '/inicio', '/contas', '/configuracoes/instalar', '/api/outra', '/api/jobs', '/swx', '/sw.js/x', '/boas-vindas/instalar', '/entrar']) {
    expect(matcher.test(path), path).toBe(true)
  }
})
