import { describe, expect, it } from 'vitest';
import { contentFrom } from './record-content-api';
import { buildApiRecordReport, buildApiRecordRows, collectApiEntries, type ApiExportContext } from './record-api-export';
import type { ApiRecord } from './records-api';

const x: ApiExportContext = { t: (k, o) => (typeof o?.defaultValue === 'string' ? o.defaultValue : o ? `${k}${JSON.stringify(o)}` : k), date: (i) => i.slice(0, 10), dateTime: (i) => i.replace('T', ' ').slice(0, 16) };
const record = { id: '1', number: 'DOS-1', patientId: '9', patientName: 'Amina K.', patientNumber: 'PAT-9', openedAt: '2026-10-01T08:00:00Z' } as ApiRecord;
const content = contentFrom({
  cap: 200,
  sections: {
    consultations: [{ id: 1, started_at: '2026-11-01T08:00:00Z', reason_code: 'fever', status: 'signed' }],
    diagnoses: [{ consultation_id: 1, label: 'Paludisme', icd10: 'B54' }],
    prescriptions: [{ id: 4, number: 'ORD-4', prescribed_at: '2026-11-03T09:00:00Z', status: 'validated', items: [{ label: 'Artéméther', dosage: '80 mg', frequency: '2x/j', duration: '3 j', quantity: 6 }] }],
    lab_orders: [{ id: 5, number: 'LAB-5', requested_at: '2026-11-02T10:00:00Z', status: 'validated', priority: 'routine', tests: [{ label: 'Goutte épaisse', value: 'positif', unit: null, flag: 'high' }] }],
    admissions: null,
    documents: [],
  },
});

describe('dossier lu sur le serveur : impression et Excel', () => {
  const entries = collectApiEntries(content, x);
  it('regroupe tous les éléments, le plus récent d\'abord', () => {
    expect(entries.map((e) => e.ref)).toEqual(['ORD-4', 'LAB-5', '1']);
    expect(entries[2]?.lines).toEqual(['Paludisme (B54)']);
    expect(entries[0]?.lines[0]).toBe('Artéméther × 6 — 80 mg, 2x/j, 3 j');
    expect(entries[1]?.lines[0]).toBe('Goutte épaisse : positif (high)');
  });
  it('omet une section non accessible sans la présenter comme vide', () => {
    expect(entries.some((e) => e.category === 'admissions')).toBe(false);
    expect(JSON.stringify(buildApiRecordReport(record, entries, x, 'Clinique', 'Dr X', 'maintenant'))).not.toContain('Hospitalisations');
  });
  it('construit le document imprimable avec patient, établissement et sections comptées', () => {
    const r = buildApiRecordReport(record, entries, x, 'Clinique Sainte-Anne', 'Dr X', 'le 22/11');
    expect(r.facility).toBe('Clinique Sainte-Anne');
    expect(r.patientLines.join('|')).toContain('Amina K. (PAT-9)');
    expect(r.patientLines.join('|')).toContain('DOS-1');
    expect(r.sections.map((s) => s.title)).toEqual(['Consultations (1)', 'Ordonnances (1)', 'Analyses (1)']);
    expect(JSON.stringify(r.sections[1]?.doc)).toContain('Artéméther');
    expect(r.practitionerLines.join('|')).toContain('Dr X');
  });
  it('sans nom d\'établissement, garde le titre par défaut', () => {
    expect(buildApiRecordReport(record, entries, x, '', 'Dr X', 'x').facility).toBe('medicalRecords:export.facility');
  });
  it('dossier vide : un message, pas un document sans section', () => {
    const empty = collectApiEntries(contentFrom({ cap: 0, sections: { consultations: [], prescriptions: [], lab_orders: [], admissions: [], documents: [] } }), x);
    expect(empty).toEqual([]);
    expect(buildApiRecordReport(record, empty, x, '', 'Dr X', 'x').sections).toEqual([{ title: 'medicalRecords:export.empty', text: '' }]);
    expect(buildApiRecordRows(empty, x)).toHaveLength(1);
  });
  it('Excel : en-tête de six colonnes puis une ligne par élément, groupées par catégorie', () => {
    const rows = buildApiRecordRows(entries, x);
    expect(rows[0]).toHaveLength(6);
    expect(rows.slice(1).map((r) => r[1])).toEqual(['1', 'ORD-4', 'LAB-5']);
    for (const r of rows) expect(r).toHaveLength(6);
    expect(rows[2]?.[5]).toBe('Artéméther × 6 — 80 mg, 2x/j, 3 j');
  });
});
