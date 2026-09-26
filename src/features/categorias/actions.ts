'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient, requireUser } from '@/lib/supabase/server'
import { errorState, firstFieldErrors, readFields, type FormState } from '@/lib/forms'
import { setFlash } from '@/lib/flash'
import { DUPLICATE_CATEGORY, categoryNameSchema, isDuplicateNameError } from './names'

const SAVE_FAILED = 'Não conseguimos salvar agora. Seus dados estão aqui, é só tentar de novo.'
const categoryIdSchema = z.uuid()

// Nomes de categoria aparecem no Anotar, no Extrato e no Seu mês.
function refreshCategoryViews() {
  revalidatePath('/', 'layout')
}

export async function createCategory(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['name'] as const)
  const parsed = categoryNameSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })

  const supabase = await createClient()
  const { data: last, error: orderError } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
  if (orderError) return errorState({ message: SAVE_FAILED, values })

  const { error } = await supabase
    .from('categories')
    .insert({ user_id: user.id, name: parsed.data.name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 })
  if (isDuplicateNameError(error)) return errorState({ fieldErrors: { name: DUPLICATE_CATEGORY }, values })
  if (error) return errorState({ message: SAVE_FAILED, values })

  await setFlash('Categoria criada.')
  refreshCategoryViews()
  redirect('/categorias')
}

export async function renameCategory(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = readFields(fd, ['name'] as const)
  const parsedId = categoryIdSchema.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) return errorState({ message: SAVE_FAILED, values })
  const parsed = categoryNameSchema.safeParse(values)
  if (!parsed.success) return errorState({ fieldErrors: firstFieldErrors(parsed.error), values })

  const supabase = await createClient()
  // Defesa em profundidade: a RLS (categories_own) já limita à pessoa dona,
  // mas filtramos por user_id aqui também, além do id.
  const { data, error } = await supabase
    .from('categories')
    .update({ name: parsed.data.name })
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .select('id')
  if (isDuplicateNameError(error)) return errorState({ fieldErrors: { name: DUPLICATE_CATEGORY }, values })
  if (error || !data || data.length !== 1) return errorState({ message: SAVE_FAILED, values })

  await setFlash('Alterações salvas.')
  refreshCategoryViews()
  redirect('/categorias')
}

export async function deleteCategory(fd: FormData): Promise<void> {
  await requireUser()
  const parsedId = categoryIdSchema.safeParse(String(fd.get('id') ?? ''))
  if (!parsedId.success) redirect('/categorias')
  const id = parsedId.data
  const supabase = await createClient()
  // Atômico no banco: os gastos vão para "Outros" e a categoria some (RN-27).
  const { error } = await supabase.rpc('delete_category', { p_category_id: id })
  if (error) redirect(`/categorias/${id}?erro=1`)
  await setFlash('Categoria excluída.')
  refreshCategoryViews()
  redirect('/categorias')
}
