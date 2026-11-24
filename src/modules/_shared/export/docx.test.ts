// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DocBlock } from './document-model';
import { buildDocx, xmlText } from './docx';
import { logoBytes } from './logo-fixture';

/** Relit les entrées d'une archive « stockée » (sans compression), comme celle que produit buildDocx. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, string> = {};
  let pos = 0;
  while (pos + 30 <= bytes.length && view.getUint32(pos, true) === 0x04034b50) {
    const size = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const start = pos + 30 + nameLen + extraLen;
    out[name] = new TextDecoder().decode(bytes.subarray(start, start + size));
    pos = start + size;
  }
  return out;
}

/** Vérifie que le XML est bien formé : balises ouvertes et fermées dans l'ordre. */
function wellFormed(xml: string): boolean {
  const body = xml.replace(/<\?xml[^>]*\?>/, '');
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self === '/') continue;
    if (close === '/') { if (stack.pop() !== name) return false; } else stack.push(name as string);
  }
  return stack.length === 0;
}

const blocks: DocBlock[] = [
  { kind: 'title', text: 'Synthèse du dossier médical' },
  { kind: 'meta', text: 'Patient : Amina' },
  { kind: 'note', text: 'À relire.' },
  { kind: 'heading', text: 'Diagnostics' },
  { kind: 'paragraph', text: 'Texte & <balise> "guillemets"\nsecond ligne' },
  { kind: 'bullets', items: ['Paludisme (B54)', 'Anémie'] },
  { kind: 'writeIn', lines: 3 },
];

describe('fichier Word', () => {
  it('contient toutes les parties d\'un .docx', () => {
    const files = unzip(buildDocx(blocks, { title: 'Synthèse', footer: '' }));
    expect(Object.keys(files)).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/numbering.xml', 'word/footer1.xml', 'docProps/core.xml']);
    expect(files['[Content_Types].xml']).toContain('/word/document.xml');
    expect(files['_rels/.rels']).toContain('word/document.xml');
  });
  it('produit du XML bien formé dans chaque partie', () => {
    const files = unzip(buildDocx(blocks, { title: 'Synthèse & <test>', footer: '' }));
    for (const [name, xml] of Object.entries(files)) expect(wellFormed(xml), name).toBe(true);
  });
  it('écrit le texte avec ses accents, échappé, avec retour à la ligne', () => {
    const doc = unzip(buildDocx(blocks, { title: '', footer: '' }))['word/document.xml'] as string;
    expect(doc).toContain('Synthèse du dossier médical');
    expect(doc).toContain('Texte &amp; &lt;balise&gt; &quot;guillemets&quot;');
    expect(doc).toContain('<w:br/>');
    expect(doc).not.toContain('<balise>');
  });
  it('utilise de vrais styles Word, de vraies puces et des lignes à remplir', () => {
    const doc = unzip(buildDocx(blocks, { title: '', footer: '' }))['word/document.xml'] as string;
    expect(doc).toContain('w:val="Title"');
    expect(doc).toContain('w:val="Heading1"');
    expect(doc.match(/<w:numPr>/g)).toHaveLength(2);
    expect(doc.match(/<w:pBdr>/g)).toHaveLength(3);
    expect(doc).toContain('w:w="11906" w:h="16838"');
  });
  it('retire les caractères interdits en XML', () => {
    expect(xmlText('a\u0000b\u0008c\u000Bd\u001Fe')).toBe('abcde');
    expect(xmlText('ok\tligne\nfin')).toBe('ok\tligne\nfin');
    const doc = unzip(buildDocx([{ kind: 'paragraph', text: 'x\u0000y' }], { title: '', footer: '' }))['word/document.xml'] as string;
    expect(doc).toContain('>xy<');
  });
  it('donne toujours le même fichier pour le même contenu', () => {
    const a = buildDocx(blocks, { title: 'T', footer: '' });
    const b = buildDocx(blocks, { title: 'T', footer: '' });
    expect(Array.from(a)).toEqual(Array.from(b));
  });
  it('accepte un document sans bloc', () => {
    const files = unzip(buildDocx([], { title: '', footer: '' }));
    expect(wellFormed(files['word/document.xml'] as string)).toBe(true);
  });
});

const letterhead = { name: 'Hôpital Général', lines: ['12, avenue de la Santé', 'Tél. +243 1'] };
const rich: DocBlock[] = [
  { kind: 'title', text: 'Synthèse' },
  { kind: 'facts', rows: [{ label: 'Patient', value: 'Amina <&>' }, { label: 'Dossier', value: 'DOS-1' }, { label: 'Sexe', value: 'Féminin' }] },
  { kind: 'stats', items: [{ value: '42', label: 'consultations' }, { value: '9 ans', label: 'de suivi' }] },
  { kind: 'table', head: ['Motif', 'Fois'], rows: [['Suivi', '17'], ['Contrôle', '9'], ['Vaccination', '8']], widths: [3, 1], align: ['left', 'right'] },
  { kind: 'signature', labels: ['Médecin', 'Cachet'] },
];
const richMeta = { title: 'Synthèse', footer: 'Synthèse DOS-1', letterhead, confidential: 'Confidentiel', pageLabel: 'Page' };

describe('fichier Word : mise en page professionnelle', () => {
  const files = unzip(buildDocx(rich, richMeta));
  const doc = files['word/document.xml'] as string;
  it('produit du XML bien formé dans chaque partie, pied de page compris', () => {
    for (const [name, xml] of Object.entries(files)) expect(wellFormed(xml), name).toBe(true);
  });
  it('écrit l\'en-tête de l\'établissement avec ses styles', () => {
    expect(doc).toContain('w:val="LhName"');
    expect(doc).toContain('Hôpital Général');
    expect(doc).toContain('12, avenue de la Santé');
    expect(doc).toContain('w:val="LhLine"');
  });
  it('construit de vrais tableaux Word : en-tête répété, colonnes alignées, alternance de fond', () => {
    expect(doc.match(/<w:tbl>/g)?.length).toBeGreaterThanOrEqual(4);
    expect(doc).toContain('<w:tblHeader/>');
    expect(doc).toContain('w:fill="0F4C5C"');
    expect(doc).toContain('w:fill="EEF4F5"');
    expect(doc).toContain('<w:jc w:val="right"/>');
    expect(doc).toContain('Contrôle');
  });
  it('largeurs de colonnes : la somme égale la largeur utile', () => {
    const grids = [...doc.matchAll(/<w:tblGrid>(.*?)<\/w:tblGrid>/g)].map((m) => [...(m[1] as string).matchAll(/w:w="(\d+)"/g)].reduce((a, x) => a + Number(x[1]), 0));
    expect(grids.length).toBeGreaterThanOrEqual(4);
    for (const g of grids) expect(g).toBe(9638);
  });
  it('échappe le texte des cases', () => {
    expect(doc).toContain('Amina &lt;&amp;&gt;');
    expect(doc).not.toContain('<&>');
  });
  it('ajoute un pied de page avec numéro de page automatique et confidentialité', () => {
    const footer = files['word/footer1.xml'] as string;
    expect(footer).toContain(' PAGE ');
    expect(footer).toContain(' NUMPAGES ');
    expect(footer).toContain('Hôpital Général');
    expect(footer).toContain('Synthèse DOS-1');
    expect(footer).toContain('Confidentiel');
    expect(doc).toContain('<w:footerReference w:type="default" r:id="rId3"/>');
    expect(files['word/_rels/document.xml.rels']).toContain('footer1.xml');
    expect(files['[Content_Types].xml']).toContain('/word/footer1.xml');
  });
  it('sépare deux tableaux voisins par un paragraphe (Word les fusionnerait sinon)', () => {
    expect(doc).not.toContain('</w:tbl><w:tbl>');
  });
  it('dessine les espaces de signature', () => {
    expect(doc).toContain('Médecin');
    expect(doc).toContain('Cachet');
    expect(doc).toContain('w:hRule="atLeast"');
  });
  it('accepte tableau, chiffres clés et fiche vides', () => {
    const f = unzip(buildDocx([{ kind: 'table', head: ['A'], rows: [] }, { kind: 'stats', items: [] }, { kind: 'facts', rows: [] }, { kind: 'signature', labels: [] }], { title: '', footer: '' }));
    for (const [name, xml] of Object.entries(f)) expect(wellFormed(xml), name).toBe(true);
  });
  it('reste identique pour le même contenu', () => {
    expect(Array.from(buildDocx(rich, richMeta))).toEqual(Array.from(buildDocx(rich, richMeta)));
  });
});

describe('fichier Word : logo de l\'établissement', () => {
  const logo = { bytes: logoBytes(), width: 60, height: 30, components: 3 as const };
  const bytes = buildDocx(rich, { ...richMeta, letterhead: { ...letterhead, logo } });
  const files = unzip(bytes);
  it('range l\'image dans word/media et la déclare (types, relations)', () => {
    expect(Object.keys(files)).toContain('word/media/logo1.jpeg');
    expect(files['[Content_Types].xml']).toContain('Extension="jpeg"');
    expect(files['word/_rels/document.xml.rels']).toContain('media/logo1.jpeg');
  });
  it('place l\'image en ligne, à côté du nom, avec des dimensions proportionnelles', () => {
    const doc = files['word/document.xml'] as string;
    expect(doc).toContain('<wp:inline');
    expect(doc).toContain('r:embed="rId4"');
    const ext = doc.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
    expect(Number(ext?.[1]) / Number(ext?.[2])).toBe(2);
    expect(doc).toContain('Hôpital Général');
  });
  it('reste un XML bien formé', () => {
    for (const [name, xml] of Object.entries(files)) if (name.endsWith('.xml') || name.endsWith('.rels')) expect(wellFormed(xml), name).toBe(true);
  });
  it('conserve les octets du JPEG sans les modifier', () => {
    const raw = bytes;
    const needle = logoBytes();
    let found = false;
    outer: for (let i = 0; i + needle.length <= raw.length; i += 1) {
      if (raw[i] !== needle[0]) continue;
      for (let j = 1; j < needle.length; j += 1) if (raw[i + j] !== needle[j]) continue outer;
      found = true; break;
    }
    expect(found).toBe(true);
  });
  it('sans logo : aucune image ni relation', () => {
    const plain = unzip(buildDocx(rich, richMeta));
    expect(Object.keys(plain)).not.toContain('word/media/logo1.jpeg');
    expect(plain['word/_rels/document.xml.rels']).not.toContain('media/');
    expect(plain['word/document.xml']).not.toContain('<wp:inline');
  });
});
