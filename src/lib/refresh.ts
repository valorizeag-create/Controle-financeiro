import 'server-only'
import { revalidatePath } from 'next/cache'

export function refreshMoneyViews(): void {
  revalidatePath('/inicio')
  revalidatePath('/extrato')
  revalidatePath('/contas')
  revalidatePath('/cartoes')
  revalidatePath('/metas', 'layout')
  revalidatePath('/planejamento')
  revalidatePath('/relatorios')
  revalidatePath('/familia', 'layout')
  revalidatePath('/inicio/familia')
}
