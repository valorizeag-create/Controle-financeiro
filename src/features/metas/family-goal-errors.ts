import { UNEXPECTED } from '@/features/auth/errors'

export const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
export const ADMIN_ONLY = 'Só quem administra a família pode fazer isso.'
export const GOAL_CHANGED = 'Esta meta mudou. Atualize a página para ver como ela está.'
export const GOAL_EMPTY = 'Esta meta não tem dinheiro guardado.'
export const UNDO_BLOCKED = 'Este uso não pode mais ser desfeito.'

type DbError = { message?: string; code?: string }

// Mensagens vindas das funções do banco (migração 20261001000001, itens 33-36).
// Tentar de novo só ajuda quando o erro é passageiro: o impasse (40P01) e o inesperado.
export function familyGoalFailure(e: DbError): string {
  const m = e.message ?? ''
  if (e.code === '40P01') return UNEXPECTED
  if (e.code === '42501' || m.includes('Só quem administra a família')) return ADMIN_ONLY
  if (m.includes('Meta não encontrada.') || m.includes('Meta inválida.') || m.includes('Família não encontrada.')) return GOAL_CHANGED
  if (m.includes('Meta sem dinheiro guardado.')) return GOAL_EMPTY
  return SAVE_FAILED
}

// O erro que a pessoa não resolve tentando de novo (tudo menos o genérico e o impasse).
export const isFinalFailure = (message: string) => message !== SAVE_FAILED && message !== UNEXPECTED
