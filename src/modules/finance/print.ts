import type { Invoice, LedgerEntry } from '@/core/billing/invoice';

/** Impression via un iframe masqué (aucune donnée n'est envoyée nulle part ; tout reste sur l'appareil). */
const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface PrintLabels {
  facility: string;
  localNotice: string;
  invoice: string;
  receipt: string;
  number: string;
  patient: string;
  date: string;
  item: string;
  qty: string;
  billable: string;
  insurer: string;
  subscription: string;
  patientShare: string;
  total: string;
  paid: string;
  balance: string;
  method: string;
  reference: string;
  cashier: string;
  thanks: string;
  organizationsDue: string;
  methods: Record<string, string>;
}

function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset:auto 0 0 auto;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  win.addEventListener('afterprint', () => frame.remove());
  setTimeout(() => { win.focus(); win.print(); }, 50);
}

export function invoiceHtml(invoice: Invoice, paid: number, balance: number, orgNames: Record<string, string>, L: PrintLabels, money: (n: number) => string, day: (iso: string) => string): string {
  const rows = invoice.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${l.quantity}</td><td class="r">${esc(money(l.billable))}</td><td class="r">${esc(money(l.insurerShares.reduce((s, x) => s + x.amount, 0)))}</td><td class="r">${esc(money(l.subscriptionShare))}</td><td class="r">${esc(money(l.patientShare))}</td></tr>`).join('');
  const orgs = [...new Map(invoice.lines.flatMap((l) => l.insurerShares).map((s) => [s.organizationId, 0])).keys()]
    .map((id) => `<li>${esc(orgNames[id] ?? id)} : ${esc(money(invoice.lines.flatMap((l) => l.insurerShares).filter((s) => s.organizationId === id).reduce((s, x) => s + x.amount, 0)))}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(invoice.number)}</title><style>
  body{font:12px/1.4 system-ui,sans-serif;margin:16mm;color:#000} h1{font-size:18px;margin:0 0 4px} table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{border-bottom:1px solid #999;padding:4px 6px;text-align:left} .r{text-align:right;font-variant-numeric:tabular-nums} .note{font-size:10px;border:1px solid #000;padding:4px;margin-top:12px}
  @page{size:A4;margin:12mm}</style></head><body>
  <h1>${esc(L.invoice)} ${esc(invoice.number)}</h1><div>${esc(L.facility)}</div>
  <p>${esc(L.patient)} : <b>${esc(invoice.patientName)}</b><br>${esc(L.date)} : ${esc(day(invoice.createdAt))}</p>
  <table><thead><tr><th>${esc(L.item)}</th><th class="r">${esc(L.qty)}</th><th class="r">${esc(L.billable)}</th><th class="r">${esc(L.insurer)}</th><th class="r">${esc(L.subscription)}</th><th class="r">${esc(L.patientShare)}</th></tr></thead><tbody>${rows}</tbody>
  <tfoot><tr><th>${esc(L.total)}</th><th></th><th class="r">${esc(money(invoice.totals.billable))}</th><th class="r">${esc(money(invoice.totals.insurer))}</th><th class="r">${esc(money(invoice.totals.subscription))}</th><th class="r">${esc(money(invoice.totals.patient))}</th></tr></tfoot></table>
  ${orgs ? `<p>${esc(L.organizationsDue)}</p><ul>${orgs}</ul>` : ''}
  <p>${esc(L.paid)} : <b>${esc(money(paid))}</b> — ${esc(L.balance)} : <b>${esc(money(balance))}</b></p>
  <div class="note">${esc(L.localNotice)}</div></body></html>`;
}

/** Reçu étroit (imprimante thermique 80 mm). */
export function receiptHtml(entry: LedgerEntry, invoice: Invoice, balance: number, L: PrintLabels, money: (n: number) => string, dateTime: (iso: string) => string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(entry.id)}</title><style>
  body{font:11px/1.35 ui-monospace,Menlo,monospace;width:72mm;margin:0 auto;color:#000} h1{font-size:13px;text-align:center;margin:4px 0} hr{border:0;border-top:1px dashed #000}
  .row{display:flex;justify-content:space-between;gap:6px} .c{text-align:center} @page{size:80mm auto;margin:4mm}</style></head><body>
  <h1>${esc(L.receipt)}</h1><div class="c">${esc(L.facility)}</div><hr>
  <div class="row"><span>${esc(L.number)}</span><span>${esc(entry.id)}</span></div>
  <div class="row"><span>${esc(L.invoice)}</span><span>${esc(invoice.number)}</span></div>
  <div class="row"><span>${esc(L.date)}</span><span>${esc(dateTime(entry.at))}</span></div>
  <div>${esc(L.patient)} : ${esc(invoice.patientName)}</div><hr>
  <div class="row"><b>${esc(L.paid)}</b><b>${esc(money(entry.amount))}</b></div>
  <div class="row"><span>${esc(L.method)}</span><span>${esc(L.methods[entry.method ?? 'cash'] ?? entry.method ?? '')}</span></div>
  ${entry.reference ? `<div class="row"><span>${esc(L.reference)}</span><span>${esc(entry.reference)}</span></div>` : ''}
  <div class="row"><span>${esc(L.balance)}</span><span>${esc(money(balance))}</span></div>
  <div class="row"><span>${esc(L.cashier)}</span><span>${esc(entry.cashier)}</span></div><hr>
  <div class="c">${esc(L.thanks)}</div><div class="c" style="font-size:9px;margin-top:6px">${esc(L.localNotice)}</div></body></html>`;
}

export const printDocument = printHtml;
