import { describe, expect, it } from 'vitest';
import { mailFrom } from './mail-api';

describe('courrier patient (API)', () => {
  it('lit un courrier du serveur', () => {
    const m = mailFrom({ id: 4, patient_id: 9, to: 'a@b.cd', kind: 'appointment', subject: 'S', body: 'B', status: 'queued', scheduled_for: '2026-11-24T08:00:00Z', source_ref: 'appointment:3:1d', created_at: '2026-11-23T10:00:00Z', created_by: 'Dr X' });
    expect(m).toMatchObject({ id: '4', patientId: '9', to: 'a@b.cd', kind: 'appointment', status: 'queued', scheduledFor: '2026-11-24T08:00:00Z', sourceRef: 'appointment:3:1d', createdBy: 'Dr X' });
    expect(m.sentAt).toBeUndefined();
  });
  it('garde la date d\'envoi et la cause d\'un échec', () => {
    expect(mailFrom({ id: 1, kind: 'free', status: 'sent', sent_at: '2026-11-23T10:05:00Z' }).sentAt).toBe('2026-11-23T10:05:00Z');
    expect(mailFrom({ id: 1, kind: 'free', status: 'failed', error_code: 'send_failed' })).toMatchObject({ status: 'failed', errorCode: 'send_failed' });
  });
  it('ramène un type ou un statut inconnu à une valeur sûre', () => {
    const m = mailFrom({ id: 1, kind: 'weird', status: 'weird' });
    expect(m.kind).toBe('free');
    expect(m.status).toBe('queued');
  });
});
