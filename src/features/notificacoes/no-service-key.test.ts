import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// Guarda de segurança: o código do app não usa a chave de serviço do Supabase.
// A rota da tarefa usa a chave publicável e o segredo da tarefa (JOB_SECRET).
// Os nomes proibidos são montados aqui em pedaços, para este arquivo não se
// acusar a si mesmo — por isso TODO arquivo de src/ é conferido, testes também.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}
const norm = (p: string) => p.replace(/\\/g, '/')
const all = files('src').map(norm).filter((p) => /\.(ts|tsx|js|jsx|mjs|cjs|json|css|html)$/.test(p))
const sources = all.filter((p) => !/\.test\.tsx?$/.test(p))
const read = (p: string) => readFileSync(p, 'utf8')
const having = (list: string[], re: RegExp) => list.filter((p) => re.test(read(p)))

const KEY_ENV = ['SUPABASE', 'SECRET', 'KEY'].join('_')
const ROLE_NAME = ['service', 'role'].join('_')
const KEY_PREFIX = ['sb', 'secret', ''].join('_')

test('nenhum arquivo de src/ cita a chave de serviço do Supabase', () => {
  expect(all.length).toBeGreaterThan(100)
  const re = new RegExp(`${KEY_ENV}|${ROLE_NAME}|${KEY_PREFIX}`, 'i')
  expect(having(all, re)).toEqual([])
})

test('não existe cliente administrativo do Supabase no app', () => {
  expect(existsSync('src/lib/supabase/admin.ts')).toBe(false)
  expect(having(all, /supabase\/admin['"]/)).toEqual([])
})

test('o segredo da tarefa só é lido em server-env', () => {
  // O ambiente só é lido em dois arquivos: o público (env) e o só do servidor (server-env).
  expect(having(sources, /process\.env/)).toEqual(['src/lib/env.ts', 'src/lib/server-env.ts'])
  expect(having(sources, /\.JOB_SECRET\b|['"]JOB_SECRET['"]/)).toEqual(['src/lib/server-env.ts'])
  expect(having(sources, /VAPID_PRIVATE_KEY|SMTP_PASS/)).toEqual(['src/lib/server-env.ts'])
  expect(read('src/lib/env.ts')).not.toMatch(/JOB_SECRET|VAPID_PRIVATE|SMTP/)
})

test('nenhuma variável pública (NEXT_PUBLIC_) carrega segredo', () => {
  const re = /NEXT_PUBLIC_[A-Z0-9_]*(PRIVATE|SECRET|PASS|SMTP|JOB)/
  expect(having(sources, re)).toEqual([])
  expect(re.test(read('.env.example'))).toBe(false)
})

test('.env.example documenta as variáveis novas sem valor', () => {
  const example = read('.env.example')
  for (const name of [
    'JOB_SECRET', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM',
  ]) {
    expect(example, name).toMatch(new RegExp(`^${name}=\\r?$`, 'm'))
  }
})

test('as bibliotecas de envio só entram pelos módulos de envio', () => {
  expect(having(sources, /from ['"]web-push['"]/)).toEqual(['src/features/notificacoes/push-sender.ts'])
  expect(having(sources, /from ['"]nodemailer['"]/)).toEqual(['src/features/notificacoes/mailer.ts'])
})

test('a rota da tarefa e a entrega não leem cookie nem sessão', () => {
  for (const p of [
    'src/app/api/jobs/notificacoes/route.ts', 'src/features/notificacoes/deliver.ts',
    'src/features/notificacoes/job-auth.ts', 'src/lib/supabase/job.ts',
  ]) {
    expect(read(p), p).not.toMatch(/next\/headers|cookies\(|supabase\/server|supabase\/ssr|requireUser|getUser|getSession/)
  }
  expect(having(sources, /from ['"]@\/lib\/supabase\/job['"]/)).toEqual(['src/app/api/jobs/notificacoes/route.ts'])
})

test('nenhum componente de navegador importa módulos só do servidor', () => {
  const serverOnly = /from ['"](@\/lib\/server-env|@\/lib\/supabase\/job|(@\/features\/notificacoes|\.)\/(deliver|push-sender|mailer|job-auth))['"]/
  const offenders = sources.filter((p) => /^['"]use client['"]/m.test(read(p)) && serverOnly.test(read(p)))
  expect(offenders).toEqual([])
  for (const p of ['src/lib/server-env.ts', 'src/lib/supabase/job.ts', 'src/features/notificacoes/deliver.ts',
    'src/features/notificacoes/push-sender.ts', 'src/features/notificacoes/mailer.ts', 'src/features/notificacoes/job-auth.ts']) {
    expect(read(p), p).toMatch(/^import 'server-only'$/m)
  }
})
