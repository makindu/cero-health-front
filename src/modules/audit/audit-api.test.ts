import { describe, expect, it } from 'vitest';
import { AUDIT_PAGE, NO_AUDIT_FILTER, actionLabel, actorLabel, auditFrom, auditParams, periodInvalid } from './audit-api';

describe('journal d\'audit : lecture', () => {
  it('lit un événement', () => {
    expect(auditFrom({ id: 9, occurred_at: '2026-11-22T10:00:00Z', actor_user_id: 4, action: 'drug_name.reviewed', entity_type: 'drug_name', entity_id: 12, outcome: 'success', reason: null, request_id: 'r-1' }))
      .toEqual({ id: '9', at: '2026-11-22T10:00:00Z', actorId: '4', actorName: '', action: 'drug_name.reviewed', entityType: 'drug_name', entityId: '12', outcome: 'success', reason: '', requestId: 'r-1' });
  });
  it('accepte un événement sans acteur ni objet', () => {
    const e = auditFrom({ id: 1, action: 'login', outcome: 'denied' });
    expect(e.actorId).toBe('');
    expect(e.entityId).toBe('');
    expect(e.outcome).toBe('denied');
  });
  it('reconnaît « failed » et traite un résultat inconnu comme réussi', () => {
    expect(auditFrom({ outcome: 'failed' }).outcome).toBe('failed');
    expect(auditFrom({ outcome: 'bizarre' }).outcome).toBe('success');
    expect(auditFrom({}).outcome).toBe('success');
  });
});

describe('journal d\'audit : auteur', () => {
  const fb = (id: string) => `Utilisateur n° ${id}`;
  it('lit le nom envoyé par le serveur et le préfère au numéro', () => {
    const e = auditFrom({ actor_user_id: 4, actor_name: '  Dr Kabila ' });
    expect(e.actorName).toBe('Dr Kabila');
    expect(actorLabel(e, fb)).toBe('Dr Kabila');
  });
  it('retombe sur le numéro, puis sur un tiret', () => {
    expect(actorLabel(auditFrom({ actor_user_id: 4, actor_name: null }), fb)).toBe('Utilisateur n° 4');
    expect(actorLabel(auditFrom({}), fb)).toBe('—');
  });
});

describe('journal d\'audit : filtres', () => {
  it('n\'envoie que la page quand aucun filtre n\'est rempli', () => {
    expect(auditParams(NO_AUDIT_FILTER, 1)).toEqual({ per_page: AUDIT_PAGE, page: 1 });
  });
  it('envoie les filtres renseignés, la période couvre les journées entières', () => {
    expect(auditParams({ outcome: 'denied', action: ' login ', from: '2026-11-01', to: '2026-11-22' }, 3))
      .toEqual({ per_page: AUDIT_PAGE, page: 3, outcome: 'denied', action: 'login', from: '2026-11-01T00:00:00', to: '2026-11-22T23:59:59' });
  });
  it('signale une période à l\'envers', () => {
    expect(periodInvalid({ ...NO_AUDIT_FILTER, from: '2026-11-10', to: '2026-11-01' })).toBe(true);
    expect(periodInvalid({ ...NO_AUDIT_FILTER, from: '2026-11-01', to: '2026-11-01' })).toBe(false);
    expect(periodInvalid({ ...NO_AUDIT_FILTER, from: '2026-11-01' })).toBe(false);
  });
  it('rend un code d\'action lisible', () => {
    expect(actionLabel('drug_name.reviewed')).toBe('drug name reviewed');
    expect(actionLabel('login')).toBe('login');
  });
});
