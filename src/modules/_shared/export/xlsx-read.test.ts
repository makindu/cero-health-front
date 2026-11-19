import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildXlsx, crc32 } from './xlsx';
import { readXlsx, XlsxReadError } from './xlsx-read';

const enc = new TextEncoder();
const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];

/** Archive « Excel-like » : entrées compressées (deflate), chaînes partagées, cellules en référence de colonne. */
function zipDeflate(files: Record<string, string>): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const packed = deflateRawSync(raw);
    const nm = [...enc.encode(name)];
    const offset = out.length;
    out.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(crc32(raw)), ...u32(packed.length), ...u32(raw.length), ...u16(nm.length), ...u16(0), ...nm, ...packed);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(crc32(raw)), ...u32(packed.length), ...u32(raw.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nm);
  }
  const start = out.length;
  const n = Object.keys(files).length;
  return Uint8Array.from([...out, ...central, ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(n), ...u16(n), ...u32(central.length), ...u32(start), ...u16(0)]);
}

describe('lecture .xlsx', () => {
  it('relit un classeur produit par buildXlsx (texte, nombres, accents, cellules vides)', async () => {
    const bytes = buildXlsx('Stock', [['Code', 'Produit', 'Quantité'], ['PHA-001', 'Paracétamol & « 500 mg »', 12], ['PHA-002', null, 3.5]]);
    expect(await readXlsx(bytes)).toEqual([['Code', 'Produit', 'Quantité'], ['PHA-001', 'Paracétamol & « 500 mg »', '12'], ['PHA-002', '', '3.5']]);
  });

  it.skipIf(typeof DecompressionStream === 'undefined')('relit un classeur compressé avec chaînes partagées, colonnes sautées et texte riche', async () => {
    const bytes = zipDeflate({
      'xl/sharedStrings.xml': '<sst><si><t>Code</t></si><si><r><t>Lot </t></r><r><t>n°</t></r></si><si><t>PHA-001</t></si><si><t>LOT&amp;1</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1"><v>5</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c><c r="D2" s="4"><v>47182</v></c></row><row r="3"><c r="A3"/></row></sheetData></worksheet>',
    });
    expect(await readXlsx(bytes)).toEqual([['Code', '', 'Lot n°', '5'], ['PHA-001', '', 'LOT&1', '47182']]);
  });

  it('refuse un fichier qui n’est pas un classeur', async () => {
    await expect(readXlsx(enc.encode('ceci n’est pas un zip'))).rejects.toMatchObject({ code: 'notXlsx' });
    await expect(readXlsx(new Uint8Array(6 * 1024 * 1024))).rejects.toBeInstanceOf(XlsxReadError);
  });
});
