/**
 * Contenu riche des comptes rendus : document JSON (format Tiptap/ProseMirror), JAMAIS du HTML stocké.
 * Tout contenu lu (API, modèle, collage) passe par `sanitizeDoc` (liste blanche de nœuds, marques et attributs),
 * et le HTML d'impression est produit par `renderDocToHtml` qui échappe chaque texte.
 */

export interface RichMark {
  type: 'bold' | 'italic' | 'underline' | 'strike';
}
export interface RichNode {
  type: string;
  attrs?: Record<string, string | number>;
  content?: RichNode[];
  text?: string;
  marks?: RichMark[];
}
export interface RichDoc {
  type: 'doc';
  content: RichNode[];
}

export const EMPTY_DOC: RichDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const BLOCKS = new Set([
  'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule',
  'table', 'tableRow', 'tableHeader', 'tableCell',
]);
const MARKS = new Set(['bold', 'italic', 'underline', 'strike']);
const ALIGNS = new Set(['left', 'center', 'right', 'justify']);
const MAX_DEPTH = 12;

function cleanAttrs(type: string, attrs: unknown): Record<string, string | number> | undefined {
  if (typeof attrs !== 'object' || attrs === null) return undefined;
  const a = attrs as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  if (type === 'heading') out.level = a.level === 3 ? 3 : 2;
  if ((type === 'paragraph' || type === 'heading') && typeof a.textAlign === 'string' && ALIGNS.has(a.textAlign)) {
    out.textAlign = a.textAlign;
  }
  if (type === 'tableCell' || type === 'tableHeader') {
    for (const key of ['colspan', 'rowspan'] as const) {
      const n = Number(a[key]);
      if (Number.isInteger(n) && n >= 1 && n <= 20) out[key] = n;
    }
  }
  if (type === 'orderedList') {
    const n = Number(a.start);
    if (Number.isInteger(n) && n >= 1 && n <= 9999) out.start = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function cleanNode(raw: unknown, depth: number): RichNode | null {
  if (typeof raw !== 'object' || raw === null || depth > MAX_DEPTH) return null;
  const n = raw as Record<string, unknown>;
  if (n.type === 'text') {
    if (typeof n.text !== 'string' || n.text === '') return null;
    const marks = Array.isArray(n.marks)
      ? (n.marks as unknown[])
          .map((m) => (typeof m === 'object' && m !== null ? (m as { type?: unknown }).type : null))
          .filter((t): t is RichMark['type'] => typeof t === 'string' && MARKS.has(t))
          .map((type) => ({ type }))
      : [];
    return marks.length > 0 ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text };
  }
  if (n.type === 'hardBreak') return { type: 'hardBreak' };
  if (typeof n.type !== 'string' || !BLOCKS.has(n.type)) return null;
  const node: RichNode = { type: n.type };
  const attrs = cleanAttrs(n.type, n.attrs);
  if (attrs) node.attrs = attrs;
  if (Array.isArray(n.content)) {
    const children = (n.content as unknown[]).map((c) => cleanNode(c, depth + 1)).filter((c): c is RichNode => c !== null);
    if (children.length > 0) node.content = children;
  }
  return node;
}

/** Valide un document inconnu. Retourne toujours un document valide (vide si l'entrée est inutilisable). */
export function sanitizeDoc(input: unknown): RichDoc {
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return { type: 'doc', content: [{ type: 'paragraph' }] };
    }
  }
  if (typeof value !== 'object' || value === null || (value as { type?: unknown }).type !== 'doc') return EMPTY_DOC;
  const content = (value as { content?: unknown }).content;
  const nodes = Array.isArray(content) ? (content as unknown[]).map((c) => cleanNode(c, 1)).filter((c): c is RichNode => c !== null) : [];
  return nodes.length > 0 ? { type: 'doc', content: nodes } : EMPTY_DOC;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function renderText(node: RichNode): string {
  let html = escapeHtml(node.text ?? '');
  for (const mark of node.marks ?? []) {
    const tag = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }[mark.type];
    html = `<${tag}>${html}</${tag}>`;
  }
  return html;
}

function renderNode(node: RichNode): string {
  if (node.type === 'text') return renderText(node);
  if (node.type === 'hardBreak') return '<br>';
  if (node.type === 'horizontalRule') return '<hr>';
  const inner = (node.content ?? []).map(renderNode).join('');
  const align = node.attrs?.textAlign ? ` style="text-align:${String(node.attrs.textAlign)}"` : '';
  switch (node.type) {
    case 'paragraph': return `<p${align}>${inner || '<br>'}</p>`;
    case 'heading': return `<h${node.attrs?.level === 3 ? 3 : 2}${align}>${inner}</h${node.attrs?.level === 3 ? 3 : 2}>`;
    case 'bulletList': return `<ul>${inner}</ul>`;
    case 'orderedList': return `<ol>${inner}</ol>`;
    case 'listItem': return `<li>${inner}</li>`;
    case 'blockquote': return `<blockquote>${inner}</blockquote>`;
    case 'table': return `<table><tbody>${inner}</tbody></table>`;
    case 'tableRow': return `<tr>${inner}</tr>`;
    case 'tableHeader':
    case 'tableCell': {
      const tag = node.type === 'tableHeader' ? 'th' : 'td';
      const span = (['colspan', 'rowspan'] as const).map((k) => (node.attrs?.[k] ? ` ${k}="${Number(node.attrs[k])}"` : '')).join('');
      return `<${tag}${span}>${inner}</${tag}>`;
    }
    default: return inner;
  }
}

/** HTML sûr (tout texte échappé, balises en liste blanche) pour l'aperçu et l'impression. */
export function renderDocToHtml(doc: unknown): string {
  return sanitizeDoc(doc).content.map(renderNode).join('');
}

function textOf(node: RichNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(textOf).join(node.type === 'doc' || node.type === 'table' || node.type === 'tableRow' ? '\n' : '');
}

/** Texte brut (recherche, contrôles de complétude). */
export function docToText(doc: unknown): string {
  return sanitizeDoc(doc).content.map(textOf).join('\n').trim();
}

export const isEmptyDoc = (doc: unknown): boolean => docToText(doc) === '' && !JSON.stringify(sanitizeDoc(doc)).includes('"table"');

// Constructeurs pour les modèles.
export const para = (text = ''): RichNode => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' });
export const heading = (text: string, level: 2 | 3 = 2): RichNode => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
export const docOf = (...nodes: RichNode[]): RichDoc => ({ type: 'doc', content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }] });
