import { describe, expect, it } from 'vitest';
import type { ConsultationLine, LabOrderLine, PrescriptionLine, RecordContent } from './record-content-api';
import { WHOLE_RECORD, inPeriod, monthsBetween, periodInvalid, synthesize } from './record-synthesis';

const diag = (label: string, status = 'confirmed', icd10 = '') => ({ label, icd10, type: 'principal', status });
const cons = (id: string, at: string, reason = 'followUp', status = 'signed', diagnoses: ConsultationLine['diagnoses'] = []): ConsultationLine => ({ id, at, reason, status, diagnoses });
const rx = (id: string, at: string, items: [string, string?][], status = 'validated'): PrescriptionLine => ({
  id, number: `ORD-${id}`, at, status, items: items.map(([label, dosage]) => ({ label, dosage: dosage ?? '', frequency: '', duration: '', quantity: 1 })),
});
const lab = (id: string, at: string, tests: [string, string, string?, string?][], status = 'validated'): LabOrderLine => ({
  id, number: `LAB-${id}`, at, status, priority: 'routine', tests: tests.map(([label, value, unit, flag]) => ({ label, value, unit: unit ?? '', flag: flag ?? 'unspecified' })),
});
const content = (p: Partial<RecordContent>): RecordContent => ({ cap: 200, consultations: [], prescriptions: [], labOrders: [], admissions: [], documents: [], ...p });

describe('synthèse : regrouper au lieu de répéter', () => {
  it('résume le même diagnostic en une seule ligne avec son nombre et ses dates', () => {
    const s = synthesize(content({ consultations: [
      cons('1', '2016-03-01T08:00:00Z', 'followUp', 'signed', [diag('Paludisme', 'confirmed', 'B54')]),
      cons('2', '2020-07-10T08:00:00Z', 'followUp', 'signed', [diag('paludisme')]),
      cons('3', '2024-01-05T08:00:00Z', 'control', 'signed', [diag('Paludisme ')]),
    ] }));
    expect(s.diagnoses).toHaveLength(1);
    expect(s.diagnoses[0]).toMatchObject({ count: 3, first: '2016-03-01T08:00:00Z', last: '2024-01-05T08:00:00Z', icd10: 'B54' });
  });
  it('compte un diagnostic une seule fois par consultation', () => {
    const s = synthesize(content({ consultations: [cons('1', '2024-01-01T08:00:00Z', 'followUp', 'signed', [diag('Anémie'), diag('anemie')])] }));
    expect(s.diagnoses[0]?.count).toBe(1);
  });
  it('ne compte jamais un diagnostic écarté comme une maladie, sauf s\'il est retenu ailleurs', () => {
    const s = synthesize(content({ consultations: [
      cons('1', '2024-01-01T08:00:00Z', 'followUp', 'signed', [diag('Typhoïde', 'ruledOut'), diag('Grippe', 'ruledOut')]),
      cons('2', '2024-02-01T08:00:00Z', 'followUp', 'signed', [diag('Grippe', 'confirmed')]),
    ] }));
    expect(s.diagnoses.map((d) => d.label)).toEqual(['Grippe']);
    expect(s.ruledOut).toEqual(['Typhoïde']);
  });
  it('regroupe les motifs et trie les plus fréquents d\'abord', () => {
    const s = synthesize(content({ consultations: [cons('1', '2024-01-01T08:00:00Z', 'control'), cons('2', '2024-02-01T08:00:00Z', 'followUp'), cons('3', '2024-03-01T08:00:00Z', 'followUp')] }));
    expect(s.reasons.map((r) => [r.label, r.count])).toEqual([['followUp', 2], ['control', 1]]);
  });
  it('la taille de la synthèse ne dépend pas du nombre de consultations', () => {
    const many = (n: number): RecordContent => content({ consultations: Array.from({ length: n }, (_, i) => cons(String(i), `2024-01-${String((i % 28) + 1).padStart(2, '0')}T08:00:00Z`, 'followUp', 'signed', [diag('Paludisme')])) });
    const small = synthesize(many(5));
    const big = synthesize(many(150));
    expect(big.diagnoses).toHaveLength(small.diagnoses.length);
    expect(big.reasons).toHaveLength(small.reasons.length);
    expect(big.diagnoses[0]?.count).toBe(150);
  });
});

describe('synthèse : traitements et analyses', () => {
  it('une ligne par médicament, avec la dernière posologie, sans les ordonnances annulées', () => {
    const s = synthesize(content({ prescriptions: [
      rx('1', '2020-01-01T08:00:00Z', [['Amoxicilline', '500 mg']]),
      rx('2', '2024-01-01T08:00:00Z', [['amoxicilline', '1 g'], ['Paracétamol']]),
      rx('3', '2025-01-01T08:00:00Z', [['Amoxicilline', '2 g']], 'cancelled'),
    ] }));
    expect(s.prescriptions).toBe(2);
    expect(s.treatments[0]).toMatchObject({ count: 2, last: '2024-01-01T08:00:00Z', posology: '1 g' });
    expect(s.treatments).toHaveLength(2);
  });
  it('garde le dernier résultat de chaque analyse et compte les résultats anormaux', () => {
    const s = synthesize(content({ labOrders: [
      lab('1', '2022-01-01T08:00:00Z', [['Hémoglobine', '8', 'g/dL', 'abnormal']]),
      lab('2', '2024-01-01T08:00:00Z', [['Hémoglobine', '12', 'g/dL', 'normal'], ['Glycémie', '']]),
      lab('3', '2025-01-01T08:00:00Z', [['Hémoglobine', '3']], 'cancelled'),
    ] }));
    expect(s.labOrders).toBe(2);
    expect(s.labs).toHaveLength(1);
    expect(s.labs[0]).toMatchObject({ label: 'Hémoglobine', count: 2, abnormal: 1, lastValue: '12', lastUnit: 'g/dL', lastFlag: 'normal' });
  });
  it('place les analyses à résultats anormaux en premier', () => {
    const s = synthesize(content({ labOrders: [lab('1', '2024-01-01T08:00:00Z', [['A', '1', '', 'normal'], ['B', '2', '', 'abnormal']])] }));
    expect(s.labs.map((l) => l.label)).toEqual(['B', 'A']);
  });
});

describe('synthèse : hospitalisations, période et droits', () => {
  it('liste les hospitalisations sans les annulées, avec des diagnostics distincts', () => {
    const s = synthesize(content({ admissions: [
      { id: '1', number: 'ADM-1', at: '2019-06-02T08:00:00Z', status: 'discharged', reason: 'Paludisme grave', outcome: 'recovered', visits: [
        { id: 'v1', at: '2019-06-03T08:00:00Z', type: 'round', diagnosis: 'Anémie sévère' }, { id: 'v2', at: '2019-06-04T08:00:00Z', type: 'round', diagnosis: 'anemie severe' }, { id: 'v3', at: '2019-06-05T08:00:00Z', type: 'round', diagnosis: '' }] },
      { id: '2', number: 'ADM-2', at: '2023-02-11T08:00:00Z', status: 'cancelled', reason: '', outcome: '', visits: null },
      { id: '3', number: 'ADM-3', at: '2024-02-11T08:00:00Z', status: 'discharged', reason: 'Déshydratation', outcome: '', visits: null },
    ] }));
    expect(s.hospitalizations).toBe(2);
    expect(s.stays.map((x) => x.number)).toEqual(['ADM-3', 'ADM-1']);
    expect(s.stays[1]?.diagnoses).toEqual(['Anémie sévère']);
  });
  it('ne garde que la période demandée', () => {
    const c = content({ consultations: [cons('1', '2016-03-01T08:00:00Z'), cons('2', '2022-03-01T08:00:00Z'), cons('3', '2025-03-01T08:00:00Z')] });
    expect(synthesize(c, { from: '2020-01-01', to: '' }).consultations).toBe(2);
    expect(synthesize(c, { from: '', to: '2022-12-31' }).consultations).toBe(2);
    expect(synthesize(c, { from: '2022-01-01', to: '2022-12-31' }).consultations).toBe(1);
    expect(synthesize(c, WHOLE_RECORD).consultations).toBe(3);
  });
  it('gère les bornes et les dates absentes de la période', () => {
    expect(inPeriod('2024-05-01T10:00:00Z', { from: '2024-05-01', to: '2024-05-01' })).toBe(true);
    expect(inPeriod('', WHOLE_RECORD)).toBe(true);
    expect(inPeriod('', { from: '2024-01-01', to: '' })).toBe(false);
    expect(periodInvalid({ from: '2024-02-01', to: '2024-01-01' })).toBe(true);
    expect(periodInvalid({ from: '2024-01-01', to: '2024-01-01' })).toBe(false);
    expect(periodInvalid(WHOLE_RECORD)).toBe(false);
  });
  it('distingue une section sans droit d\'une section vide', () => {
    const s = synthesize(content({ prescriptions: null, labOrders: null, admissions: null, documents: null }));
    expect(s.hidden).toEqual(['prescriptions', 'labOrders', 'admissions', 'documents']);
    expect(synthesize(content({})).hidden).toEqual([]);
  });
  it('signale une section arrêtée au plafond du serveur', () => {
    const rows = Array.from({ length: 3 }, (_, i) => cons(String(i), `2024-01-0${i + 1}T08:00:00Z`));
    expect(synthesize({ ...content({ consultations: rows }), cap: 3 }).capped).toEqual(['consultations']);
    expect(synthesize({ ...content({ consultations: rows }), cap: 200 }).capped).toEqual([]);
  });
  it('compte les consultations non signées ni clôturées', () => {
    const s = synthesize(content({ consultations: [cons('1', '2024-01-01T08:00:00Z', 'followUp', 'signed'), cons('2', '2024-01-02T08:00:00Z', 'followUp', 'closed'), cons('3', '2024-01-03T08:00:00Z', 'followUp', 'inProgress'), cons('4', '2024-01-04T08:00:00Z', 'followUp', 'draft')] }));
    expect(s.unfinished).toBe(2);
  });
  it('compte les années et les mois couverts', () => {
    const s = synthesize(content({ consultations: [cons('1', '2016-03-01T08:00:00Z'), cons('2', '2016-09-01T08:00:00Z'), cons('3', '2025-03-01T08:00:00Z')] }));
    expect(s.byYear).toEqual([{ year: '2016', count: 2 }, { year: '2025', count: 1 }]);
    expect(s.first).toBe('2016-03-01');
    expect(s.last).toBe('2025-03-01');
    expect(s.spanMonths).toBe(108);
    expect(monthsBetween('2024-01-10', '2024-01-30')).toBe(0);
    expect(monthsBetween('', '2024-01-30')).toBe(0);
  });
  it('un dossier sans rien dans la période est vide', () => {
    expect(synthesize(content({})).empty).toBe(true);
    expect(synthesize(content({ consultations: [cons('1', '2016-03-01T08:00:00Z')] }), { from: '2020-01-01', to: '' }).empty).toBe(true);
  });
});

describe('synthèse : texte rédigé par le médecin', () => {
  const clin = (complaint: string) => ({ complaint, history: '', exam: '', evaluation: '', plan: '', conclusion: '' });
  const withText = (id: string, at: string, complaint: string): ConsultationLine => ({ ...cons(id, at), clinical: clin(complaint) });
  it('retient les consultations qui ont du texte, la plus récente d\'abord', () => {
    const s = synthesize(content({ consultations: [withText('1', '2024-01-01T08:00:00Z', 'a'), cons('2', '2025-01-01T08:00:00Z'), withText('3', '2025-06-01T08:00:00Z', 'c')] }));
    expect(s.notes.map((n) => n.clinical.complaint)).toEqual(['c', 'a']);
  });
  it('n\'en garde que cinq', () => {
    const rows = Array.from({ length: 9 }, (_, i) => withText(String(i), `2025-0${i + 1}-01T08:00:00Z`, `n${i}`));
    const s = synthesize(content({ consultations: rows }));
    expect(s.notes).toHaveLength(5);
    expect(s.notes[0]?.clinical.complaint).toBe('n8');
  });
  it('respecte la période choisie', () => {
    const c = content({ consultations: [withText('1', '2020-01-01T08:00:00Z', 'ancien'), withText('2', '2025-01-01T08:00:00Z', 'récent')] });
    expect(synthesize(c, { from: '2024-01-01', to: '' }).notes.map((n) => n.clinical.complaint)).toEqual(['récent']);
  });
  it('rien à reprendre quand le serveur n\'a envoyé aucun texte', () => {
    expect(synthesize(content({ consultations: [cons('1', '2025-01-01T08:00:00Z'), { ...cons('2', '2025-02-01T08:00:00Z'), clinical: null }] })).notes).toEqual([]);
  });
});
