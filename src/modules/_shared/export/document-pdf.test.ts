// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DocBlock } from './document-model';
import { buildDocumentPdf, textWidth, wrapText } from './document-pdf';
import { logoBytes } from './logo-fixture';

const latin = (b: Uint8Array): string => Array.from(b, (x) => String.fromCharCode(x)).join('');
const blocks: DocBlock[] = [
  { kind: 'title', text: 'Synthèse du dossier médical' },
  { kind: 'heading', text: 'Diagnostics' },
  { kind: 'paragraph', text: 'Paludisme récurrent, œdème léger — suivi “régulier”.' },
  { kind: 'bullets', items: ['Paludisme (B54) : retrouvé dans 14 consultations', 'Anémie'] },
  { kind: 'writeIn', lines: 2 },
];

describe('PDF : structure', () => {
  const pdf = latin(buildDocumentPdf(blocks, { title: 'T', footer: 'Synthèse DOS-1' }));
  it('est un PDF complet', () => {
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/BaseFont /Helvetica-Bold');
    expect(pdf).toContain('/WinAnsiEncoding');
  });
  it('indique pour chaque objet une position exacte dans la table de références', () => {
    const xref = Number(pdf.match(/startxref\n(\d+)\n/)?.[1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(5);
    offsets.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
  it('écrit les accents en Windows-1252 (é = E9, œ = 9C, tiret long = 97)', () => {
    expect(pdf).toContain('Synthèse du dossier médical');
    expect(pdf).toContain('\u009c');
    expect(pdf).toContain('\u0097');
    expect(pdf).not.toContain('?dical');
  });
  it('numérote les pages en pied', () => {
    expect(pdf).toContain('(Synthèse DOS-1)');
    expect(pdf).toContain('(Page 1 / 1)');
    expect(pdf).toContain('/Count 1');
  });
  it('trace les lignes à remplir', () => {
    expect(pdf.match(/ l S\n/g)).toHaveLength(2);
  });
});

describe('PDF : pagination et retour à la ligne', () => {
  it('passe sur plusieurs pages quand le texte est long, et annonce le bon nombre', () => {
    const long: DocBlock[] = [{ kind: 'bullets', items: Array.from({ length: 120 }, (_, i) => `Ligne ${i} : un texte assez long pour occuper de la place sur la page`) }];
    const pdf = latin(buildDocumentPdf(long, { title: '', footer: 'F' }));
    const count = Number(pdf.match(/\/Count (\d+)/)?.[1]);
    expect(count).toBeGreaterThan(1);
    expect(pdf).toContain(`(Page ${count} / ${count})`);
    expect([...pdf.matchAll(/\/Type \/Page /g)]).toHaveLength(count);
  });
  it('ne laisse jamais une ligne dépasser la largeur', () => {
    const text = 'Artéméther-luméfantrine : prescrit 17 fois, dernière fois le 05/09/2024 (80/480 mg · 2x/jour · 3 jours) et encore du texte ensuite';
    for (const line of wrapText(text, 10.5, 200)) expect(textWidth(line, 10.5)).toBeLessThanOrEqual(200);
    expect(wrapText(text, 10.5, 200).join(' ')).toBe(text);
  });
  it('coupe un mot plus long que la ligne', () => {
    const lines = wrapText('A'.repeat(200), 10.5, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l, 10.5)).toBeLessThanOrEqual(100);
    expect(lines.join('')).toBe('A'.repeat(200));
  });
  it('garde les retours à la ligne voulus et mesure les lettres accentuées comme leur lettre de base', () => {
    expect(wrapText('a\nb', 10, 500)).toEqual(['a', 'b']);
    expect(wrapText('', 10, 500)).toEqual(['']);
    expect(textWidth('é', 10)).toBe(textWidth('e', 10));
    expect(textWidth('À', 10)).toBe(textWidth('A', 10));
    expect(textWidth('WWW', 10)).toBeGreaterThan(textWidth('iii', 10));
    expect(textWidth('abc', 10, true)).toBeGreaterThan(textWidth('abc', 10));
  });
  it('échappe les parenthèses et barres obliques du texte', () => {
    const pdf = latin(buildDocumentPdf([{ kind: 'paragraph', text: 'a (b) \\ c' }], { title: '', footer: '' }));
    expect(pdf).toContain('(a \\(b\\) \\\\ c)');
  });
  it('produit un PDF valide même sans contenu', () => {
    const pdf = latin(buildDocumentPdf([], { title: '', footer: '' }));
    expect(pdf.startsWith('%PDF')).toBe(true);
    expect(pdf).toContain('/Count 1');
  });
});

const letterhead = { name: 'Hôpital Général', lines: ['12, avenue de la Santé', 'Tél. +243 1'] };
const rich: DocBlock[] = [
  { kind: 'title', text: 'Synthèse' },
  { kind: 'facts', rows: [{ label: 'Patient', value: 'Amina' }, { label: 'Dossier', value: 'DOS-1' }, { label: 'Sexe', value: 'Féminin' }] },
  { kind: 'stats', items: [{ value: '42', label: 'consultations' }, { value: '9 ans', label: 'de suivi' }] },
  { kind: 'table', head: ['Motif', 'Fois'], rows: [['Suivi', '17'], ['Contrôle', '9']], widths: [3, 1], align: ['left', 'right'] },
  { kind: 'signature', labels: ['Médecin', 'Cachet'] },
];
const richMeta = { title: 'Synthèse du dossier', footer: 'Synthèse DOS-1', letterhead, confidential: 'Confidentiel', pageLabel: 'Page' };

describe('PDF : mise en page professionnelle', () => {
  const pdf = latin(buildDocumentPdf(rich, richMeta));
  it('imprime l\'en-tête de l\'établissement : nom, adresse, contacts', () => {
    expect(pdf).toContain('(Hôpital Général)');
    expect(pdf).toContain('(12, avenue de la Santé)');
    expect(pdf).toContain('(Tél. +243 1)');
  });
  it('met l\'établissement et la référence en pied, avec la confidentialité', () => {
    expect(pdf).toContain('(Hôpital Général  \u00b7  Synthèse DOS-1)');
    expect(pdf).toContain('(Confidentiel)');
    expect(pdf).toContain('(Page 1 / 1)');
  });
  it('dessine fiche d\'identité, chiffres clés, tableau et signatures', () => {
    for (const t of ['(Patient)', '(Amina)', '(Féminin)', '(42)', '(consultations)', '(9 ans)', '(Motif)', '(Contrôle)', '(Médecin)', '(Cachet)']) expect(pdf).toContain(t);
  });
  it('utilise la couleur d\'accent pour l\'en-tête du tableau et le bandeau', () => {
    expect(pdf).toContain('0.06 0.3 0.36 rg');
  });
  it('reprend l\'en-tête du tableau en haut de chaque page', () => {
    const long: DocBlock[] = [{ kind: 'table', head: ['Motif', 'Fois'], rows: Array.from({ length: 90 }, (_, i) => [`Ligne ${i}`, String(i)]) }];
    const text = latin(buildDocumentPdf(long, { title: 'T', footer: 'F' }));
    const pages = Number(text.match(/\/Count (\d+)/)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(text.match(/\(Motif\)/g)).toHaveLength(pages);
  });
  it('affiche l\'en-tête courant dès la deuxième page seulement', () => {
    const long: DocBlock[] = [{ kind: 'bullets', items: Array.from({ length: 120 }, (_, i) => `Ligne ${i} : un texte assez long pour occuper de la place sur la page`) }];
    const text = latin(buildDocumentPdf(long, richMeta));
    const pages = Number(text.match(/\/Count (\d+)/)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(text.match(/\(Synthèse du dossier\)/g)).toHaveLength(pages - 1);
  });
  it('supporte un mot immense dans une case sans casser le fichier', () => {
    const text = latin(buildDocumentPdf([{ kind: 'table', head: ['A', 'B'], rows: [['X'.repeat(400), 'y']] }], { title: '', footer: '' }));
    expect(text.startsWith('%PDF')).toBe(true);
    expect(text.endsWith('%%EOF')).toBe(true);
  });
  it('accepte un tableau sans ligne et des chiffres clés sans élément', () => {
    const text = latin(buildDocumentPdf([{ kind: 'table', head: ['A'], rows: [] }, { kind: 'stats', items: [] }, { kind: 'facts', rows: [] }], { title: '', footer: '' }));
    expect(text.startsWith('%PDF')).toBe(true);
  });
  it('ne mêle pas les traits à remplir avec les filets décoratifs', () => {
    expect(pdf.match(/ l S\n/g)).toBeNull();
    const withLines = latin(buildDocumentPdf([...rich, { kind: 'writeIn', lines: 3 }], richMeta));
    expect(withLines.match(/ l S\n/g)).toHaveLength(3);
  });
});

describe('PDF : logo de l\'établissement', () => {
  const withLogo = { ...richMeta, letterhead: { ...letterhead, logo: { bytes: logoBytes(), width: 60, height: 30, components: 3 as const } } };
  const pdf = latin(buildDocumentPdf(rich, withLogo));
  it('embarque l\'image JPEG telle quelle, en couleur', () => {
    expect(pdf).toContain('/Subtype /Image');
    expect(pdf).toContain('/Filter /DCTDecode');
    expect(pdf).toContain('/ColorSpace /DeviceRGB');
    expect(pdf).toContain('/Width 60');
    expect(pdf).toContain('/Height 30');
    expect(pdf).toContain(latin(logoBytes()));
  });
  it('déclare l\'image dans les ressources et la dessine', () => {
    expect(pdf).toContain('/XObject << /Im1 ');
    expect(pdf).toContain('/Im1 Do');
  });
  it('garde une table de références exacte avec l\'image', () => {
    const xref = Number(pdf.match(/startxref\n(\d+)\n/)?.[1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
  it('n\'ajoute aucune image sans logo', () => {
    const plain = latin(buildDocumentPdf(rich, richMeta));
    expect(plain).not.toContain('/Subtype /Image');
    expect(plain).not.toContain('/Im1');
  });
  it('un logo en niveaux de gris utilise l\'espace gris', () => {
    const gray = latin(buildDocumentPdf(rich, { ...richMeta, letterhead: { ...letterhead, logo: { bytes: logoBytes(), width: 60, height: 30, components: 1 as const } } }));
    expect(gray).toContain('/ColorSpace /DeviceGray');
  });
  it('fonctionne aussi avec un document de plusieurs pages', () => {
    const long: DocBlock[] = [{ kind: 'table', head: ['Motif', 'Fois'], rows: Array.from({ length: 90 }, (_, i) => [`Ligne ${i}`, String(i)]) }];
    const text = latin(buildDocumentPdf(long, withLogo));
    expect(Number(text.match(/\/Count (\d+)/)?.[1])).toBeGreaterThan(1);
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(1);
    const xref = Number(text.match(/startxref\n(\d+)\n/)?.[1]);
    [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1])).forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
});
