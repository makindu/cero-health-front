/**
 * Génération d'un PDF tabulaire sans dépendance : texte en police Courier (alignement fiable),
 * format A4 paysage, pagination automatique. Les caractères hors Latin-1 sont remplacés par « ? ».
 */

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 36;
const FONT_SIZE = 8;
const LINE_H = 11;
const CHAR_W = 0.6 * FONT_SIZE; // Courier : 600/1000 em

export interface PdfTable {
  title: string;
  /** Lignes d'information sous le titre (ex. mention « données fictives », date de l'export). */
  notes: readonly string[];
  header: readonly string[];
  rows: readonly (readonly string[])[];
}

/** Ponctuation courante absente de Latin-1, remplacée par un équivalent lisible. */
const PUNCTUATION: Record<string, string> = { '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...' };

const latin1 = (text: string): number[] =>
  Array.from(text.replace(/[—–’‘“”…]/g, (c) => PUNCTUATION[c] ?? c), (char) => {
    const code = char.codePointAt(0) ?? 63;
    return code < 256 ? code : 63;
  });

const escapePdf = (bytes: number[]): number[] =>
  bytes.flatMap((b) => (b === 40 || b === 41 || b === 92 ? [92, b] : [b]));

const clip = (value: string, width: number): string => {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= width ? flat.padEnd(width) : `${flat.slice(0, Math.max(0, width - 1))}.`.padEnd(width);
};

/** Largeur (en caractères) de chaque colonne, bornée pour tenir dans la page. */
export function columnWidths(table: Pick<PdfTable, 'header' | 'rows'>, maxChars: number): number[] {
  const natural = table.header.map((h, i) =>
    Math.max(h.length, ...table.rows.map((row) => (row[i] ?? '').length), 3),
  );
  const gap = 2 * (natural.length - 1);
  let total = natural.reduce((a, b) => a + b, 0) + gap;
  const widths = [...natural];
  while (total > maxChars) {
    const widest = widths.indexOf(Math.max(...widths));
    if ((widths[widest] as number) <= 6) break;
    widths[widest] = (widths[widest] as number) - 1;
    total -= 1;
  }
  return widths;
}

export function buildPdf(table: PdfTable): Uint8Array {
  const maxChars = Math.floor((PAGE_W - 2 * MARGIN) / CHAR_W);
  const widths = columnWidths(table, maxChars);
  const line = (cells: readonly string[]) => cells.map((c, i) => clip(c ?? '', widths[i] ?? 6)).join('  ').trimEnd();
  const rule = '-'.repeat(Math.min(maxChars, widths.reduce((a, b) => a + b, 0) + 2 * (widths.length - 1)));

  const headBlock = [table.title, ...table.notes, '', line(table.header), rule];
  const bodyLines = table.rows.map(line);
  const perFirst = Math.floor((PAGE_H - 2 * MARGIN) / LINE_H) - headBlock.length - 1;
  const perNext = Math.floor((PAGE_H - 2 * MARGIN) / LINE_H) - 3;

  const pages: string[][] = [];
  let index = 0;
  let capacity = Math.max(1, perFirst);
  let first = true;
  do {
    const slice = bodyLines.slice(index, index + capacity);
    pages.push(first ? [...headBlock, ...slice] : [line(table.header), rule, ...slice]);
    index += capacity;
    capacity = Math.max(1, perNext);
    first = false;
  } while (index < bodyLines.length);

  // Objets : 1 catalogue, 2 pages, 3 police, puis (page, contenu) par page.
  const objects: number[][] = [];
  const push = (text: string, stream?: number[]) => {
    const head = latin1(text);
    objects.push(stream ? [...head, ...latin1('\nstream\n'), ...stream, ...latin1('\nendstream')] : head);
  };
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  push('<< /Type /Catalog /Pages 2 0 R >>');
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  pages.forEach((lines, pageIndex) => {
    const content: number[] = [];
    const add = (text: string) => content.push(...latin1(text));
    add(`BT /F1 ${FONT_SIZE} Tf ${LINE_H} TL ${MARGIN} ${PAGE_H - MARGIN - FONT_SIZE} Td\n`);
    for (const text of lines) {
      content.push(40, ...escapePdf(latin1(text)), 41);
      add(' Tj T*\n');
    }
    add(`ET\nBT /F1 7 Tf ${MARGIN} ${MARGIN / 2} Td (`);
    content.push(...escapePdf(latin1(`${pageIndex + 1} / ${pages.length}`)));
    add(') Tj ET');
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + pageIndex * 2} 0 R >>`);
    push(`<< /Length ${content.length} >>`, content);
  });

  const out: number[] = [...latin1('%PDF-1.4\n')];
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out.push(...latin1(`${i + 1} 0 obj\n`), ...body, ...latin1('\nendobj\n'));
  });
  const xref = out.length;
  out.push(...latin1(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  for (const offset of offsets) out.push(...latin1(`${String(offset).padStart(10, '0')} 00000 n \n`));
  out.push(...latin1(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Uint8Array.from(out);
}
