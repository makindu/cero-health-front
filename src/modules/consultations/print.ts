import { renderDocToHtml } from './richtext/doc';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ReportSection {
  title: string;
  /** Document riche (JSON) OU texte simple. */
  doc?: unknown;
  text?: string;
}
export interface ReportData {
  title: string;
  facility: string;
  patientLines: string[];
  practitionerLines: string[];
  signatureLine?: string;
  demoMark?: string;
  sections: ReportSection[];
  footer: string;
}

const CSS = `
@page{size:A4;margin:18mm}
body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11pt;line-height:1.45}
header{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
h1{font-size:16pt;margin:0}h2{font-size:12.5pt;margin:16px 0 4px;border-bottom:1px solid #999}h3{font-size:11pt;margin:10px 0 2px}
.meta{display:flex;gap:24px;margin:8px 0}.meta div{flex:1;font-size:10pt}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #888;padding:3px 6px;vertical-align:top}
blockquote{border-left:3px solid #999;margin:6px 0;padding-left:10px}
.demo{border:2px dashed #b45309;padding:4px 8px;margin:8px 0;font-weight:bold}
.sign{margin-top:28px;text-align:right}footer{margin-top:24px;font-size:9pt;color:#555;border-top:1px solid #999;padding-top:4px}
section{break-inside:avoid-page}
`;

/** HTML complet et autonome du compte rendu. Tous les textes sont échappés ; le contenu riche passe par `renderDocToHtml`. */
export function buildReportHtml(r: ReportData): string {
  const list = (lines: string[]) => lines.map((l) => `<div>${esc(l)}</div>`).join('');
  const sections = r.sections
    .map((s) => `<section><h2>${esc(s.title)}</h2>${s.doc !== undefined ? renderDocToHtml(s.doc) : `<p>${esc(s.text ?? '')}</p>`}</section>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>${CSS}</style></head><body>
<header><h1>${esc(r.facility)}</h1><div>${esc(r.title)}</div></header>
${r.demoMark ? `<div class="demo">${esc(r.demoMark)}</div>` : ''}
<div class="meta"><div>${list(r.patientLines)}</div><div>${list(r.practitionerLines)}</div></div>
${sections}
${r.signatureLine ? `<div class="sign">${esc(r.signatureLine)}</div>` : ''}
<footer>${esc(r.footer)}</footer></body></html>`;
}

/** Imprime (ou « Enregistrer en PDF » dans la boîte d'impression) via un cadre isolé, sans script ni réseau. */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.setAttribute('sandbox', 'allow-modals allow-same-origin');
  document.body.appendChild(frame);
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 2000);
  };
}
