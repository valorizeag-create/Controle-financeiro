import 'server-only'
import { revalidatePath } from 'next/cache'

export function refreshMoneyViews(): void {
  revalidatePath('/inicio')
  revalidatePath('/extrato')
  revalidatePath('/contas')
  revalidatePath('/cartoes')
}
