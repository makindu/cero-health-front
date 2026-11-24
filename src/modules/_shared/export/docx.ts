import type { DocBlock, DocLogo, DocMeta } from './document-model';
import { zipStore } from './xlsx';

/**
 * Fichier Word (.docx) modifiable, sans dépendance : un .docx est une archive zip de petits fichiers XML.
 * Titres et listes utilisent de vrais styles Word, donc le médecin retouche le texte comme dans n'importe quel document.
 */

const encoder = new TextEncoder();

/** Échappe le texte pour XML et retire les caractères interdits (un seul suffit à rendre le fichier illisible dans Word). */
export function xmlText(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Couleurs : même palette que le PDF. */
const C = { ink: '1A2B30', accent: '0F4C5C', muted: '5B6B70', tint: 'EEF4F5', rule: 'C7D5D9', white: 'FFFFFF' };
/** Largeur utile en vingtièmes de point : A4 moins deux marges de 2 cm. */
const TEXT_W = 9638;

function runs(text: string, extra = ''): string {
  return text.split('\n').map((line, i) => `${i > 0 ? '<w:r><w:br/></w:r>' : ''}<w:r>${extra ? `<w:rPr>${extra}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlText(line)}</w:t></w:r>`).join('');
}
const para = (style: string, text: string, extraPPr = ''): string =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extraPPr}</w:pPr>${runs(text)}</w:p>`;
/** Petit paragraphe vide : sépare deux tableaux (Word les fusionnerait sinon) sans ajouter d'espace visible. */
const GAP = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/></w:pPr></w:p>';

const cellP = (text: string, o: { size?: number; bold?: boolean; color?: string; right?: boolean; before?: number; after?: number } = {}): string =>
  `<w:p><w:pPr><w:spacing w:before="${o.before ?? 50}" w:after="${o.after ?? 50}" w:line="252" w:lineRule="auto"/>${o.right ? '<w:jc w:val="right"/>' : ''}</w:pPr>${runs(text, `${o.bold ? '<w:b/>' : ''}<w:color w:val="${o.color ?? C.ink}"/><w:sz w:val="${o.size ?? 17}"/>`)}</w:p>`;

const border = (side: string, val: string, sz: number, color: string): string => `<w:${side} w:val="${val}" w:sz="${sz}" w:space="0" w:color="${color}"/>`;
function tc(width: number, content: string, o: { fill?: string; borders?: string; margins?: string } = {}): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${o.borders ? `<w:tcBorders>${o.borders}</w:tcBorders>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}${o.margins ?? ''}</w:tcPr>${content}</w:tc>`;
}
function tbl(cols: number[], rows: string, tblBorders = ''): string {
  return `<w:tbl><w:tblPr><w:tblW w:w="${cols.reduce((a, c) => a + c, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${tblBorders ? `<w:tblBorders>${tblBorders}</w:tblBorders>` : ''}<w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cols.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>${GAP}`;
}
const tr = (cells: string, o: { header?: boolean; height?: number } = {}): string =>
  `<w:tr><w:trPr><w:cantSplit/>${o.header ? '<w:tblHeader/>' : ''}${o.height ? `<w:trHeight w:val="${o.height}" w:hRule="atLeast"/>` : ''}</w:trPr>${cells}</w:tr>`;
const split = (n: number): number[] => { const w = Math.floor(TEXT_W / n); return Array.from({ length: n }, (_, i) => (i === n - 1 ? TEXT_W - w * (n - 1) : w)); };

function factsXml(rows: readonly { label: string; value: string }[]): string {
  if (rows.length === 0) return '';
  const cols = split(2);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 2) {
    const pair = rows.slice(i, i + 2);
    const cells = [0, 1].map((ci) => {
      const r = pair[ci];
      const content = r ? cellP(r.label, { size: 15, color: C.muted, before: 70, after: 0 }) + cellP(r.value || '—', { size: 20, bold: true, before: 10, after: 70 }) : cellP('', { before: 70, after: 70 });
      return tc(cols[ci] as number, content, { fill: C.tint, borders: ci === 0 ? border('left', 'single', 24, C.accent) : '' });
    });
    out.push(tr(cells.join('')));
  }
  return tbl(cols, out.join(''));
}

function statsXml(items: readonly { value: string; label: string }[]): string {
  if (items.length === 0) return '';
  const cols = split(Math.max(1, items.length));
  const cells = items.map((it, i) => tc(cols[i] as number,
    cellP(it.value, { size: 40, bold: true, color: C.accent, before: 100, after: 0 }) + cellP(it.label, { size: 16, color: C.muted, before: 0, after: 100 }),
    { fill: C.tint, borders: border('top', 'single', 12, C.accent) + border('left', 'single', 36, C.white) + border('right', 'single', 36, C.white) }));
  return tbl(cols, tr(cells.join('')));
}

function tableXml(b: Extract<DocBlock, { kind: 'table' }>): string {
  const n = Math.max(1, b.head.length);
  const weights = Array.from({ length: n }, (_, i) => Math.max(0.1, b.widths?.[i] ?? 1));
  const total = weights.reduce((a, c) => a + c, 0);
  const cols = weights.map((w) => Math.round((w / total) * TEXT_W));
  cols[n - 1] = TEXT_W - cols.slice(0, n - 1).reduce((a, c) => a + c, 0);
  const right = (i: number): boolean => b.align?.[i] === 'right';
  const head = tr(b.head.map((h, i) => tc(cols[i] as number, cellP(h, { bold: true, color: C.white, size: 17, right: right(i) }), { fill: C.accent })).join(''), { header: true });
  const body = b.rows.map((r, ri) => tr(cols.map((w, i) => tc(w, cellP(r[i] ?? '', { right: right(i) }), { fill: ri % 2 === 1 ? C.tint : '' })).join(''))).join('');
  return tbl(cols, head + body, border('bottom', 'single', 6, C.rule) + border('insideH', 'single', 2, C.rule));
}

function signatureXml(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  const cols = split(Math.max(1, labels.length));
  const gapB = border('left', 'single', 24, C.white) + border('right', 'single', 24, C.white);
  const line = tr(cols.map((w) => tc(w, cellP(''), { borders: gapB + border('bottom', 'single', 6, C.muted) })).join(''), { height: 900 });
  const names = tr(cols.map((w, i) => tc(w, cellP(labels[i] ?? '', { size: 16, color: C.muted }), { borders: gapB })).join(''));
  return tbl(cols, line + names);
}

/** Image en ligne (EMU : 12 700 par point). Taille : 150 x 54 points au plus, proportions respectées. */
function logoXml(logo: DocLogo): { xml: string; cx: number } {
  const k = Math.min(150 / logo.width, 54 / logo.height, 4);
  const cx = Math.round(logo.width * k * 12700);
  const cy = Math.round(logo.height * k * 12700);
  const xml = `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logo" descr="Logo de l'établissement"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

  return { xml, cx };
}

function letterheadXml(lh: NonNullable<DocMeta['letterhead']>): string {
  const lines = lh.lines.filter((l) => l !== '');
  const last = lines.length;
  if (lh.logo) {
    // Nom et coordonnées à gauche, logo à droite, un même filet d'accent dessous.
    const logo = logoXml(lh.logo);
    const logoW = Math.min(TEXT_W - 3000, Math.round(logo.cx / 635) + 200); // EMU -> vingtièmes de point, plus une marge
    const cols = [TEXT_W - logoW, logoW];
    const rule = border('bottom', 'single', 12, C.accent);
    const left = para('LhName', lh.name) + lines.map((l) => para('LhLine', l)).join('');
    const right = `<w:p><w:pPr><w:spacing w:before="0" w:after="60"/><w:jc w:val="right"/></w:pPr>${logo.xml}</w:p>`;
    return tbl(cols, tr(tc(cols[0] as number, left, { borders: rule }) + tc(cols[1] as number, right, { borders: rule }))) + '<w:p><w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr></w:p>';
  }
  return para('LhName', lh.name) + lines.map((l, i) => para('LhLine', l, i === last - 1 ? `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="${C.accent}"/></w:pBdr><w:spacing w:after="240"/>` : '')).join('')
    + (last === 0 ? `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="${C.accent}"/></w:pBdr><w:spacing w:after="240"/></w:pPr></w:p>` : '');
}

function blockXml(b: DocBlock): string {
  switch (b.kind) {
    case 'title': return para('Title', b.text);
    case 'heading': return para('Heading1', b.text);
    case 'note': return para('Note', b.text);
    case 'meta': return para('Meta', b.text);
    case 'paragraph': return para('', b.text);
    case 'bullets': return b.items.map((it) => para('ListParagraph', it, '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')).join('');
    case 'facts': return factsXml(b.rows);
    case 'stats': return statsXml(b.items);
    case 'table': return tableXml(b);
    case 'signature': return signatureXml(b.labels);
    case 'writeIn': return Array.from({ length: Math.max(0, b.lines) }, () => '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="999999"/></w:pBdr><w:spacing w:before="240"/></w:pPr></w:p>').join('');
  }
}

const style = (id: string, name: string, ppr: string, rpr: string, extra = ''): string =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${extra}<w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;

const STYLES = `${HEAD}<w:styles ${NS}>`
  + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="${C.ink}"/><w:sz w:val="21"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
  + style('Title', 'Title', '<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="6" w:color="' + C.accent + '"/></w:pBdr><w:spacing w:before="120" w:after="200"/>', '<w:b/><w:sz w:val="44"/>', '<w:next w:val="Normal"/>')
  + style('Heading1', 'heading 1', '<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="3" w:color="' + C.rule + '"/></w:pBdr><w:spacing w:before="360" w:after="140"/>', `<w:b/><w:color w:val="${C.accent}"/><w:sz w:val="26"/>`, '<w:next w:val="Normal"/>')
  + style('Meta', 'Meta', '<w:spacing w:after="40"/>', '')
  + style('Note', 'Note', `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${C.rule}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${C.tint}"/><w:spacing w:before="200" w:after="200"/><w:ind w:left="200" w:right="100"/>`, `<w:i/><w:color w:val="${C.muted}"/><w:sz w:val="18"/>`)
  + style('ListParagraph', 'List Paragraph', '<w:spacing w:after="60"/><w:ind w:left="720"/>', '')
  + style('LhName', 'Letterhead Name', '<w:spacing w:before="0" w:after="40"/>', `<w:b/><w:color w:val="${C.accent}"/><w:sz w:val="32"/>`)
  + style('LhLine', 'Letterhead Line', '<w:spacing w:before="0" w:after="20" w:line="240" w:lineRule="auto"/>', `<w:color w:val="${C.muted}"/><w:sz w:val="17"/>`)
  + style('Footer', 'footer', `<w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="${C.rule}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${TEXT_W}"/></w:tabs><w:spacing w:before="0" w:after="0"/>`, `<w:color w:val="${C.muted}"/><w:sz w:val="15"/>`)
  + '</w:styles>';

const NUMBERING = `${HEAD}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>`
  + `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:color w:val="${C.accent}"/></w:rPr></w:lvl>`
  + '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';

const field = (code: string, shown: string): string =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${shown}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;

/** Pied de page Word : établissement et référence à gauche, « Page n / N » à droite (champs mis à jour par Word), confidentialité dessous. */
function footerXml(meta: DocMeta): string {
  const left = [meta.letterhead?.name ?? '', meta.footer].filter((x) => x !== '').join('  ·  ');
  const page = meta.pageLabel ?? 'Page';
  const main = `<w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:t xml:space="preserve">${xmlText(left)}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:rPr><w:b/><w:color w:val="${C.ink}"/></w:rPr><w:t xml:space="preserve">${xmlText(page)} </w:t></w:r>${field('PAGE', '1')}<w:r><w:t xml:space="preserve"> / </w:t></w:r>${field('NUMPAGES', '1')}</w:p>`;
  const conf = meta.confidential ? `<w:p><w:pPr><w:spacing w:before="40" w:after="0"/></w:pPr>${runs(meta.confidential, `<w:i/><w:color w:val="${C.muted}"/><w:sz w:val="14"/>`)}</w:p>` : '';
  return `${HEAD}<w:ftr ${NS}>${main}${conf}</w:ftr>`;
}

const contentTypes = (withLogo: boolean): string => `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + (withLogo ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '')
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
  + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
  + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';

const ROOT_RELS = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';

const docRels = (withLogo: boolean): string => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
  + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
  + (withLogo ? '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo1.jpeg"/>' : '')
  + '</Relationships>';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Construit le .docx (A4, marges de 2 cm). `meta.title` devient le titre du fichier dans les propriétés. */
export function buildDocx(blocks: readonly DocBlock[], meta: DocMeta): Uint8Array {
  const body = (meta.letterhead ? letterheadXml(meta.letterhead) : '') + blocks.map(blockXml).join('');
  const document = `${HEAD}<w:document ${NS}><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const core = `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlText(meta.title)}</dc:title></cp:coreProperties>`;
  const logo = meta.letterhead?.logo;
  const files: { name: string; data: Uint8Array }[] = ([
    ['[Content_Types].xml', contentTypes(!!logo)], ['_rels/.rels', ROOT_RELS], ['word/document.xml', document], ['word/_rels/document.xml.rels', docRels(!!logo)],
    ['word/styles.xml', STYLES], ['word/numbering.xml', NUMBERING], ['word/footer1.xml', footerXml(meta)], ['docProps/core.xml', core],
  ] as [string, string][]).map(([name, text]) => ({ name, data: encoder.encode(text) }));
  if (logo) files.splice(7, 0, { name: 'word/media/logo1.jpeg', data: logo.bytes });
  return zipStore(files);
}
