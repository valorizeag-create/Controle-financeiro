import { describe, expect, it } from 'vitest'
import { parseOfx } from './ofx'

const SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261009120000[-3:BRT]
<TRNAMT>-45.90
<FITID>1
<NAME>PADARIA
<MEMO>Compra padaria
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261010
<TRNAMT>1500.00
<FITID>2
<NAME>SALARIO
<MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261011
<TRNAMT>-0.10
<FITID>3
<MEMO>Tarifa
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

const XML = `<?xml version="1.0"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261009120000[-3:BRT]</DTPOSTED><TRNAMT>-45.90</TRNAMT><FITID>1</FITID><NAME>PADARIA</NAME><MEMO>Compra padaria</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261010</DTPOSTED><TRNAMT>1500.00</TRNAMT><FITID>2</FITID><NAME>SALARIO</NAME><MEMO></MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261011</DTPOSTED><TRNAMT>-0.10</TRNAMT><FITID>3</FITID><MEMO>Tarifa</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const esperado = [
  { date: '2026-10-09', description: 'Compra padaria', amountCents: 4590, direction: 'out' },
  { date: '2026-10-10', description: 'SALARIO', amountCents: 150000, direction: 'in' },
  { date: '2026-10-11', description: 'Tarifa', amountCents: 10, direction: 'out' },
]

describe('parseOfx', () => {
  it('lê OFX SGML sem tags de fechamento', () => {
    expect(parseOfx(SGML)).toEqual({ lines: esperado, skipped: 0 })
  })

  it('lê OFX XML com o mesmo resultado', () => {
    expect(parseOfx(XML)).toEqual({ lines: esperado, skipped: 0 })
  })

  it('conta como ignorada a transação com valor zero ou sem data', () => {
    const t = `<STMTTRN><DTPOSTED>20261009<TRNAMT>0.00<MEMO>Zero</STMTTRN>
<STMTTRN><TRNAMT>-10.00<MEMO>Sem data</STMTTRN>
<STMTTRN><DTPOSTED>20261009<TRNAMT>-10.00<MEMO>Ok</STMTTRN>`
    const r = parseOfx(t)
    expect(r.skipped).toBe(2)
    expect(r.lines).toEqual([{ date: '2026-10-09', description: 'Ok', amountCents: 1000, direction: 'out' }])
  })

  it('lê milhar com ponto decimal sem confundir', () => {
    const r = parseOfx('<STMTTRN><DTPOSTED>20261009<TRNAMT>1.500<MEMO>X</STMTTRN>')
    expect(r.lines[0].amountCents).toBe(150)
  })
})
