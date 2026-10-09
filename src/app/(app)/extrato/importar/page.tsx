import { todayInSaoPaulo } from '@/domain/dates'
import { loadCards } from '@/features/cartoes/queries'
import { Importar } from '@/features/importacao/importar'

// O login é conferido no layout; a leitura do arquivo e a revisão acontecem no cliente.
export default async function ImportarExtratoPage() {
  const cards = await loadCards()
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col px-4 pt-5 md:px-9 md:pt-7">
      <Importar cards={cards} today={todayInSaoPaulo()} />
    </main>
  )
}
