import type { ISODate } from '@/domain/dates'

export interface LegalController {
  name: string | null
  contact: string | null
  emailProvider: string | null
  reviewedOn: ISODate | null
}

// Só o dono do projeto preenche (README, "Lista de lançamento"). Enquanto houver um campo vazio, as páginas ficam como rascunho.
// Nunca invente um nome, CNPJ, endereço ou e-mail aqui: o campo vazio é o que mantém o aviso de rascunho na tela.
// `contact` é também o contato da pessoa encarregada pelo tratamento de dados (encarregado/DPO).
export const CONTROLLER: LegalController = { name: null, contact: null, emailProvider: null, reviewedOn: null }

export const LEGAL_UPDATED_ON: ISODate = '2026-10-02'

export const TO_DEFINE = '[a definir antes do lançamento]'

export function isLegalReady(c: LegalController): boolean {
  return Boolean(c.name && c.contact && c.emailProvider && c.reviewedOn)
}
