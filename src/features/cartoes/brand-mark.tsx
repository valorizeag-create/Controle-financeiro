import { CARD_BRAND_LABELS, type CardBrand } from './types'

// Logos das bandeiras desenhados aqui (nenhum arquivo de fora): Visa e Amex em branco, para combinar com os
// cartões coloridos; Mastercard nas cores dela. São marcas registradas: identificam o cartão da própria pessoa; antes do
// lançamento, conferir o manual de marca de cada bandeira (README, lista de lançamento).
export function BrandMark({ brand, className = '' }: { brand: CardBrand; className?: string }) {
  const label = CARD_BRAND_LABELS[brand]
  if (brand === 'mastercard') {
    return (
      <svg role="img" aria-label={label} viewBox="0 0 48 30" className={`h-[30px] w-auto ${className}`}>
        {/* Em branco os dois círculos pareciam um botão de liga/desliga: aqui vão as cores da marca. */}
        <circle cx="17" cy="15" r="13" fill="#eb001b" />
        <circle cx="31" cy="15" r="13" fill="#f79e1b" />
        <path d="M24 4.2a13 13 0 0 1 0 21.6a13 13 0 0 1 0-21.6z" fill="#ff5f00" />
      </svg>
    )
  }
  if (brand === 'amex') {
    return (
      <svg role="img" aria-label={label} viewBox="0 0 64 30" className={`h-[30px] w-auto ${className}`}>
        <rect x="1" y="1" width="62" height="28" rx="5" fill="none" stroke="#fff" strokeWidth={2} />
        <text x="32" y="20.5" textAnchor="middle" fill="#fff" fontSize="14" fontWeight={800} letterSpacing="1" fontFamily="Arial, Helvetica, sans-serif">
          AMEX
        </text>
      </svg>
    )
  }
  return (
    <svg role="img" aria-label={label} viewBox="0 0 64 24" className={`h-[22px] w-auto ${className}`}>
      <text x="0" y="20" fill="#fff" fontSize="23" fontWeight={900} fontStyle="italic" letterSpacing="0.5" fontFamily="Arial, Helvetica, sans-serif">
        VISA
      </text>
    </svg>
  )
}
