import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// As telas em painel (sheet) precisam do marco `main` em todo return que renderiza a tela:
// sem ele o "Pular para o conteúdo" e a navegação por marcos não têm onde chegar.
const SHEETS: [string, number][] = [
  ['anotar/page.tsx', 1],
  ['extrato/[id]/page.tsx', 2], // dois returns: o painel de edição e o de exclusão/leitura
  ['contas/receber/[id]/page.tsx', 1],
  ['metas/[id]/guardar/page.tsx', 1],
  ['metas/[id]/sobra/page.tsx', 1],
  ['metas/[id]/tirar/page.tsx', 1],
  ['metas/[id]/usar/page.tsx', 1],
]

test.each(SHEETS)('%s: um <main por return que desenha a tela', (file, esperado) => {
  const src = readFileSync(join(__dirname, file), 'utf8')
  const mains = src.match(/<main[\s>]/g) ?? []
  expect(mains).toHaveLength(esperado)
  // nenhum return de JSX fica sem o marco: cada `return (` ou `return <` seguido de tela tem o seu
  const returns = src.split(/\n\s*return\s*(?=\(\s*\n?\s*<|<)/).length - 1
  expect(returns).toBe(esperado)
})
