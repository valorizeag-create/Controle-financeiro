const UFS = new Set(
  'ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to'.split(' '),
)

const CIDADES = [
  'sao paulo', 'rio de janeiro', 'belo horizonte', 'porto alegre', 'brasilia', 'curitiba', 'salvador',
  'fortaleza', 'recife', 'campinas', 'goiania', 'guarulhos', 'osasco', 'santos', 'niteroi', 'manaus',
  'belem', 'florianopolis', 'vitoria', 'natal', 'maceio', 'joao pessoa', 'sao bernardo do campo',
  'santo andre', 'ribeirao preto', 'sorocaba', 'barueri', 'sao jose dos campos', 'uberlandia',
]

const PREFIXOS_PAGAMENTO =
  /^(compra no debito|compra no credito|compra cartao|compra|pix enviado|pix recebido|pix|pagamento de boleto|pagamento boleto|ted|doc)\s+/
const PREFIXO_ADQUIRENTE = /^(ifd|mp|pag|pg)\s*\*\s*/

export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Limpa a descrição (minúsculas, sem acento, sem datas, números longos, prefixos e cidade/UF),
// sem cortar o tamanho.
function limpar(desc: string): string {
  let s = semAcento(desc).toLowerCase()
  s = s.replace(/\d{4}-\d{2}-\d{2}/g, ' ')
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
  s = s.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
  s = s.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, ' ')
  s = s.replace(/\b\d{3,}\b/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()

  let anterior: string
  do {
    anterior = s
    s = s.replace(PREFIXOS_PAGAMENTO, '').replace(PREFIXO_ADQUIRENTE, '')
  } while (s !== anterior)

  return tirarCidadeEUf(s).replace(/\s+/g, ' ').trim()
}

function tirarCidadeEUf(s: string): string {
  const palavras = s.split(' ')
  let removeu = false
  if (palavras.length > 1 && palavras[palavras.length - 1] === 'br') {
    palavras.pop()
    removeu = true
  }
  if (palavras.length > 1 && UFS.has(palavras[palavras.length - 1])) {
    palavras.pop()
    removeu = true
  }
  if (!removeu) return s
  let resto = palavras.join(' ')
  for (const cidade of CIDADES) {
    if (resto.endsWith(' ' + cidade)) {
      resto = resto.slice(0, -cidade.length - 1)
      break
    }
  }
  return resto
}

export function normalizeMerchant(desc: string): string {
  return limpar(desc).slice(0, 60).trim()
}

export function prettyNote(desc: string): string {
  const titulo = limpar(desc)
    .split(' ')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
  return titulo.slice(0, 140).trim()
}
