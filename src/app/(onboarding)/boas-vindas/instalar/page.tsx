import { InstallCard } from '@/features/pwa/install-card'

export default function InstalarPage() {
  return <InstallCard nextHref="/boas-vindas/primeiro-gasto" skipWhenInstalled />
}
