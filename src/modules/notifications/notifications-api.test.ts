import { describe, expect, it } from 'vitest';
import { describeNotification, notificationFrom, unreadIn } from './notifications-api';

describe('notifications du serveur', () => {
  it('lit une notification non lue', () => {
    expect(notificationFrom({ id: 5, kind: 'lab.validated', payload: { lab_order_id: 8 }, created_at: '2026-11-22T10:00:00Z', read_at: null }))
      .toEqual({ id: '5', kind: 'lab.validated', payload: { lab_order_id: 8 }, createdAt: '2026-11-22T10:00:00Z', readAt: '' });
  });
  it('accepte une charge utile absente', () => {
    expect(notificationFrom({ id: 1, kind: 'x', payload: null }).payload).toEqual({});
  });
  it('compte les non lues', () => {
    const list = [notificationFrom({ id: 1, read_at: null }), notificationFrom({ id: 2, read_at: '2026-11-22T11:00:00Z' }), notificationFrom({ id: 3 })];
    expect(unreadIn(list)).toBe(2);
    expect(unreadIn([])).toBe(0);
  });
  it('décrit chaque type connu avec son écran', () => {
    expect(describeNotification({ kind: 'lab.validated', payload: {} }).to).toBe('/laboratory');
    expect(describeNotification({ kind: 'admission.discharge_requested', payload: {} }).to).toBe('/hospitalization');
    expect(describeNotification({ kind: 'rx.deviation', payload: { lines: 2 } })).toMatchObject({ key: 'rx', to: '/prescriptions', lines: 2 });
  });
  it('ignore un nombre de lignes invalide et affiche un type inconnu sans lien', () => {
    expect(describeNotification({ kind: 'rx.deviation', payload: { lines: 'abc' } }).lines).toBe(0);
    expect(describeNotification({ kind: 'rx.deviation', payload: {} }).lines).toBe(0);
    expect(describeNotification({ kind: 'futur.type', payload: {} })).toMatchObject({ key: 'other', to: '' });
  });
});
