import { isValidISODate, type ISODate } from '../dates'
import type { Direction } from './tipos'

// Lê valores como '-1.234,56', '1.234,56 D', '50,00 C', '1234.56', 'R$ -12,30', '(12,30)'.
// Sem sinal e sem D/C, o valor é entrada. Retorna null se não for número ou for zero.
export function parseAmount(s: string): { cents: number; direction: Direction } | null {
  let t = s.replace(/R\$/gi, '').replace(/\s+/g, '')
  if (!t) return null
  let out = false
  let m = /^\((.*)\)$/.exec(t)
  if (m) {
    out = true
    t = m[1]
  }
  m = /^(.*?)([DC])$/i.exec(t)
  if (m) {
    out = out || m[2].toUpperCase() === 'D'
    t = m[1]
  }
  if (t.startsWith('-')) {
    out = true
    t = t.slice(1)
  } else if (t.startsWith('+')) {
    t = t.slice(1)
  }
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const cents = Math.round(Number(t) * 100)
  if (cents <= 0) return null
  return { cents, direction: out ? 'out' : 'in' }
}

// Lê '09/10/2026', '09/10/26' (20xx), '2026-10-09' e '2026-10-09T10:00:00'. Datas impossíveis dão null.
export function parseDate(s: string): ISODate | null {
  const t = s.trim()
  let y: string, mo: string, d: string
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(t)
  if (m) {
    ;[, d, mo, y] = m
    if (y.length === 2) y = `20${y}`
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(t)
    if (!m) return null
    ;[, y, mo, d] = m
  }
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  return isValidISODate(iso) ? iso : null
}

// Arquivos de banco vêm em UTF-8 ou Windows-1252; tenta UTF-8 estrito primeiro. O BOM é removido.
export function decodeBytes(bytes: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes)
  }
  return text.replace(/^﻿/, '')
}
