import { describe, expect, it } from 'vitest';
import { docOf, para } from '../consultations/richtext/doc';
import type { MedicalRecord } from './data';
import type { RecordContent } from './record-content';
import { buildRecordReport, buildRecordRows, collectEntries, type ExportContext } from './record-export';

const t = (key: string, o?: Record<string, unknown>): string => (o ? `${key}${JSON.stringify(o)}` : key);
const x: ExportContext = { t, date: (d) => d.slice(0, 10), dateTime: (d) => d.slice(0, 16), drafts: {} };
const record = { id: 'DOS-P1', patientId: 'P1', patientName: 'Jean Test', service: 'general', openedAt: '2026-01-01', lastUpdate: '2026-01-01', status: 'active', completeness: 'incomplete', counts: { consultations: 0, prescriptions: 0, labOrders: 0, documents: 0 } } as unknown as MedicalRecord;
const content = {
  consultations: [{ id: 'c1', patientId: 'P1', patientName: 'Jean Test', practitioner: 'Dr A', service: 'general', date: '2026-11-17T09:00:00.000Z', reason: 'firstVisit', status: 'closed' }],
  prescriptions: [{ id: 'r1', number: 'RX-1', patientId: 'P1', patientName: 'Jean Test', prescriber: 'Dr A', prescribedAt: '2026-11-17T10:00:00.000Z', status: 'validated', items: [{ label: 'Antalgique', dosage: '1 cp', frequency: '3/j', duration: '5 j', quantity: 15, instructions: 'après repas' }], note: 'Surveiller' }],
  labOrders: [],
  admissions: [{
    admission: { id: 'a1', number: 'ADM-1', patientId: 'P1', patientName: 'Jean Test', ward: 'general', status: 'admitted', admittedAt: '2026-11-17T11:00:00.000Z', attending: 'Dr A', reason: 'Fièvre', stays: [] },
    visits: [{ id: 'v1', admissionId: 'a1', type: 'round', visitedAt: '2026-11-17T12:00:00.000Z', by: 'Dr A', clinical: { complaints: { none: false, text: docOf(para('Toux')) }, diagnosis: 'Bronchite' } }],
  }],
} as unknown as RecordContent;

describe('export du dossier', () => {
  it('un modèle unique : éléments triés du plus récent au plus ancien, textes rédigés conservés', () => {
    const e = collectEntries(content, x);
    expect(e.map((i) => i.ref)).toEqual(['ADM-1', 'RX-1', 'c1']);
    const adm = e[0]!;
    expect(adm.docs.map((d) => d.title)).toHaveLength(2);
    expect(e[1]!.lines[0]).toContain('Antalgique × 15');
  });
  it('une section inaccessible (null) est omise, pas inventée', () => {
    const e = collectEntries({ ...content, prescriptions: null, admissions: null } as RecordContent, x);
    expect(e.map((i) => i.category)).toEqual(['consultations']);
  });
  it('le document imprimable contient l’identité du patient et une section par catégorie non vide', () => {
    const r = buildRecordReport(record, collectEntries(content, x), x, 'Agent', '17/11 23:00');
    expect(r.patientLines.join(' ')).toContain('Jean Test');
    expect(r.sections).toHaveLength(3);
  });
  it('le classeur a un en-tête et une ligne par élément, textes aplatis', () => {
    const rows = buildRecordRows(collectEntries(content, x), x);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveLength(6);
    expect(rows.flat().join('|')).toContain('Toux');
  });
});
