import Link from 'next/link'
import { Logo } from '@/ui/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-6 bg-card px-6 py-8 md:my-10 md:min-h-0 md:rounded-hero md:border md:border-line">
      <Link href="/" aria-label="Íris, página inicial" className="flex min-h-11 w-fit items-center"><Logo /></Link>
      {children}
    </main>
  )
}
