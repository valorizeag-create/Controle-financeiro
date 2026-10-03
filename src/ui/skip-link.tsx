export const CONTENT_ID = 'conteudo'

// Primeiro item da ordem de foco: escondido até receber foco, depois leva ao conteúdo da tela.
export function SkipLink() {
  return (
    <a
      href={`#${CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] flex min-h-11 items-center rounded-panel bg-card px-4 font-semibold text-brand-text shadow-sheet"
    >
      Pular para o conteúdo
    </a>
  )
}
