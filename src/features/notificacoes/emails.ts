import { dayMonthLabel, isValidISODate, type ISODate, type MonthKey } from '@/domain/dates'
import { monthName } from '@/domain/recurrence'

// Textos dos e-mails da Íris. Sem dependência de servidor: só monta o assunto,
// o texto e o HTML. HTML simples (um título, parágrafos, um link com o endereço
// por extenso), sem imagem, sem estilo externo e sem rastreio.

export type EmailContent = { subject: string; text: string; html: string }

const FOOTER = 'Íris — Veja para onde seu dinheiro vai'
const LINK_FALLBACK = 'Se o link não abrir, copie este endereço no navegador:'

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Nome escolhido por uma pessoa (dela ou da família) só entra no e-mail como
// nome: uma linha, sem aspas, até 60 caracteres. Se parece endereço, telefone
// ou recado (link, domínio, "@", barra, 4 dígitos seguidos), não entra: o
// e-mail usa a frase sem nome. Assim o convite não serve para mandar texto de
// terceiros a um endereço qualquer.
const NOT_A_NAME = /https?:|www\.|[\w-]+\.[a-z]{2,}(\/|\b)|[@/\\]|\d{4,}/i
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]+/g

export function plainName(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.replace(INVISIBLE, ' ').replace(/["“”„«»]/g, '').replace(/\s+/g, ' ').trim()
  if (clean === '' || NOT_A_NAME.test(clean)) return null
  return Array.from(clean).slice(0, 60).join('').trim()
}

// Link dos e-mails: só https (http apenas na máquina local, em desenvolvimento),
// sem usuário e senha, sem nada que quebre o HTML. Quem chama monta o link a
// partir de NEXT_PUBLIC_SITE_URL (`env.siteUrl`), nunca de cabeçalho de requisição.
function safeLink(link: string): string {
  if (typeof link !== 'string' || link.length > 2048 || !/^https?:\/\/[^\s"<>]+$/.test(link)) throw new Error('link')
  const url = new URL(link)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.username !== '' || url.password !== '' || !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) {
    throw new Error('link')
  }
  return link
}

type Block = { p: string } | { link: string; label: string }

function layout(input: { subject: string; title: string; blocks: Block[] }): EmailContent {
  const text: string[] = [input.title]
  const html: string[] = [`<h1>${escapeHtml(input.title)}</h1>`]
  for (const block of input.blocks) {
    if ('p' in block) {
      text.push(block.p)
      html.push(`<p>${escapeHtml(block.p)}</p>`)
    } else {
      const href = escapeHtml(block.link)
      text.push(`${block.label}:\n${block.link}`)
      html.push(`<p><a href="${href}">${escapeHtml(block.label)}</a></p>`, `<p>${LINK_FALLBACK}</p>`, `<p>${href}</p>`)
    }
  }
  text.push(FOOTER)
  html.push(`<p>${FOOTER}</p>`)
  return {
    subject: input.subject,
    text: `${text.join('\n\n')}\n`,
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(input.subject)}</title></head><body>${html.join('')}</body></html>`,
  }
}

// O assunto é fixo: não leva o nome da pessoa nem o da família.
export function inviteEmail(input: { inviterName: string | null; familyName: string; link: string; expiresOn: ISODate }): EmailContent {
  const link = safeLink(input.link)
  if (typeof input.expiresOn !== 'string' || !isValidISODate(input.expiresOn)) throw new Error('expiresOn')
  const inviter = plainName(input.inviterName)
  const family = plainName(input.familyName)
  const where = family ? `da família “${family}”` : 'de uma família'
  const lead = inviter
    ? `“${inviter}” convidou você para participar ${where} na Íris.`
    : `Há um convite para você participar ${where} na Íris.`
  return layout({
    subject: 'Você recebeu um convite na Íris',
    title: 'Você recebeu um convite',
    blocks: [
      { p: lead },
      { p: 'A família vê só os gastos que cada pessoa marca como da família, as contas da casa e as metas da família. O que é seu continua privado.' },
      { link, label: 'Ver o convite' },
      { p: `O convite vale até ${dayMonthLabel(input.expiresOn)} e serve para uma pessoa.` },
      { p: 'Se você não esperava este convite, é só ignorar este e-mail.' },
    ],
  })
}

// Sem valores: o e-mail só avisa que o mês fechou e leva para Relatórios.
export function monthSummaryEmail(input: { month: MonthKey; link: string }): EmailContent {
  const link = safeLink(input.link)
  if (typeof input.month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('month')
  const closed = `Seu mês de ${monthName(Number(input.month.slice(5)))} está fechado`
  return layout({
    subject: closed,
    title: 'Resumo do mês',
    blocks: [
      { p: `${closed}. Quer ver como foi?` },
      { link, label: 'Ver meu mês' },
      { p: 'Você recebe este e-mail porque o resumo do mês está ligado. Para desligar, abra Configurações na Íris.' },
    ],
  })
}
