import type { DocBlock, DocMeta } from './document-model';

/**
 * PDF professionnel (A4 portrait), sans dépendance : Helvetica standard, retours à la ligne selon la largeur réelle des lettres,
 * en-tête d'établissement, fiche d'identité, chiffres clés, tableaux, pagination automatique et pied de page numéroté. Encodage Windows-1252 : tous les accents français et la ponctuation courante s'affichent.
 */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const WIDTH = PAGE_W - 2 * MARGIN;

/** Largeurs Helvetica (1/1000 em) des caractères ASCII 32 à 126. */
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD_FACTOR = 1.1;

/** Octet Windows-1252 des caractères hors ASCII les plus courants. */
const CP1252: Record<string, number> = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'Œ': 0x8c, 'œ': 0x9c, '→': 0x3e };

function byteOf(ch: string): number {
  const mapped = CP1252[ch];
  if (mapped !== undefined) return mapped;
  const code = ch.codePointAt(0) ?? 63;
  return code >= 32 && code < 256 && !(code >= 127 && code < 160) ? code : 63;
}

/** Largeur d'un caractère en 1/1000 em : une lettre accentuée a la largeur de sa lettre de base. */
function charWidth(ch: string): number {
  const b = byteOf(ch);
  if (b >= 32 && b <= 126) return W[b - 32] ?? 556;
  if (b === 0x95) return 350;
  if (b === 0x97 || b === 0x96) return b === 0x97 ? 1000 : 556;
  if (b === 0x85) return 1000;
  if (b === 0x91 || b === 0x92) return 222;
  if (b === 0x93 || b === 0x94) return 333;
  const base = ch.normalize('NFD').charAt(0);
  const bb = byteOf(base);
  return bb >= 32 && bb <= 126 && base !== ch ? (W[bb - 32] ?? 556) : 556;
}

export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch);
  return (w / 1000) * size * (bold ? BOLD_FACTOR : 1);
}

/** Coupe un texte en lignes qui tiennent dans `max` points ; un mot plus long que la ligne est coupé. */
export function wrapText(text: string, size: number, max: number, bold = false): string[] {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    let line = '';
    for (const word of raw.split(/\s+/).filter((x) => x !== '')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (textWidth(candidate, size, bold) <= max) { line = candidate; continue; }
      if (line !== '') { lines.push(line); line = ''; }
      let rest = word;
      while (textWidth(rest, size, bold) > max) {
        let cut = rest.length;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > max) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}


type Rgb = readonly [number, number, number];
/** Palette sobre : bleu-vert profond pour la structure, gris pour le secondaire, teinte claire pour les fonds. */
const INK: Rgb = [0.1, 0.16, 0.18];
const ACCENT: Rgb = [0.059, 0.298, 0.361];
const MUTED: Rgb = [0.36, 0.42, 0.44];
const TINT: Rgb = [0.933, 0.957, 0.961];
const RULE: Rgb = [0.78, 0.835, 0.85];
const WHITE: Rgb = [1, 1, 1];

type Font = 'F1' | 'F2' | 'F3';
const f = (n: number): string => (Math.round(n * 100) / 100).toString();
const rgb = (c: Rgb): string => `${f(c[0])} ${f(c[1])} ${f(c[2])}`;

/** Texte affiché (accents compris) en octets Windows-1252. */
function bytes(text: string): number[] { return Array.from(text, byteOf); }
/** Syntaxe PDF (ASCII, retours à la ligne compris). */
const raw = (text: string): number[] => Array.from(text, (ch) => ch.charCodeAt(0) & 255);
const esc = (b: number[]): number[] => b.flatMap((x) => (x === 40 || x === 41 || x === 92 ? [92, x] : [x]));

/** Instructions de dessin d'une page. */
class Out {
  readonly c: number[] = [];
  put(t: string): void { this.c.push(...raw(t)); }
  rect(color: Rgb, x: number, y: number, w: number, h: number): void { this.put(`${rgb(color)} rg ${f(x)} ${f(y)} ${f(w)} ${f(h)} re f\n`); }
  text(font: Font, size: number, color: Rgb, x: number, y: number, s: string): void {
    if (s === '') return;
    this.put(`BT /${font} ${f(size)} Tf ${rgb(color)} rg ${f(x)} ${f(y)} Td (`);
    this.c.push(...esc(bytes(s)));
    this.put(') Tj ET\n');
  }
  /** Logo de l'en-tête (image « Im1 », déclarée dans les ressources de la page). */
  image(x: number, y: number, w: number, h: number): void { this.put(`q ${f(w)} 0 0 ${f(h)} ${f(x)} ${f(y)} cm /Im1 Do Q\n`); }
  /** Trait à remplir à la main (tracé en vrai trait, pas en rectangle). */
  stroke(x1: number, x2: number, y: number): void { this.put(`0.6 G 0.5 w ${f(x1)} ${f(y)} m ${f(x2)} ${f(y)} l S\n`); }
}

interface Item {
  /** Hauteur occupée, marge du dessus non comprise. */
  h: number;
  /** Espace laissé au-dessus quand l'élément n'ouvre pas une page. */
  before: number;
  /** Reste sur la page avec l'élément suivant (un titre n'est jamais seul en bas). */
  keepNext?: boolean;
  /** En-tête de tableau, redessiné en haut de chaque nouvelle page. */
  head?: Item;
  draw: (o: Out, top: number) => void;
}

const LEAD = 1.4;

function textItem(text: string, font: Font, size: number, color: Rgb, before: number, opts: { x?: number; width?: number; lead?: number; keepNext?: boolean; after?: number; extra?: (o: Out, top: number, h: number) => void } = {}): Item {
  const x = opts.x ?? MARGIN;
  const lines = wrapText(text, size, opts.width ?? WIDTH, font === 'F2');
  const lead = opts.lead ?? LEAD;
  const h = lines.length * size * lead + (opts.after ?? 0);
  return {
    h, before, keepNext: opts.keepNext,
    draw: (o, top) => {
      lines.forEach((l, i) => o.text(font, size, color, x, top - size * lead * (i + 0.5) - size * 0.33, l));
      opts.extra?.(o, top, h);
    },
  };
}

/** Place du logo à droite de l'en-tête : 150 x 54 points au plus, proportions respectées. */
function logoBox(logo: NonNullable<NonNullable<DocMeta['letterhead']>['logo']>): { w: number; h: number } {
  const k = Math.min(150 / logo.width, 54 / logo.height, 4);
  return { w: logo.width * k, h: logo.height * k };
}

function letterheadItem(lh: NonNullable<DocMeta['letterhead']>): Item {
  const box = lh.logo ? logoBox(lh.logo) : null;
  const textW = box ? WIDTH - box.w - 16 : WIDTH;
  const name = wrapText(lh.name, 15, textW, true);
  const lines = lh.lines.flatMap((l) => wrapText(l, 8.5, textW));
  const textH = name.length * 19 + lines.length * 11.5 + 14;
  const h = Math.max(textH, box ? box.h + 22 : 0);
  return {
    h, before: 0,
    draw: (o, top) => {
      let y = top - 14;
      for (const l of name) { o.text('F2', 15, ACCENT, MARGIN, y, l); y -= 19; }
      y += 19 - 13.5;
      for (const l of lines) { o.text('F1', 8.5, MUTED, MARGIN, y, l); y -= 11.5; }
      if (box) o.image(PAGE_W - MARGIN - box.w, top - 8 - box.h, box.w, box.h);
      o.rect(ACCENT, MARGIN, top - h, WIDTH, 1.4);
    },
  };
}

function factsItem(rows: readonly { label: string; value: string }[]): Item {
  const colW = WIDTH / 2;
  const pad = 10;
  const pairs: { label: string; lines: string[] }[][] = [];
  for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2).map((r) => ({ label: r.label, lines: wrapText(r.value || '—', 10, colW - 2 * pad, true) })));
  const heights = pairs.map((p) => 9 + Math.max(...p.map((c) => 9.5 + c.lines.length * 13)) + 4);
  const h = heights.reduce((a, b) => a + b, 0) + 6;
  return {
    h, before: 12,
    draw: (o, top) => {
      o.rect(TINT, MARGIN, top - h, WIDTH, h);
      o.rect(ACCENT, MARGIN, top - h, 3, h);
      let y = top - 3;
      pairs.forEach((p, ri) => {
        p.forEach((c, ci) => {
          const x = MARGIN + ci * colW + pad + (ci === 0 ? 4 : 0);
          o.text('F1', 7.5, MUTED, x, y - 15, c.label);
          c.lines.forEach((l, li) => o.text('F2', 10, INK, x, y - 28 - li * 13, l));
        });
        y -= heights[ri] as number;
      });
    },
  };
}

function statsItem(items: readonly { value: string; label: string }[]): Item {
  const gap = 8;
  const n = Math.max(1, items.length);
  const w = (WIDTH - gap * (n - 1)) / n;
  const h = 56;
  return {
    h, before: 12,
    draw: (o, top) => {
      items.forEach((it, i) => {
        const x = MARGIN + i * (w + gap);
        o.rect(TINT, x, top - h, w, h);
        o.rect(ACCENT, x, top - 2, w, 2);
        let size = 20;
        while (size > 10 && textWidth(it.value, size, true) > w - 16) size -= 1;
        o.text('F2', size, ACCENT, x + 8, top - 26, it.value);
        wrapText(it.label, 8, w - 16).slice(0, 2).forEach((l, li) => o.text('F1', 8, MUTED, x + 8, top - 40 - li * 9.5, l));
      });
    },
  };
}

function tableItems(b: Extract<DocBlock, { kind: 'table' }>): Item[] {
  const cols = Math.max(1, b.head.length);
  const weights = Array.from({ length: cols }, (_, i) => Math.max(0.1, b.widths?.[i] ?? 1));
  const total = weights.reduce((a, c) => a + c, 0);
  const colW = weights.map((w) => (w / total) * WIDTH);
  const xs = colW.map((_, i) => MARGIN + colW.slice(0, i).reduce((a, c) => a + c, 0));
  const padX = 5;
  const size = 8.5;
  const lineH = size * 1.32;
  const rowItem = (cells: readonly string[], opts: { header?: boolean; zebra?: boolean }): Item => {
    const wrapped = Array.from({ length: cols }, (_, i) => wrapText(cells[i] ?? '', size, (colW[i] as number) - 2 * padX, opts.header === true));
    const h = Math.max(...wrapped.map((l) => l.length)) * lineH + 9;
    return {
      h, before: 0,
      draw: (o, top) => {
        if (opts.header) o.rect(ACCENT, MARGIN, top - h, WIDTH, h);
        else if (opts.zebra) o.rect(TINT, MARGIN, top - h, WIDTH, h);
        wrapped.forEach((lines, i) => lines.forEach((l, li) => {
          const w = textWidth(l, size, opts.header === true);
          const x = b.align?.[i] === 'right' ? (xs[i] as number) + (colW[i] as number) - padX - w : (xs[i] as number) + padX;
          o.text(opts.header ? 'F2' : 'F1', size, opts.header ? WHITE : INK, x, top - 4.5 - size - li * lineH + 1.5, l);
        }));
        if (!opts.header) o.rect(RULE, MARGIN, top - h, WIDTH, 0.4);
      },
    };
  };
  const head = rowItem(b.head, { header: true });
  head.before = 10;
  head.keepNext = true;
  const rows = b.rows.map((r, i) => ({ ...rowItem(r, { zebra: i % 2 === 1 }), head }));
  return [head, ...rows];
}

function signatureItem(labels: readonly string[]): Item {
  const gap = 28;
  const n = Math.max(1, labels.length);
  const w = (WIDTH - gap * (n - 1)) / n;
  const h = 64;
  return {
    h, before: 18,
    draw: (o, top) => {
      labels.forEach((l, i) => {
        const x = MARGIN + i * (w + gap);
        o.rect(MUTED, x, top - 48, w, 0.6);
        o.text('F1', 8, MUTED, x, top - 59, l);
      });
    },
  };
}

function layout(blocks: readonly DocBlock[], meta: DocMeta): Item[] {
  const out: Item[] = [];
  if (meta.letterhead) out.push(letterheadItem(meta.letterhead));
  for (const b of blocks) {
    switch (b.kind) {
      case 'title': out.push(textItem(b.text, 'F2', 21, INK, 16, { lead: 1.2, after: 11, extra: (o, top, h) => o.rect(ACCENT, MARGIN, top - h + 3, 44, 3) })); break;
      case 'meta': out.push(textItem(b.text, 'F1', 10, INK, 3)); break;
      case 'note': {
        const lines = wrapText(b.text, 8.5, WIDTH - 26);
        const h = lines.length * 8.5 * 1.4 + 14;
        out.push({ h, before: 12, draw: (o, top) => {
          o.rect(TINT, MARGIN, top - h, WIDTH, h);
          o.rect(RULE, MARGIN, top - h, 3, h);
          lines.forEach((l, i) => o.text('F3', 8.5, MUTED, MARGIN + 13, top - 12 - i * 8.5 * 1.4, l));
        } });
        break;
      }
      case 'heading': out.push(textItem(b.text, 'F2', 12.5, ACCENT, 20, { lead: 1.25, keepNext: true, after: 8, extra: (o, top, h) => o.rect(RULE, MARGIN, top - h + 2, WIDTH, 0.7) })); break;
      case 'paragraph': out.push(textItem(b.text, 'F1', 10, INK, 7)); break;
      case 'bullets':
        for (const item of b.items) {
          const it = textItem(item, 'F1', 10, INK, 4, { x: MARGIN + 14, width: WIDTH - 14 });
          const base = it.draw;
          it.draw = (o, top) => { o.rect(ACCENT, MARGIN + 3, top - 10, 3.6, 3.6); base(o, top); };
          out.push(it);
        }
        break;
      case 'facts': out.push(factsItem(b.rows)); break;
      case 'stats': out.push(statsItem(b.items)); break;
      case 'table': out.push(...tableItems(b)); break;
      case 'signature': out.push(signatureItem(b.labels)); break;
      case 'writeIn': for (let i = 0; i < b.lines; i += 1) out.push({ h: 17, before: 0, draw: (o, top) => o.stroke(MARGIN, PAGE_W - MARGIN, top - 15) }); break;
    }
  }
  return out;
}

const TOP_FIRST = PAGE_H - 30;
const TOP_NEXT = PAGE_H - 50;
const BOTTOM = 64;

export function buildDocumentPdf(blocks: readonly DocBlock[], meta: DocMeta): Uint8Array {
  const items = layout(blocks, meta);
  const pages: Out[] = [new Out()];
  let y = TOP_FIRST;
  let atTop = true;
  const newPage = (): void => { pages.push(new Out()); y = TOP_NEXT; atTop = true; };
  const place = (it: Item): void => {
    const top = atTop ? y : y - it.before;
    (it.draw)(pages[pages.length - 1] as Out, top);
    y = top - it.h;
    atTop = false;
  };
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i] as Item;
    let need = it.h + (atTop ? 0 : it.before);
    if (it.keepNext) { const nx = items[i + 1]; if (nx) need += nx.before + nx.h + (nx.keepNext ? ((items[i + 2]?.h ?? 0)) : 0); }
    if (!atTop && y - need < BOTTOM) {
      newPage();
      if (it.head && it.head !== it) place(it.head);
    }
    place(it);
  }

  const objects: number[][] = [];
  const push = (text: string, stream?: number[]): void => {
    const head = raw(text);
    objects.push(stream ? [...head, ...raw('\nstream\n'), ...stream, ...raw('\nendstream')] : head);
  };
  push('<< /Type /Catalog /Pages 2 0 R >>');
  push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${6 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  const name = meta.letterhead?.name ?? '';
  const logo = meta.letterhead?.logo;
  const imageId = 6 + pages.length * 2;
  pages.forEach((o, pageIndex) => {
    // Bandeau de couleur en haut de chaque page ; en-tête courant dès la deuxième page.
    o.rect(ACCENT, 0, PAGE_H - 7, PAGE_W, 7);
    if (pageIndex > 0) {
      o.text('F2', 8, ACCENT, MARGIN, PAGE_H - 28, name);
      const w = textWidth(meta.title, 8);
      o.text('F1', 8, MUTED, PAGE_W - MARGIN - w, PAGE_H - 28, meta.title);
      o.rect(RULE, MARGIN, PAGE_H - 34, WIDTH, 0.5);
    }
    // Pied de page : filet, établissement et référence à gauche, numéro de page à droite, confidentialité dessous.
    o.rect(RULE, MARGIN, 46, WIDTH, 0.5);
    o.text('F1', 7.5, MUTED, MARGIN, 35, [name, meta.footer].filter((x) => x !== '').join('  ·  '));
    const pn = `${meta.pageLabel ?? 'Page'} ${pageIndex + 1} / ${pages.length}`;
    o.text('F2', 7.5, INK, PAGE_W - MARGIN - textWidth(pn, 7.5, true), 35, pn);
    if (meta.confidential) o.text('F3', 7, MUTED, MARGIN, 24, meta.confidential);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${logo ? ` /XObject << /Im1 ${imageId} 0 R >>` : ''} >> /Contents ${7 + pageIndex * 2} 0 R >>`);
    push(`<< /Length ${o.c.length} >>`, o.c);
  });

  if (logo) {
    // JPEG intégré tel quel (filtre DCTDecode) : aucune conversion, donc aucune perte.
    push(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace ${logo.components === 1 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>`, Array.from(logo.bytes));
  }

  const out: number[] = [...raw('%PDF-1.4\n')];
  const offsets: number[] = [];
  // Boucles plutôt que « push(...tableau) » : une image fait des dizaines de milliers d'octets, au-delà de ce que les arguments d'appel acceptent.
  const append = (target: number[], items: readonly number[]): void => { for (const x of items) target.push(x); };
  objects.forEach((body, i) => { offsets.push(out.length); append(out, raw(`${i + 1} 0 obj\n`)); append(out, body); append(out, raw('\nendobj\n')); });
  const xref = out.length;
  out.push(...raw(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  for (const o of offsets) out.push(...raw(`${String(o).padStart(10, '0')} 00000 n \n`));
  out.push(...raw(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Uint8Array.from(out);
}
