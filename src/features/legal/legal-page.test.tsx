// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { termsDoc, privacyDoc } from './content'
import { CONTROLLER, TO_DEFINE, type LegalController } from './controller'
import { DRAFT_NOTICE, LegalPage } from './legal-page'

afterEach(() => cleanup())
const filled: LegalController = { name: 'Fulano de Tal', contact: 'privacidade@iris.example', emailProvider: 'Provedor X', reviewedOn: '2026-11-01' }

test('rascunho: aviso visível antes do texto, um título e uma seção por assunto', () => {
  render(<LegalPage doc={termsDoc(CONTROLLER)} controller={CONTROLLER} updatedOn="2026-10-02" />)
  expect(screen.getByRole('note').textContent).toBe(DRAFT_NOTICE)
  expect(DRAFT_NOTICE).toMatch(/Rascunho/)
  expect(DRAFT_NOTICE).toMatch(/advogado/)
  expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Termos de uso'])
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(11)
  expect(screen.getAllByRole('list').length).toBeGreaterThanOrEqual(2)
  expect(screen.getByText('Atualizado em 2 de outubro de 2026.')).toBeTruthy()
})

test('a política em rascunho mostra os dados do responsável como pendentes, sem inventar nenhum', () => {
  const { container } = render(<LegalPage doc={privacyDoc(CONTROLLER)} controller={CONTROLLER} updatedOn="2026-10-02" />)
  expect(screen.getByRole('note')).toBeTruthy()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getAllByText(TO_DEFINE).length).toBeGreaterThanOrEqual(3)
  expect(container.textContent).not.toMatch(/@|CNPJ|Ltda/)
  expect(container.textContent).not.toMatch(/\bsua conta\b|\bminha conta\b/i)
})

test('revisado e preenchido: sem aviso de rascunho; a data é a da revisão', () => {
  render(<LegalPage doc={termsDoc(filled)} controller={filled} updatedOn="2026-10-02" />)
  expect(screen.queryByRole('note')).toBeNull()
  expect(screen.getByText('Atualizado em 1 de novembro de 2026.')).toBeTruthy()
})
