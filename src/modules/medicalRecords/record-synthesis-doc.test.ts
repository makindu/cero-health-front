import { describe, expect, it } from 'vitest';
import type { ConsultationLine, RecordContent } from './record-content-api';
import { WHOLE_RECORD, synthesize } from './record-synthesis';
import { ageText, buildSynthesisBlocks, letterheadFrom, spanText, textOf, type SynthesisDocContext, type Translate } from './record-synthesis-doc';

/** Traduction de test : renvoie le texte français par défaut (singulier si count = 1) avec les variables remplacées. */
const t: Translate = (key, o = {}) => {
  const raw = (o.count === 1 && typeof o.defaultValue_one === 'string' ? o.defaultValue_one : o.defaultValue) as string | undefined;
  return (raw ?? key).replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(o[n] ?? ''));
};
const date = (iso: string): string => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const ctx: SynthesisDocContext = { t, date, patientName: 'Amina Kasongo', patientNumber: 'P-0007', recordNumber: 'DOS-000007', generatedOn: '22/11/2026' };
const cons = (id: string, at: string, status = 'signed', diagnoses: ConsultationLine['diagnoses'] = []): ConsultationLine => ({ id, at, reason: 'followUp', status, diagnoses });
const content = (p: Partial<RecordContent>): RecordContent => ({ cap: 200, consultations: [], prescriptions: [], labOrders: [], admissions: [], documents: [], ...p });
const allText = (c: RecordContent, p = WHOLE_RECORD): string => buildSynthesisBlocks(synthesize(c, p), { ...ctx, period: p }).map(textOf).join('\n');

describe('synthèse : document', () => {
  it('commence par le patient, le dossier, la période et l\'avertissement', () => {
    const text = allText(content({ consultations: [cons('1', '2016-03-01T08:00:00Z'), cons('2', '2025-03-01T08:00:00Z')] }));
    expect(text).toContain('Synthèse du dossier médical');
    expect(text).toContain('Patient : Amina Kasongo');
    expect(text).toContain('N° patient : P-0007');
    expect(text).toContain('Dossier : DOS-000007');
    expect(text).toContain('Période couverte : du 01/03/2016 au 01/03/2025 (9 ans)');
    expect(text).toContain('Établie le : 22/11/2026');
    expect(text).toContain('doit la relire, la corriger et la valider');
  });
  it('accorde le singulier et le pluriel', () => {
    const one = allText(content({ consultations: [cons('1', '2024-03-01T08:00:00Z')] }));
    expect(one).toContain('1 consultation\n');
    expect(one).not.toContain('1 consultations');
    expect(allText(content({ consultations: [cons('1', '2024-03-01T08:00:00Z'), cons('2', '2024-04-01T08:00:00Z')] }))).toContain('2 consultations');
  });
  it('résume dix ans en quelques lignes, sans recopier chaque consultation', () => {
    const rows = Array.from({ length: 120 }, (_, i) => cons(String(i), `${2016 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-10T08:00:00Z`, 'signed', [{ label: 'Paludisme', icd10: 'B54', type: 'principal', status: 'confirmed' }]));
    const blocks = buildSynthesisBlocks(synthesize(content({ consultations: rows })), ctx);
    const text = blocks.map(textOf).join('\n');
    expect(text).toContain('120 consultations');
    expect(text).toContain('Paludisme | B54 | 120 | 10/01/2016 | 10/12/2025');
    expect(text.split('\n').length).toBeLessThan(45);
    expect(text).toContain('2016 | 2017');
    expect(text).toContain('12 | 12 | 12');
  });
  it('dit clairement quand il n\'y a rien dans la période', () => {
    const text = allText(content({ consultations: [cons('1', '2016-03-01T08:00:00Z')] }), { from: '2020-01-01', to: '2020-12-31' });
    expect(text).toContain('Aucune consultation, hospitalisation, ordonnance ni analyse dans la période choisie.');
    expect(text).toContain('Période demandée : 01/01/2020 → 31/12/2020');
    expect(text).not.toContain('Vue d’ensemble');
  });
  it('signale les points d\'attention : non signées, sections non lues, sections tronquées', () => {
    const text = allText({ ...content({ consultations: [cons('1', '2024-01-01T08:00:00Z', 'inProgress'), cons('2', '2024-01-02T08:00:00Z', 'inProgress')], prescriptions: null }), cap: 2 });
    expect(text).toContain('2 consultations non signées');
    expect(text).toContain('Non incluses (droits d’accès insuffisants) : ordonnances.');
    expect(text).toContain('Les plus anciens peuvent manquer.');
  });
  it('n\'affiche pas de points d\'attention quand tout est complet', () => {
    expect(allText(content({ consultations: [cons('1', '2024-01-01T08:00:00Z')] }))).not.toContain('Points d’attention');
  });
  it('se termine par un espace de commentaire pour le médecin', () => {
    const blocks = buildSynthesisBlocks(synthesize(content({})), ctx);
    expect(blocks[blocks.length - 3]).toEqual({ kind: 'heading', text: 'Commentaire du médecin' });
    expect(blocks[blocks.length - 2]).toEqual({ kind: 'writeIn', lines: 4 });
    expect(blocks[blocks.length - 1]).toEqual({ kind: 'signature', labels: ['Nom et signature du médecin', 'Cachet de l’établissement'] });
  });
  it('écrit les durées', () => {
    expect(spanText(0, t)).toBe('');
    expect(spanText(8, t)).toBe('8 mois');
    expect(spanText(23, t)).toBe('23 mois');
    expect(spanText(24, t)).toBe('2 ans');
    expect(spanText(117, t)).toBe('9 ans');
  });
});

describe('synthèse : identité et en-tête', () => {
  const idCtx = { ...ctx, sex: 'F', birthDate: '2016-02-14', today: '2026-11-22', author: 'Dr Jean Mutombo' };
  const textWith = (c: SynthesisDocContext): string => buildSynthesisBlocks(synthesize(content({ consultations: [cons('1', '2024-03-01T08:00:00Z')] })), c).map(textOf).join('\n');
  it('affiche sexe, naissance avec l\'âge, et le médecin qui demande la synthèse', () => {
    const text = textWith(idCtx);
    expect(text).toContain('Sexe : Féminin');
    expect(text).toContain('Naissance : 14/02/2016 (10 ans)');
    expect(text).toContain('Établie par : Dr Jean Mutombo');
  });
  it('comprend les codes M / F / homme / femme et garde une valeur inconnue telle quelle', () => {
    expect(textWith({ ...idCtx, sex: 'M' })).toContain('Sexe : Masculin');
    expect(textWith({ ...idCtx, sex: 'female' })).toContain('Sexe : Féminin');
    expect(textWith({ ...idCtx, sex: 'autre' })).toContain('Sexe : autre');
  });
  it('omet ce que le serveur ne connaît pas', () => {
    const text = textWith(ctx);
    expect(text).not.toContain('Sexe');
    expect(text).not.toContain('Naissance');
    expect(text).not.toContain('Établie par');
  });
  it('calcule l\'âge juste avant et après l\'anniversaire', () => {
    expect(ageText('2016-02-14', '2026-11-22', t)).toBe('10 ans');
    expect(ageText('2016-12-01', '2026-11-22', t)).toBe('9 ans');
    expect(ageText('2025-10-30', '2026-11-22', t)).toBe('12 mois');
    expect(ageText('2026-11-10', '2026-11-22', t)).toBe('moins d’un mois');
  });
  it('refuse un âge absurde : date vide, illisible ou dans le futur', () => {
    expect(ageText('', '2026-11-22', t)).toBe('');
    expect(ageText('n/a', '2026-11-22', t)).toBe('');
    expect(ageText('2030-01-01', '2026-11-22', t)).toBe('');
  });
  it('compose l\'en-tête : nom, adresse, contacts, identifiants légaux', () => {
    const lh = letterheadFrom({ name: ' Hôpital Général ', address: '12, avenue de la Santé', phone: '+243 1', mail: 'a@b.cd', website: 'www.b.cd', rccm: 'R1', idnat: 'I2', nif: 'N3', authorization: '' }, 'Établissement', t);
    expect(lh.name).toBe('Hôpital Général');
    expect(lh.lines).toEqual(['12, avenue de la Santé', 'Tél. +243 1  ·  E-mail a@b.cd  ·  www.b.cd', 'RCCM R1  ·  ID NAT I2  ·  NIF N3']);
  });
  it('omet les champs vides et retombe sur le nom de l\'établissement actif', () => {
    expect(letterheadFrom(null, 'Clinique du Lac', t)).toEqual({ name: 'Clinique du Lac', lines: [] });
    const lh = letterheadFrom({ name: '', address: '', phone: '', mail: 'a@b.cd', website: '', rccm: '', idnat: '', nif: '', authorization: 'AUT-9' }, 'Clinique du Lac', t);
    expect(lh.name).toBe('Clinique du Lac');
    expect(lh.lines).toEqual(['E-mail a@b.cd', 'Autorisation AUT-9']);
  });
  it('utilise des tableaux plutôt que des listes pour les groupes', () => {
    const blocks = buildSynthesisBlocks(synthesize(content({ consultations: [cons('1', '2024-03-01T08:00:00Z', 'signed', [{ label: 'Paludisme', icd10: 'B54', type: 'principal', status: 'confirmed' }])] })), ctx);
    expect(blocks.some((b) => b.kind === 'table')).toBe(true);
    expect(blocks.some((b) => b.kind === 'stats')).toBe(true);
    expect(blocks.some((b) => b.kind === 'facts')).toBe(true);
  });
});

describe('synthèse : texte rédigé par le médecin (document)', () => {
  const withText: ConsultationLine = {
    ...cons('1', '2025-03-01T08:00:00Z'),
    clinical: { complaint: 'Fièvre depuis trois jours', history: '', exam: 'Fébrile\nAbdomen souple', evaluation: 'Paludisme probable', plan: '', conclusion: 'Retour à domicile' },
  };
  it('ajoute une rubrique avec la date, le motif et les textes non vides', () => {
    const text = allText(content({ consultations: [withText] }));
    expect(text).toContain('Dernières consultations : texte du médecin');
    expect(text).toContain('01/03/2025 · followUp');
    expect(text).toContain('Motif et plaintes : Fièvre depuis trois jours');
    expect(text).toContain('Examen clinique : Fébrile / Abdomen souple');
    expect(text).toContain('Évaluation : Paludisme probable');
    expect(text).toContain('Conclusion : Retour à domicile');
  });
  it('n\'écrit pas les rubriques vides', () => {
    const text = allText(content({ consultations: [withText] }));
    expect(text).not.toContain('Histoire de la maladie');
    expect(text).not.toContain('Conduite à tenir');
  });
  it('sans texte, la rubrique n\'apparaît pas', () => {
    expect(allText(content({ consultations: [cons('1', '2025-03-01T08:00:00Z')] }))).not.toContain('texte du médecin');
  });
});
