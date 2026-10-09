import type { ISODate } from '../dates'

export type Direction = 'in' | 'out'
// amountCents é sempre positivo; o sentido vai em direction
export type RawLine = { date: ISODate; description: string; amountCents: number; direction: Direction }
export type ParseResult = { lines: RawLine[]; skipped: number }
export type CsvMapping = { date: number; description: number; amount?: number; debit?: number; credit?: number }
export type CsvResult = ({ ok: true } & ParseResult) | { ok: false; headers: string[]; preview: string[][] }
