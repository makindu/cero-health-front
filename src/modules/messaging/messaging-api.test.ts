import { describe, expect, it } from 'vitest';
import { directoryFrom, messageFrom, readsFrom, summaryFrom } from './messaging-api';

describe('messagerie API', () => {
  it('traduit une conversation avec son dernier message et ses non lus', () => {
    const s = summaryFrom({
      id: 4, kind: 'direct', title: null, last_message_at: '2026-11-22T09:00:00Z', member_staff_ids: [1, 2], unread: 3,
      last_message: { id: 9, sender_staff_id: 2, body: 'Bonjour', sent_at: '2026-11-22T09:00:00Z' },
    });
    expect(s.conversation).toMatchObject({ id: '4', kind: 'direct', memberIds: ['1', '2'], lastMessageAt: '2026-11-22T09:00:00Z' });
    expect(s.conversation.title).toBeUndefined();
    expect(s.unread).toBe(3);
    expect(s.last).toMatchObject({ id: '9', conversationId: '4', senderId: '2', body: 'Bonjour' });
  });

  it('accepte une conversation sans message', () => {
    const s = summaryFrom({ id: 5, kind: 'channel', title: 'Général', member_staff_ids: [1], unread: 0, last_message: null });
    expect(s.last).toBeUndefined();
    expect(s.conversation.kind).toBe('channel');
    expect(s.conversation.title).toBe('Général');
  });

  it('traduit un message et les marques de lecture', () => {
    expect(messageFrom({ id: 1, conversation_id: 4, sender_staff_id: 7, body: 'x', sent_at: '2026-11-22T09:00:00Z' })).toMatchObject({ id: '1', conversationId: '4', senderId: '7', at: '2026-11-22T09:00:00Z' });
    expect(readsFrom('4', [{ staff_id: 2, read_at: '2026-11-22T09:05:00Z' }])).toEqual([{ id: '4:2', conversationId: '4', userId: '2', readAt: '2026-11-22T09:05:00Z' }]);
  });

  it('traduit l\'annuaire de la messagerie', () => {
    expect(directoryFrom([{ id: 3, user_id: 9, name: 'Dr Mwamba', staff_type: 'pharmacist' }, { id: 4, user_id: null, name: '', staff_type: 'nurse' }])).toEqual([
      { id: '3', userId: '9', name: 'Dr Mwamba', role: 'pharmacist' }, { id: '4', userId: '', name: '#4', role: 'nurse' },
    ]);
  });
});
