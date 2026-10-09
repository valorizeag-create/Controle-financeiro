// Ordem importa: as entradas mais específicas vêm primeiro e a primeira que casar ganha.
// A busca é por palavra inteira (limite de palavra) na descrição já normalizada.
const ENTRADAS: ReadonlyArray<readonly [string, string]> = [
  // assinaturas (antes de compras/lazer, para "amazon prime" ganhar de "amazon")
  ['amazon prime', 'assinaturas'], ['prime video', 'assinaturas'], ['netflix', 'assinaturas'],
  ['spotify', 'assinaturas'], ['disney', 'assinaturas'], ['hbo', 'assinaturas'],
  ['youtube premium', 'assinaturas'], ['google one', 'assinaturas'], ['deezer', 'assinaturas'],
  ['globoplay', 'assinaturas'], ['icloud', 'assinaturas'],
  // comer fora ("uber eats" antes de "uber")
  ['uber eats', 'comer_fora'], ['ifood', 'comer_fora'], ['rappi', 'comer_fora'], ['mcdonalds', 'comer_fora'],
  ['burger king', 'comer_fora'], ['subway', 'comer_fora'], ['restaurante', 'comer_fora'],
  ['lanchonete', 'comer_fora'], ['padaria', 'comer_fora'], ['pizzaria', 'comer_fora'],
  ['sorveteria', 'comer_fora'], ['cafeteria', 'comer_fora'], ['bar', 'comer_fora'],
  // transporte
  ['uber', 'transporte'], ['99', 'transporte'], ['99app', 'transporte'], ['99pop', 'transporte'],
  ['cabify', 'transporte'], ['posto', 'transporte'], ['shell', 'transporte'], ['ipiranga', 'transporte'],
  ['estacionamento', 'transporte'], ['sem parar', 'transporte'], ['metro', 'transporte'],
  ['bilhete unico', 'transporte'],
  // mercado
  ['supermercado', 'mercado'], ['mercado', 'mercado'], ['atacadao', 'mercado'], ['carrefour', 'mercado'],
  ['pao de acucar', 'mercado'], ['assai', 'mercado'], ['hortifruti', 'mercado'], ['sacolao', 'mercado'],
  ['acougue', 'mercado'],
  // saúde
  ['droga raia', 'saude'], ['drogasil', 'saude'], ['drogaria', 'saude'], ['farmacia', 'saude'],
  ['pague menos', 'saude'], ['droga', 'saude'], ['clinica', 'saude'], ['laboratorio', 'saude'],
  ['hospital', 'saude'], ['unimed', 'saude'], ['dentista', 'saude'],
  // casa (contas)
  ['enel', 'casa'], ['sabesp', 'casa'], ['cemig', 'casa'], ['copel', 'casa'], ['comgas', 'casa'],
  ['aluguel', 'casa'], ['condominio', 'casa'], ['vivo', 'casa'], ['claro', 'casa'], ['tim', 'casa'],
  // educação
  ['udemy', 'educacao'], ['alura', 'educacao'], ['coursera', 'educacao'], ['faculdade', 'educacao'],
  ['escola', 'educacao'], ['curso', 'educacao'], ['livraria', 'educacao'],
  // lazer
  ['cinemark', 'lazer'], ['cinema', 'lazer'], ['ingresso', 'lazer'], ['steam', 'lazer'],
  ['playstation', 'lazer'], ['teatro', 'lazer'],
  // compras (por último: genéricos)
  ['amazon', 'compras'], ['mercadolivre', 'compras'], ['magalu', 'compras'], ['shopee', 'compras'],
  ['aliexpress', 'compras'], ['shein', 'compras'], ['americanas', 'compras'], ['renner', 'compras'],
  ['riachuelo', 'compras'], ['zara', 'compras'], ['casas bahia', 'compras'],
]

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

const REGRAS = ENTRADAS.map(
  ([palavra, chave]) => [new RegExp(`(?<![a-z0-9])${escapar(palavra)}(?![a-z0-9])`), chave] as const,
)

export function dictionaryKey(merchant: string): string | null {
  for (const [regex, chave] of REGRAS) {
    if (regex.test(merchant)) return chave
  }
  return null
}
