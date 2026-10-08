import { InstallCard } from '@/features/pwa/install-card'

// O título da página é o h1 do próprio cartão (sem PageHeader, para não haver dois títulos).
export default function InstalarPage() {
  return (
    <main className="mx-auto flex max-w-[480px] flex-col lg:max-w-[880px] px-4 pt-4 md:px-9 md:pt-7">
      <InstallCard nextHref="/configuracoes" wide />
    </main>
  )
}
