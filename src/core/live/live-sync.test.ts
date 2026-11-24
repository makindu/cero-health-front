import { describe, expect, it } from 'vitest';
import { queriesToRefresh, RECENT_CREATION_MS, splitArrivals, type LiveEvent } from './live-sync';

describe('queriesToRefresh', () => {
  it('relit file d\'attente, accueil et tableau de bord quand un rendez-vous change', () => {
    const names = queriesToRefresh([{ entity: 'appointments' }]);
    expect(names).toEqual(expect.arrayContaining(['appointments', 'triage', 'dashboard']));
  });
  it('fusionne les signaux sans doublon et ignore les types inconnus', () => {
    const names = queriesToRefresh([{ entity: 'appointments' }, { entity: 'triage_entries' }, { entity: 'audit_events' }]);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain('audit_events');
  });
  it('ne relit jamais le dossier clinique en cours de saisie', () => {
    const names = queriesToRefresh([{ entity: 'consultations' }, { entity: 'diagnoses' }, { entity: 'consultation_addenda' }]);
    expect(names).not.toContain('consultation-records');
  });
  it('relit la facturation quand une facture ou un paiement change', () => {
    expect(queriesToRefresh([{ entity: 'billing_links' }])).toContain('billing');
    expect(queriesToRefresh([{ entity: 'billing_payments' }])).toEqual(expect.arrayContaining(['billing', 'pharmacy']));
  });
  it('relit l\'assurance quand un organisme, une créance ou un règlement change, et la facturation quand une créance bouge', () => {
    expect(queriesToRefresh([{ entity: 'insurance_organizations' }])).toEqual(['insurance']);
    expect(queriesToRefresh([{ entity: 'insurance_settlements' }])).toEqual(['insurance']);
    expect(queriesToRefresh([{ entity: 'insurance_dues' }])).toEqual(expect.arrayContaining(['insurance', 'billing']));
    for (const e of ['insurance_contracts', 'insurance_rules', 'insurance_subscriptions', 'insurance_coverages', 'insurance_authorizations']) expect(queriesToRefresh([{ entity: e }])).toEqual(['insurance']);
    expect(queriesToRefresh([{ entity: 'insurance_due_entries' }])).toEqual(expect.arrayContaining(['insurance', 'billing']));
  });
  it('relit la file « à valider » quand un médicament ou un examen est ajouté ou validé', () => {
    expect(queriesToRefresh([{ entity: 'drug_names' }])).toEqual(expect.arrayContaining(['prescriptions', 'review']));
    expect(queriesToRefresh([{ entity: 'lab_tests' }])).toEqual(expect.arrayContaining(['laboratory', 'review']));
  });
  it('relit la cloche quand une notification arrive ou est lue', () => {
    expect(queriesToRefresh([{ entity: 'notifications' }])).toEqual(['notifications']);
  });
  it('relit la boîte d\'envoi du courrier patient', () => {
    expect(queriesToRefresh([{ entity: 'patient_mails' }])).toEqual(['patient-mail']);
  });
  it('relit les dépenses, la caisse du jour et les rapports quand une dépense change', () => {
    expect(queriesToRefresh([{ entity: 'expenses' }])).toEqual(['expenses', 'reports']);
  });
  it('relit les services et la liste des types de service quand ils changent', () => {
    expect(queriesToRefresh([{ entity: 'care_units' }])).toEqual(['services', 'reference']);
    expect(queriesToRefresh([{ entity: 'care_unit_types' }])).toEqual(['care-unit-types']);
  });
  it('relit la pharmacie et les catalogues des prestations et des examens quand un article ou un prix change', () => {
    expect(queriesToRefresh([{ entity: 'catalog_items' }])).toEqual(['pharmacy', 'service-catalog', 'lab-catalog', 'review']);
    expect(queriesToRefresh([{ entity: 'catalog_items', op: 'updated' }])).toEqual(['pharmacy', 'service-catalog', 'lab-catalog', 'review']);
  });
  it('ne relit pas les catalogues quand un article ou un examen est seulement créé (bandeau « nouvel ajout »)', () => {
    expect(queriesToRefresh([{ entity: 'catalog_items', op: 'created' }])).toEqual([]);
    expect(queriesToRefresh([{ entity: 'lab_tests', op: 'created' }])).toEqual(['laboratory', 'review']);
  });
  it('relit les dossiers médicaux quand un dossier ou son historique change', () => {
    expect(queriesToRefresh([{ entity: 'medical_records' }])).toEqual(['medical-records']);
    expect(queriesToRefresh([{ entity: 'medical_record_events' }])).toEqual(['medical-records']);
  });
});

describe('splitArrivals', () => {
  const ev = (entity: string, id: number, op: 'created' | 'updated' | 'deleted'): LiveEvent => ({ id, entity, entity_id: id, op, patient_id: null, ref_type: null, ref_id: null, actor: null, at: '' });

  it('annonce les créations de catalogue, groupées par entité', () => {
    const { arrivals } = splitArrivals([ev('catalog_items', 7, 'created'), ev('catalog_items', 8, 'created'), ev('lab_tests', 3, 'created')], new Map(), 1000);
    expect(arrivals).toEqual([{ entity: 'catalog_items', ids: [7, 8] }, { entity: 'lab_tests', ids: [3] }]);
  });
  it('ignore la modification qui suit de peu la création du même élément', () => {
    const recent = new Map<string, number>();
    splitArrivals([ev('catalog_items', 7, 'created')], recent, 1000);
    const next = splitArrivals([ev('catalog_items', 7, 'updated'), ev('catalog_items', 9, 'updated')], recent, 5000);
    expect(next.refresh.map((e) => e.entity_id)).toEqual([9]);
    expect(next.arrivals).toEqual([]);
  });
  it('relit de nouveau une modification tardive', () => {
    const recent = new Map<string, number>();
    splitArrivals([ev('catalog_items', 7, 'created')], recent, 1000);
    const late = splitArrivals([ev('catalog_items', 7, 'updated')], recent, 1000 + RECENT_CREATION_MS + 1);
    expect(late.refresh).toHaveLength(1);
  });
  it('laisse passer les autres entités sans rien annoncer', () => {
    const { refresh, arrivals } = splitArrivals([ev('patients', 1, 'created')], new Map(), 0);
    expect(refresh).toHaveLength(1);
    expect(arrivals).toEqual([]);
  });
});
