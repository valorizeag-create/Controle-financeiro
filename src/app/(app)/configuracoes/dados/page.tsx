import { FormAlert } from '@/ui/form-alert'
import { PageHeader } from '@/ui/page-header'

// Link simples (não next/link nem Button href): o pré-carregamento do Link
// chamaria a rota do arquivo sem a pessoa pedir.
export default async function DadosPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 pt-4 md:px-9 md:pt-7">
      <PageHeader title="Baixar meus dados" backHref="/configuracoes" />
      {erro && <FormAlert>Algo não saiu como esperado do nosso lado. Tente novamente em instantes.</FormAlert>}
      <p className="text-base text-ink">
        Um arquivo com tudo o que você registrou na Íris: registros, contas que se repetem, cartões, metas, planejamento e categorias. Abre no Excel e em outras planilhas.
      </p>
      <p className="text-base text-ink">O arquivo traz só o que é seu. Nada de outras pessoas da família entra nele.</p>
      <a
        href="/configuracoes/dados/exportar"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-panel bg-brand px-5 text-base font-semibold text-brand-ink transition-colors duration-[120ms] hover:bg-[#8bdc55] active:scale-[0.98]"
      >
        Baixar arquivo
      </a>
    </main>
  )
}
