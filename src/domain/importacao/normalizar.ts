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
  /^(compra no debito|compra no credito|compra cartao|compra|pix enviado|pix recebido|pix|pagamento de boleto|pagamento boleto|ted|doc)(\s+|$)/
const PREFIXO_ADQUIRENTE = /^(ifd|mp|pag|pg)\s*\*\s*/
const PARCELA = /\b(parcela|parc)\.?\s*\d+\s*(\/|de)\s*\d+\b/g

export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Limpa a descrição (minúsculas, sem acento, sem datas, números longos, prefixos e cidade/UF),
// sem cortar o tamanho.
function limpar(desc: string): string {
  let s = semAcento(desc).toLowerCase().replace(/['’`]/g, '')
  s = s.replace(PARCELA, ' ')
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

  s = s.replace(/[*]/g, ' ').replace(/\s+/g, ' ').trim()
  return tirarCidadeEUf(s).replace(/\s+/g, ' ').trim()
}

function tirarCidadeEUf(s: string): string {
  const palavras = s.split(' ')
  if (palavras.length > 1 && palavras[palavras.length - 1] === 'br') palavras.pop()
  if (palavras.length > 1 && UFS.has(palavras[palavras.length - 1])) palavras.pop()
  const resto = palavras.join(' ')
  for (const cidade of CIDADES) {
    if (resto.endsWith(' ' + cidade)) return resto.slice(0, -cidade.length - 1)
  }
  return resto
}

// Chave estável da descrição. Devolve '' quando só sobra prefixo/número (ex.: "PIX RECEBIDO 123...");
// chave vazia significa "sem memória": não deve ser gravada nem consultada.
export function normalizeMerchant(desc: string): string {
  return limpar(desc).slice(0, 60).trim()
}

const PREFIXOS_NOTA =
  /^(compra no d[eé]bito|compra no cr[eé]dito|compra cart[aã]o|compra|pix enviado|pix recebido|pix|pagamento de boleto|pagamento boleto|ted|doc)(\s+|$)/i
const ADQUIRENTE_NOTA = /^(ifd|mp|pag|pg)\s*\*\s*/i

function capitalizar(token: string): string {
  if (/^[A-Z]{2,5}$/.test(token) && !/[AEIOU]/.test(token)) return token
  const minusculo = token.toLowerCase()
  return minusculo.charAt(0).toUpperCase() + minusculo.slice(1)
}

// Nota legível: tira só prefixos de pagamento, datas dd/mm e números longos; mantém acento, número curto e cidade.
export function prettyNote(desc: string): string {
  let s = desc
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  let anterior: string
  do {
    anterior = s
    s = s.replace(PREFIXOS_NOTA, '').replace(ADQUIRENTE_NOTA, '')
  } while (s !== anterior)
  const titulo = s
    .replace(/\*/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalizar)
    .join(' ')
  return titulo.slice(0, 140).trim()
}
