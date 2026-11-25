/**
 * Reçu imprimable : un seul modèle, trois formats (A4, ticket 80 mm, ticket 58 mm).
 * La première impression est l'original ; les suivantes portent la mention DUPLICATA et leur numéro de copie
 * (le numéro vient du serveur, donc il est le même sur tous les postes).
 */
export const RECEIPT_FORMATS = ['pos80', 'pos58', 'a4'] as const;
export type ReceiptFormat = (typeof RECEIPT_FORMATS)[number];

export interface ReceiptLine { label: string; value: string; strong?: boolean }
export interface ReceiptData {
  title: string;
  facility: { name: string; address?: string; phone?: string; taxNumber?: string };
  number: string;
  dateTime: string;
  lines: ReceiptLine[];
  footer?: string;
  /** 1 = original ; au-delà = duplicata. */
  copyNumber: number;
  duplicateLabel: string;       // ex. « DUPLICATA — copie n° {n} »
  firstPrintedLabel?: string;   // ex. « Original imprimé le … »
}

const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export const isReceiptFormat = (v: unknown): v is ReceiptFormat => typeof v === 'string' && (RECEIPT_FORMATS as readonly string[]).includes(v);

/** Réglages de mise en page par format : largeur utile, corps de texte et règle @page. */
export const FORMAT_SPEC: Record<ReceiptFormat, { page: string; width: string; font: string; mono: boolean }> = {
  a4: { page: 'A4; margin: 16mm', width: '170mm', font: '13px', mono: false },
  pos80: { page: '80mm auto; margin: 3mm', width: '72mm', font: '11px', mono: true },
  pos58: { page: '58mm auto; margin: 2mm', width: '52mm', font: '9.5px', mono: true },
};

export function receiptHtml(d: ReceiptData, format: ReceiptFormat): string {
  const spec = FORMAT_SPEC[format];
  const duplicate = d.copyNumber > 1;
  const banner = duplicate
    ? `<div class="dup">${esc(d.duplicateLabel.replace('{n}', String(d.copyNumber)))}${d.firstPrintedLabel ? `<small>${esc(d.firstPrintedLabel)}</small>` : ''}</div>`
    : '';
  const head = [d.facility.name, d.facility.address, d.facility.phone, d.facility.taxNumber].filter((x): x is string => Boolean(x && x.trim())).map((x, i) => (i === 0 ? `<div class="fac">${esc(x)}</div>` : `<div class="sub">${esc(x)}</div>`)).join('');
  const rows = d.lines.map((l) => `<div class="row${l.strong ? ' strong' : ''}"><span>${esc(l.label)}</span><span class="v">${esc(l.value)}</span></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.number)}${duplicate ? ' — DUPLICATA' : ''}</title><style>
  @page{size:${spec.page}}
  *{box-sizing:border-box}
  body{margin:0 auto;width:${spec.width};color:#000;font:${spec.font}/1.4 ${spec.mono ? 'ui-monospace,Menlo,Consolas,monospace' : 'system-ui,Segoe UI,sans-serif'}}
  .c{text-align:center} .fac{font-weight:700;text-align:center;font-size:1.15em} .sub{text-align:center;font-size:.9em}
  h1{font-size:1.2em;text-align:center;margin:8px 0 2px;text-transform:uppercase} hr{border:0;border-top:1px ${spec.mono ? 'dashed' : 'solid'} #000;margin:6px 0}
  .row{display:flex;justify-content:space-between;gap:8px;padding:1px 0} .row .v{text-align:right;font-variant-numeric:tabular-nums;word-break:break-word}
  .strong{font-weight:700;font-size:1.1em} .foot{text-align:center;margin-top:8px;font-size:.9em}
  .dup{border:2px solid #000;text-align:center;font-weight:800;letter-spacing:.06em;padding:3px 4px;margin:6px 0} .dup small{display:block;font-weight:400;letter-spacing:0;font-size:.8em}
  </style></head><body>${head}<h1>${esc(d.title)}</h1>${banner}<hr>
  <div class="row"><span>N°</span><span class="v">${esc(d.number)}</span></div>
  <div class="row"><span></span><span class="v">${esc(d.dateTime)}</span></div><hr>${rows}<hr>
  ${d.footer ? `<div class="foot">${esc(d.footer)}</div>` : ''}${duplicate ? banner : ''}</body></html>`;
}

const STORAGE_KEY = 'cero-health:receipt-format';
/** Dernier format choisi sur ce poste (l'imprimante change rarement d'une impression à l'autre). */
export function loadReceiptFormat(): ReceiptFormat {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isReceiptFormat(v) ? v : 'pos80';
  } catch {
    return 'pos80';
  }
}
export function saveReceiptFormat(format: ReceiptFormat): void {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, format); } catch { /* stockage indisponible : le choix ne sera pas mémorisé */ }
}
