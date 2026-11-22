import { describe, expect, it } from 'vitest';
import { incoming, titleWithCount } from './chat-alerts';
import type { ConversationSummary } from './messaging-rules';

const conv = (id: string, last: { id: string; sender: string } | null, unread: number): ConversationSummary => ({
  conversation: { id, kind: 'direct', memberIds: ['1', '2'], createdAt: '' },
  ...(last ? { last: { id: last.id, conversationId: id, senderId: last.sender, senderName: 'x', body: 'b', at: '2026-11-22T09:00:00Z' } } : {}),
  unread,
});

describe('alertes de messagerie', () => {
  it("n'alerte pas au premier chargement", () => {
    const r = incoming(null, [conv('a', { id: '5', sender: '2' }, 3)], '1');
    expect(r.fresh).toEqual([]);
    expect(r.seen).toEqual({ a: '5' });
  });

  it("alerte pour un nouveau message d'un autre, une seule fois", () => {
    const first = incoming(null, [conv('a', { id: '5', sender: '2' }, 1)], '1');
    const list = [conv('a', { id: '6', sender: '2' }, 2)];
    const r = incoming(first.seen, list, '1');
    expect(r.fresh.map((s) => s.conversation.id)).toEqual(['a']);
    expect(incoming(r.seen, list, '1').fresh).toEqual([]);
  });

  it("n'alerte pas pour mes propres messages ni sans message non lu", () => {
    const seen = { a: '5', b: '1' };
    expect(incoming(seen, [conv('a', { id: '6', sender: '1' }, 0)], '1').fresh).toEqual([]);
    expect(incoming(seen, [conv('b', { id: '2', sender: '2' }, 0)], '1').fresh).toEqual([]);
  });

  it('alerte pour une nouvelle conversation arrivée après le chargement', () => {
    expect(incoming({}, [conv('n', { id: '9', sender: '2' }, 1)], '1').fresh).toHaveLength(1);
  });

  it("met le compteur en tête du titre sans l'empiler", () => {
    expect(titleWithCount('CERO HEALTH', 3)).toBe('(3) CERO HEALTH');
    expect(titleWithCount('(3) CERO HEALTH', 5)).toBe('(5) CERO HEALTH');
    expect(titleWithCount('(5) CERO HEALTH', 0)).toBe('CERO HEALTH');
    expect(titleWithCount('CERO HEALTH', 120)).toBe('(99+) CERO HEALTH');
  });
});
