import { dayMonthYearLabel, type ISODate } from '@/domain/dates'
import type { LegalDoc } from './content'
import { isLegalReady, TO_DEFINE, type LegalController } from './controller'

export const DRAFT_NOTICE =
  'Rascunho em revisão. Este texto ainda será revisado pelo responsável pela Íris e por um advogado antes do lançamento.'

// Os campos que só o dono preenche aparecem marcados, para ninguém confundir com texto final.
function WithPending({ text }: { text: string }) {
  const parts = text.split(TO_DEFINE)
  return parts.flatMap((part, i) => [
    part,
    i < parts.length - 1 ? (
      <span key={i} className="rounded-sm bg-brand-wash px-1 font-medium text-brand-ink">{TO_DEFINE}</span>
    ) : null,
  ])
}

export function LegalPage({ doc, controller, updatedOn }: { doc: LegalDoc; controller: LegalController; updatedOn: ISODate }) {
  return (
    <article className="flex flex-col gap-6 text-base leading-relaxed text-ink">
      <header className="flex flex-col gap-3">
        <h1 className="text-[28px] font-bold tracking-tight text-ink">{doc.title}</h1>
        {!isLegalReady(controller) && (
          <p role="note" className="rounded-card border border-brand-wash-border bg-brand-wash px-4 py-3 text-brand-ink">{DRAFT_NOTICE}</p>
        )}
        <p className="text-sm text-muted">Atualizado em {dayMonthYearLabel(controller.reviewedOn ?? updatedOn)}.</p>
      </header>
      {doc.sections.map((section, i) => {
        const id = `legal-secao-${i + 1}`
        return (
          <section key={id} aria-labelledby={id} className="flex flex-col gap-3">
            <h2 id={id} className="text-xl font-semibold text-ink">{section.heading}</h2>
            {section.blocks.map((block, j) =>
              typeof block === 'string' ? (
                <p key={j}><WithPending text={block} /></p>
              ) : (
                <ul key={j} className="list-disc space-y-2 pl-6">
                  {block.map((item, k) => <li key={k}><WithPending text={item} /></li>)}
                </ul>
              ),
            )}
          </section>
        )
      })}
    </article>
  )
}
