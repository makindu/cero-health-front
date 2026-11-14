import { describe, expect, it } from 'vitest';
import { safeFilename } from './download';
import { buildPdf, columnWidths } from './pdf';
import { buildXlsx, crc32, zipStore } from './xlsx';

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('xlsx', () => {
  it('calcule le CRC-32 standard', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('produit une archive ZIP avec les parties d’un classeur', () => {
    const bytes = buildXlsx('Patients', [['Nom'], ['Ada']]);
    const raw = text(bytes);
    expect(raw.startsWith('PK')).toBe(true);
    for (const name of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']) expect(raw).toContain(name);
    expect(raw).toContain('Ada');
  });
  it('écrit toujours du texte, jamais une formule, et échappe le XML', () => {
    const raw = text(buildXlsx('X', [['=HYPERLINK("http://x")', '<b>&']]));
    expect(raw).not.toContain('<f>');
    expect(raw).toContain('t="inlineStr"');
    expect(raw).toContain('&lt;b&gt;&amp;');
  });
  it('stocke les entrées sans compression', () => {
    expect(zipStore([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]).length).toBeGreaterThan(30);
  });
});

describe('pdf', () => {
  const rows = Array.from({ length: 120 }, (_, i) => [`Nom ${i}`, `Tel ${i}`]);
  it('produit un PDF paginé et bien terminé', () => {
    const raw = text(buildPdf({ title: 'Patients', notes: ['DONNÉES FICTIVES'], header: ['Nom', 'Tel'], rows }));
    expect(raw.startsWith('%PDF-1.4')).toBe(true);
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
    const pages = (raw.match(/\/Type \/Page /g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
    expect(raw).toContain('1 / ' + pages);
  });
  it('échappe les parenthèses et remplace les caractères hors Latin-1', () => {
    const raw = text(buildPdf({ title: 'T', notes: [], header: ['A'], rows: [['a(b)c\\ 日本']] }));
    expect(raw).toContain('a\\(b\\)c\\\\ ??');
  });
  it('borne la largeur des colonnes à la page', () => {
    const widths = columnWidths({ header: ['a', 'b'], rows: [['x'.repeat(400), 'y'.repeat(400)]] }, 100);
    expect(widths.reduce((a, b) => a + b, 0) + 2).toBeLessThanOrEqual(100);
  });
});

describe('nom de fichier', () => {
  it('est sûr et daté', () => {
    expect(safeFilename('Fiche Élodie/../x', 'pdf', '2026-01-02')).toBe('Fiche-Elodie-x-2026-01-02.pdf');
  });
});
