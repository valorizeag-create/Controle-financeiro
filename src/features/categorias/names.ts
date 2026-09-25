import { z } from 'zod'

// Mesma regra da restrição categories_name_normalized no banco.
export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export const categoryNameSchema = z.object({
  name: z
    .string()
    .transform(normalizeCategoryName)
    .pipe(z.string().min(1, { error: 'Falta o nome.' }).max(40, { error: 'Use até 40 caracteres.' })),
})

export const DUPLICATE_CATEGORY = 'Você já tem uma categoria com esse nome.'

export function isDuplicateNameError(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

export function orderCategories<T extends { defaultKey: string | null; sortOrder: number; name: string }>(cats: T[]): T[] {
  return [...cats].sort((a, b) => {
    const lastA = a.defaultKey === 'outros' ? 1 : 0
    const lastB = b.defaultKey === 'outros' ? 1 : 0
    if (lastA !== lastB) return lastA - lastB
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}
