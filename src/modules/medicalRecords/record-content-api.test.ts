import { describe, expect, it } from 'vitest';
import { atCap, contentFrom, sizeLabel } from './record-content-api';

const full = {
  cap: 200,
  sections: {
    consultations: [{ id: 1, started_at: '2026-11-01T08:00:00Z', reason_code: 'fever', status: 'signed' }, { id: 2, started_at: '2026-11-10T08:00:00Z', reason_code: 'cough', status: 'open' }],
    diagnoses: [{ consultation_id: 1, label: 'Paludisme', icd10: 'B54', type: 'final', status: 'confirmed' }, { consultation_id: 9, label: 'Autre', icd10: null }],
    prescriptions: [{ id: 4, number: 'ORD-4', prescribed_at: '2026-11-01T09:00:00Z', status: 'validated', items: [{ label: 'Artéméther', dosage: '80 mg', frequency: '2x/j', duration: '3 j', quantity: 6 }] }],
    lab_orders: [{ id: 5, number: 'LAB-5', requested_at: '2026-11-01T10:00:00Z', status: 'validated', priority: 'routine', tests: [{ label: 'Goutte épaisse', value: 'positif', unit: null, flag: 'high' }] }],
    admissions: [{ id: 7, number: 'ADM-7', admitted_at: '2026-11-02T08:00:00Z', status: 'discharged', reason: 'Paludisme grave', discharge: { outcome: 'recovered' } }],
    visits: [{ id: 11, admission_id: 7, visited_at: '2026-11-03T08:00:00Z', visit_type: 'round', clinical: { diagnosis: 'Anémie' } }, { id: 12, admission_id: 99, visited_at: '2026-11-03T09:00:00Z', visit_type: 'round', clinical: null }],
    documents: [{ id: 3, document_type: 'report', mime_type: 'application/pdf', size_bytes: 2048, uploaded_at: '2026-11-04T08:00:00Z' }],
  },
};

describe('contenu du dossier : lecture', () => {
  it('rattache chaque diagnostic à sa consultation', () => {
    const c = contentFrom(full);
    expect(c.consultations?.[0]).toMatchObject({ id: '1', reason: 'fever', status: 'signed' });
    expect(c.consultations?.[0].diagnoses).toEqual([{ label: 'Paludisme', icd10: 'B54', type: 'final', status: 'confirmed' }]);
    expect(c.consultations?.[1].diagnoses).toEqual([]);
  });
  it('lit ordonnances, analyses, hospitalisations et documents', () => {
    const c = contentFrom(full);
    expect(c.prescriptions?.[0].items[0]).toEqual({ label: 'Artéméther', dosage: '80 mg', frequency: '2x/j', duration: '3 j', quantity: 6 });
    expect(c.labOrders?.[0].tests[0]).toEqual({ label: 'Goutte épaisse', value: 'positif', unit: '', flag: 'high' });
    expect(c.admissions?.[0]).toMatchObject({ number: 'ADM-7', outcome: 'recovered' });
    expect(c.documents?.[0]).toEqual({ id: '3', type: 'report', mime: 'application/pdf', sizeBytes: 2048, at: '2026-11-04T08:00:00Z' });
  });
  it('ne garde que les visites du séjour et le diagnostic quand il est un texte', () => {
    const v = contentFrom(full).admissions?.[0].visits;
    expect(v).toEqual([{ id: '11', at: '2026-11-03T08:00:00Z', type: 'round', diagnosis: 'Anémie' }]);
  });
  it('une section sans droit reste « non accessible » (null), jamais vide', () => {
    const c = contentFrom({ cap: 200, sections: { consultations: [] } });
    expect(c.consultations).toEqual([]);
    expect(c.prescriptions).toBeNull();
    expect(c.labOrders).toBeNull();
    expect(c.admissions).toBeNull();
    expect(c.documents).toBeNull();
  });
  it('des visites sans droit rendent les visites non accessibles, pas absentes', () => {
    const c = contentFrom({ cap: 200, sections: { admissions: [{ id: 7 }], visits: null } });
    expect(c.admissions?.[0].visits).toBeNull();
  });
  it('accepte une réponse vide', () => {
    expect(contentFrom({}).consultations).toBeNull();
    expect(contentFrom({}).cap).toBe(0);
  });
});

describe('contenu du dossier : affichage', () => {
  it('rend la taille d\'un document', () => {
    expect(sizeLabel(null)).toBe('—');
    expect(sizeLabel(512)).toBe('512 o');
    expect(sizeLabel(2048)).toBe('2 Ko');
    expect(sizeLabel(3 * 1024 * 1024)).toBe('3.0 Mo');
  });
  it('signale une section au plafond', () => {
    expect(atCap(200, 200)).toBe(true);
    expect(atCap(199, 200)).toBe(false);
    expect(atCap(5, 0)).toBe(false);
    expect(atCap(null, 200)).toBe(false);
  });
});

describe('contenu du dossier : établissement et identité', () => {
  it('lit les coordonnées de l\'établissement et l\'identité envoyées avec une synthèse', () => {
    const c = contentFrom({ cap: 200, sections: {}, enterprise: { name: ' Hôpital ', address: '12 av.', phone: '+243', mail: 'a@b.cd', website: '', rccm: 'R1', idnat: 'I2', nif: 'N3', authorization: null }, identity: { sex: 'F', birth_date: '2016-02-14' } });
    expect(c.enterprise).toEqual({ name: 'Hôpital', address: '12 av.', phone: '+243', mail: 'a@b.cd', website: '', rccm: 'R1', idnat: 'I2', nif: 'N3', authorization: '' });
    expect(c.identity).toEqual({ sex: 'F', birthDate: '2016-02-14' });
  });
  it('laisse vides ces informations pour une simple lecture', () => {
    const c = contentFrom({ cap: 200, sections: {} });
    expect(c.enterprise).toBeNull();
    expect(c.identity).toBeNull();
  });
});

describe('contenu du dossier : texte rédigé', () => {
  it('lit le texte clinique d\'une consultation validée', () => {
    const c = contentFrom({ cap: 10, sections: { consultations: [{ id: 1, started_at: '2026-01-01T08:00:00Z', reason_code: 'fever', status: 'signed', clinical: { complaint: ' Fièvre ', history: '', exam: 'Fébrile', evaluation: '', plan: '', conclusion: '' } }], diagnoses: [] } });
    expect(c.consultations?.[0]?.clinical).toEqual({ complaint: 'Fièvre', history: '', exam: 'Fébrile', evaluation: '', plan: '', conclusion: '' });
  });
  it('null pour un brouillon, une lecture simple ou un texte entièrement vide', () => {
    const c = contentFrom({ cap: 10, sections: { consultations: [
      { id: 1, started_at: 'x', reason_code: 'a', status: 'draft', clinical: null },
      { id: 2, started_at: 'x', reason_code: 'a', status: 'signed' },
      { id: 3, started_at: 'x', reason_code: 'a', status: 'signed', clinical: { complaint: '', history: ' ' } },
      { id: 4, started_at: 'x', reason_code: 'a', status: 'signed', clinical: 'oops' },
    ], diagnoses: [] } });
    expect(c.consultations?.map((x) => x.clinical)).toEqual([null, null, null, null]);
  });
});
