import { describe, expect, it } from 'vitest';
import { NO_RECORD_FILTER, RECORDS_PAGE, reasonBody, recordFrom, recordParams } from './records-api';
import { actionsFor } from './record-rules';

describe('dossiers médicaux : lecture', () => {
  it('lit un dossier avec ses compteurs et son historique', () => {
    const r = recordFrom({
      id: 3, record_number: 'DOS-000003', patient_id: 7, patient: { full_name: 'Amina Kasongo', patient_number: 'P-0007' }, status: 'locked',
      opened_at: '2026-11-01T08:00:00Z', status_changed_at: '2026-11-20T09:00:00Z', status_reason: 'Enquête', last_access_at: null, last_export_at: null,
      counts: { consultations: 4, prescriptions: 0, lab_orders: null, documents: 2, admissions: 1 },
      events: [{ action: 'lock', from_status: 'active', to_status: 'locked', reason: 'Enquête', actor_user_id: 5, occurred_at: '2026-11-20T09:00:00Z' }],
    });
    expect(r).toMatchObject({ id: '3', number: 'DOS-000003', patientId: '7', patientName: 'Amina Kasongo', patientNumber: 'P-0007', status: 'locked', statusReason: 'Enquête', lastAccessAt: '' });
    expect(r.counts).toEqual({ consultations: 4, prescriptions: 0, labOrders: null, documents: 2, admissions: 1 });
    expect(r.events).toEqual([{ action: 'lock', from: 'active', to: 'locked', reason: 'Enquête', actorId: '5', at: '2026-11-20T09:00:00Z' }]);
  });
  it('distingue « zéro élément » de « section non accessible »', () => {
    expect(recordFrom({ counts: { consultations: 0 } }).counts.consultations).toBe(0);
    expect(recordFrom({ counts: { consultations: null } }).counts.consultations).toBeNull();
    expect(recordFrom({ counts: null }).counts.documents).toBeNull();
    expect(recordFrom({}).counts.admissions).toBeNull();
  });
  it('traite un statut inconnu comme actif et accepte les champs absents', () => {
    expect(recordFrom({ status: 'zzz' }).status).toBe('active');
    const r = recordFrom({ id: 1 });
    expect(r.patientName).toBe('');
    expect(r.events).toEqual([]);
  });
});

describe('dossiers médicaux : saisie', () => {
  it('n\'envoie que la page sans filtre', () => {
    expect(recordParams(NO_RECORD_FILTER, 1)).toEqual({ per_page: RECORDS_PAGE, page: 1 });
  });
  it('envoie le statut et la recherche d\'au moins 2 lettres', () => {
    expect(recordParams({ status: 'archived', q: '  Amina ' }, 2)).toEqual({ per_page: RECORDS_PAGE, page: 2, status: 'archived', q: 'Amina' });
    expect(recordParams({ status: '', q: 'A' }, 1).q).toBeUndefined();
    expect(recordParams({ status: '', q: '   ' }, 1).q).toBeUndefined();
  });
  it('prépare le motif facultatif', () => {
    expect(reasonBody('   ')).toEqual({});
    expect(reasonBody(' Enquête interne ')).toEqual({ reason: 'Enquête interne' });
    expect(reasonBody('x'.repeat(300)).reason).toHaveLength(255);
  });
  it('propose les bonnes actions selon l\'état du dossier', () => {
    expect(actionsFor('active')).toEqual(['archive', 'lock']);
    expect(actionsFor('locked')).toEqual(['archive', 'reopen']);
    expect(actionsFor('archived')).toEqual(['reopen']);
  });
});
