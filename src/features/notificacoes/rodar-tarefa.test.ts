import { spawnSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'

// scripts/rodar-tarefa.mjs manda o segredo da tarefa como parâmetro de uma chamada ao banco.
// O script roda de verdade aqui, com endereços que não existem: o que se confere é para onde ele aceita mandar.
const SECRET = 'S3gredo-de-teste_'.repeat(3)

function run(supabaseUrl: string, args: string[] = ['manha']) {
  const result = spawnSync(process.execPath, ['scripts/rodar-tarefa.mjs', ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      JOB_SECRET: SECRET,
      // Porta 9 (descarte): nada escuta ali, então nenhuma tarefa de verdade é chamada.
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:9',
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teste',
    },
  })
  return { status: result.status, out: `${result.stdout}\n${result.stderr}` }
}

describe('scripts/rodar-tarefa.mjs: o segredo só vai por https ou para a própria máquina', () => {
  test.each([
    'http://banco.invalid', 'http://banco.invalid:54321', 'http://192.168.0.10:54321', 'http://localhost.banco.invalid',
    'http://localhost@banco.invalid', 'ftp://localhost', 'banco.invalid',
  ])('endereço do banco recusado antes de qualquer chamada (%s)', (url) => {
    const { status, out } = run(url)
    expect(status).toBe(1)
    expect(out).toContain('Confira NEXT_PUBLIC_SUPABASE_URL em .env.local')
    // Parou antes de chamar o banco: a mensagem de "não rodou" só aparece depois da chamada.
    expect(out).not.toContain('não rodou')
    expect(out).not.toContain(SECRET)
  })

  test('banco local (http na própria máquina) passa pela regra: o script chega a chamar o banco', () => {
    const { status, out } = run('http://127.0.0.1:9')
    expect(status).toBe(1)
    expect(out).not.toContain('Confira NEXT_PUBLIC_SUPABASE_URL')
    expect(out).toContain('A tarefa "manha" não rodou')
    expect(out).not.toContain(SECRET)
  }, 40_000)
})
