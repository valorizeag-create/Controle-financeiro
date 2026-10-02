import 'server-only'
import nodemailer from 'nodemailer'
import { readMailConfig, type MailConfig } from '@/lib/server-env'

export type Mail = { to: string; subject: string; text: string; html: string }

export interface Mailer {
  send(mail: Mail): Promise<void>
}

type CreateTransport = (options: unknown) => { sendMail(m: unknown): Promise<unknown> }

// Um endereço só: sem vírgula, espaço, nome, quebra de linha ou segundo "@".
const ONE_ADDRESS = /^[^\s,;:<>()[\]"'\\@]+@[^\s,;:<>()[\]"'\\@]+$/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function isValid(mail: Mail): boolean {
  return typeof mail.to === 'string' && mail.to.length <= 254 && ONE_ADDRESS.test(mail.to)
    && typeof mail.subject === 'string' && mail.subject.length > 0 && mail.subject.length <= 200 && !/[\r\n]/.test(mail.subject)
    && typeof mail.text === 'string' && typeof mail.html === 'string'
}

// Cada mensagem vai para uma pessoa só (ninguém vê o endereço de outra), sem
// cópia, sem anexo e sem nada que busque arquivo ou endereço externo.
// Fora da máquina local a conexão é sempre cifrada: a senha e o conteúdo não
// viajam em texto aberto. Os tempos máximos impedem que um servidor de e-mail
// lento segure a tarefa.
export function smtpMailer(config: MailConfig, createTransport: CreateTransport = (o) => nodemailer.createTransport(o as never)): Mailer {
  return {
    async send(mail) {
      // O erro não carrega o endereço nem o assunto (pode ir para o log de quem chama).
      if (!isValid(mail)) throw new Error('mail')
      const transport = createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: !config.secure && !LOCAL_HOSTS.has(config.host),
        auth: config.user !== null && config.pass !== null ? { user: config.user, pass: config.pass } : undefined,
        connectionTimeout: 4000,
        greetingTimeout: 4000,
        socketTimeout: 5000,
        disableFileAccess: true,
        disableUrlAccess: true,
      })
      await transport.sendMail({ from: config.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html })
    },
  }
}

// Para testes: guarda o que seria enviado.
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = []
  return {
    sent,
    async send(mail) {
      sent.push(mail)
    },
  }
}

// Sem servidor de e-mail no ambiente, o envio fica desligado e o app segue funcionando.
export function getMailer(): Mailer | null {
  const config = readMailConfig()
  return config ? smtpMailer(config) : null
}
