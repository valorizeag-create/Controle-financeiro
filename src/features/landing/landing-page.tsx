import type { ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/ui/button'
import { Logo } from '@/ui/logo'
import { CONTENT_ID, SkipLink } from '@/ui/skip-link'
import { HOW_IT_WORKS_ID, LANDING, SIGNIN_HREF, SIGNUP_HREF, type LeadText, type TrustItem } from './content'
import { HeroPreview } from './hero-preview'

const WIDTH = 'mx-auto w-full max-w-[1180px] px-4 md:px-9'
const H2 = 'text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]'
const BODY = 'text-base leading-relaxed text-body md:text-[17px]'

function Section({ id, title, titleId, children }: { id?: string; title: string; titleId: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={titleId} className="flex scroll-mt-6 flex-col gap-6">
      <h2 id={titleId} className={H2}>{title}</h2>
      {children}
    </section>
  )
}

function Leads({ items }: { items: readonly LeadText[] }) {
  return (
    <>
      {items.map((i) => (
        <li key={i.lead} className={BODY}>
          <strong className="font-semibold text-ink">{i.lead}</strong>
          {i.text ? ` ${i.text}` : ''}
        </li>
      ))}
    </>
  )
}

export function LandingPage({ trust }: { trust: TrustItem[] }) {
  const { hero, problem, turn, solution, features, benefits, experience, final } = LANDING
  return (
    <>
      <SkipLink />
      <header className={`${WIDTH} flex items-center justify-between py-4`}>
        <Logo />
        <Button href={SIGNIN_HREF} variant="ghost" className="min-h-11">Entrar</Button>
      </header>
      <main id={CONTENT_ID} tabIndex={-1} className={`${WIDTH} flex flex-col gap-16 pb-16 outline-none md:gap-24 md:pb-24`}>
        <div className="grid items-center gap-10 pt-6 lg:grid-cols-2 lg:gap-16 lg:pt-12">
          <div className="flex flex-col gap-6">
            <h1 className="text-[34px] font-bold leading-[1.1] tracking-tight text-ink md:text-[48px] lg:text-[56px]">{hero.title}</h1>
            <p className="text-lg leading-relaxed text-body md:text-xl">{hero.subtitle}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button href={SIGNUP_HREF}>{hero.cta}</Button>
              <Button href={`#${HOW_IT_WORKS_ID}`} variant="secondary">{hero.secondaryCta}</Button>
            </div>
            <p className="text-sm text-muted">{hero.micro}</p>
          </div>
          <div className="flex justify-center lg:justify-end"><HeroPreview /></div>
        </div>

        <Section title={problem.title} titleId="problema">
          <ul className="grid gap-4 md:grid-cols-2">
            <Leads items={problem.items} />
          </ul>
          <p className={BODY}>{problem.closing}</p>
        </Section>

        <Section title={turn.title} titleId="virada">
          <p className={BODY}>{turn.text}</p>
          <p className="text-[22px] font-semibold text-brand-ink">{turn.highlight}</p>
        </Section>

        <Section id={HOW_IT_WORKS_ID} title={solution.title} titleId="solucao">
          <p className={BODY}>{solution.text}</p>
          <div><Button href={SIGNUP_HREF}>{solution.cta}</Button></div>
        </Section>

        <Section title={features.title} titleId="funcionalidades">
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.items.map((i) => (
              <li key={i.lead} className="rounded-card border border-line bg-card p-5 shadow-card">
                <h3 className="text-base font-semibold text-ink">{i.lead}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-body">{i.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={benefits.title} titleId="beneficios">
          <div className="grid gap-6 md:grid-cols-2">
            <ul className="flex flex-col gap-3"><Leads items={benefits.functional} /></ul>
            <ul className="flex flex-col gap-3"><Leads items={benefits.emotional} /></ul>
          </div>
        </Section>

        <Section title={experience.title} titleId="experiencia">
          <p className={BODY}>{experience.text}</p>
          <ul className="flex flex-col gap-3"><Leads items={experience.items} /></ul>
          <p className="text-[22px] font-semibold text-brand-ink">{experience.highlight}</p>
        </Section>

        <Section title={LANDING.trust.title} titleId="confianca">
          <ul className="grid gap-4 md:grid-cols-2">
            {trust.map((i) => (
              <li key={i.id} className={`${BODY} rounded-card border border-line bg-card p-5`}>
                <strong className="font-semibold text-ink">{i.lead}</strong> {i.text}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={final.title} titleId="comece">
          <div className="flex flex-col items-start gap-5 rounded-hero border border-brand-wash-border bg-brand-wash p-6 md:p-10">
            <p className={BODY}>{final.text}</p>
            <Button href={SIGNUP_HREF}>{final.cta}</Button>
            <p className="text-sm text-muted">{final.micro}</p>
          </div>
        </Section>
      </main>
      <footer className={`${WIDTH} border-t border-line py-4`}>
        <nav aria-label="Textos legais" className="flex flex-wrap gap-x-6">
          <Link href="/termos" className="flex min-h-11 items-center font-medium text-brand-text">Termos de uso</Link>
          <Link href="/privacidade" className="flex min-h-11 items-center font-medium text-brand-text">Política de privacidade</Link>
        </nav>
      </footer>
    </>
  )
}
