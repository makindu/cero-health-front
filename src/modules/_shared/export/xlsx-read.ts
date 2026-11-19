/**
 * Lecture d'un classeur Excel (.xlsx) sans dépendance : archive ZIP (entrées stockées ou « deflate »)
 * contenant des XML. Seule la PREMIÈRE feuille est lue. Les cellules sont rendues en texte ; un nombre garde sa
 * forme brute (une date Excel arrive donc comme numéro de série, à convertir par l'appelant).
 * Les formules ne sont jamais évaluées : seule la valeur mise en cache par Excel est lue.
 */

export class XlsxReadError extends Error {
  readonly code: 'notXlsx' | 'unsupported' | 'empty' | 'tooLarge';
  constructor(code: 'notXlsx' | 'unsupported' | 'empty' | 'tooLarge') {
    super(code);
    this.code = code;
    this.name = 'XlsxReadError';
  }
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_UNPACKED = 20 * 1024 * 1024;
const decoder = new TextDecoder('utf-8');

const u16 = (d: DataView, o: number): number => d.getUint16(o, true);
const u32 = (d: DataView, o: number): number => d.getUint32(o, true);

interface Entry { name: string; method: number; compressed: number; size: number; offset: number }

function entriesOf(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (u32(view, i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new XlsxReadError('notXlsx');
  const count = u16(view, end + 10);
  let p = u32(view, end + 16);
  const out: Entry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (p + 46 > bytes.length || u32(view, p) !== 0x02014b50) throw new XlsxReadError('notXlsx');
    const nameLen = u16(view, p + 28);
    out.push({
      method: u16(view, p + 10), compressed: u32(view, p + 20), size: u32(view, p + 24), offset: u32(view, p + 42),
      name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + u16(view, p + 30) + u16(view, p + 32);
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const Stream = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!Stream) throw new XlsxReadError('unsupported');
  const ds = new Stream('deflate-raw');
  const writer = ds.writable.getWriter();
  void writer.write(data as BufferSource).then(() => writer.close()).catch(() => undefined);
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_UNPACKED) throw new XlsxReadError('tooLarge');
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

async function read(bytes: Uint8Array, entry: Entry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (u32(view, entry.offset) !== 0x04034b50) throw new XlsxReadError('notXlsx');
  const start = entry.offset + 30 + u16(view, entry.offset + 26) + u16(view, entry.offset + 28);
  const raw = bytes.subarray(start, start + entry.compressed);
  if (entry.size > MAX_UNPACKED) throw new XlsxReadError('tooLarge');
  if (entry.method === 0) return decoder.decode(raw);
  if (entry.method === 8) return decoder.decode(await inflateRaw(raw));
  throw new XlsxReadError('unsupported');
}

const unescapeXml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

/** Texte de tous les <t> d'un fragment (gère le texte riche : plusieurs <r><t>). */
const textOf = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1] ?? '')).join('');

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Lit la première feuille : tableau de lignes, chaque ligne un tableau de textes (cellules vides = ''). */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  if (bytes.length > MAX_BYTES) throw new XlsxReadError('tooLarge');
  const entries = entriesOf(bytes);
  const sheets = entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)).sort((a, b) => Number(/(\d+)/.exec(a.name)![1]) - Number(/(\d+)/.exec(b.name)![1]));
  const first = sheets[0];
  if (!first) throw new XlsxReadError('notXlsx');
  const sharedEntry = entries.find((e) => e.name === 'xl/sharedStrings.xml');
  const shared = sharedEntry ? [...(await read(bytes, sharedEntry)).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? '')) : [];
  const sheet = await read(bytes, first);
  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    let next = 0;
    for (const cell of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? '';
      const ref = /\br="([A-Z]+)\d+"/i.exec(attrs)?.[1];
      const at = ref ? columnIndex(ref) : next;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const body = cell[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 'inlineStr') value = textOf(body);
      else if (type === 's') value = shared[Number(v)] ?? '';
      else if (v !== undefined) value = unescapeXml(v);
      while (row.length < at) row.push('');
      row[at] = value.trim();
      next = at + 1;
    }
    rows.push(row);
  }
  while (rows.length > 0 && (rows[rows.length - 1] ?? []).every((c) => c === '')) rows.pop();
  if (rows.length === 0) throw new XlsxReadError('empty');
  return rows;
}
