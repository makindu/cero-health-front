import { describe, expect, it } from 'vitest';
import type { LocalContext } from '@/core/local/context';
import { createMemoryDatabase } from '@/core/local/memory-database';
import { runUnit } from '@/core/local/unit-of-work';
import * as R from './messaging-rules';
import { createMessagingService } from './messaging-service';

const DIR = [{ id: 'u-doc', name: 'Médecin', role: 'doctor' }, { id: 'u-ph', name: 'Pharmacien', role: 'pharmacist' }, { id: 'u-lab', name: 'Labo', role: 'labTech' }];
function setup() {
  const db = createMemoryDatabase();
  const state = { now: new Date(2026, 10, 15, 9, 0, 0), actor: DIR[0]!, n: 0 };
  const ctx = (): LocalContext => ({ facilityId: 'F1', actor: { id: state.actor.id, name: state.actor.name } });
  const svc = createMessagingService({ run: (fn) => runUnit(fn, { db: async () => db, context: ctx, now: () => state.now }), directory: () => DIR, newId: (p) => `${p}-${++state.n}` });
  const as = (i: number) => { state.actor = DIR[i]!; };
  const tick = (min = 1) => { state.now = new Date(state.now.getTime() + min * 60_000); };
  return { svc, state, as, tick };
}
const code = async (p: Promise<unknown>): Promise<string | undefined> => { try { await p; } catch (e) { return (e as R.MessagingError).code; } };

describe('règles de la messagerie', () => {
  it('identifiant de conversation à deux stable ; pas de conversation avec soi-même', () => {
    expect(R.directId('a', 'b')).toBe(R.directId('b', 'a'));
    expect(() => R.buildDirect('a', 'a', 'x')).toThrow('selfConversation');
    expect(() => R.buildDirect('a', ' ', 'x')).toThrow('contactRequired');
  });
  it('message : non vide, borné, texte brut conservé tel quel (retours à la ligne gardés)', () => {
    const c: R.Conversation = { id: 'c', kind: 'direct', memberIds: ['a', 'b'], createdAt: 'x' };
    const base = { id: 'm', conversation: c, senderId: 'a', senderName: 'A', now: 'now' };
    expect(() => R.buildMessage({ ...base, body: '  \n ' })).toThrow('bodyRequired');
    expect(() => R.buildMessage({ ...base, body: 'x'.repeat(R.MAX_MESSAGE_LENGTH + 1) })).toThrow('bodyTooLong');
    expect(() => R.buildMessage({ ...base, senderId: 'z', body: 'salut' })).toThrow('notMember');
    expect(R.buildMessage({ ...base, body: ' <b>a</b>\r\nb ' }).body).toBe('<b>a</b>\nb');
  });
});

describe('messagerie locale', () => {
  it('conversation à deux : messages visibles par les deux seulement, non lus comptés pour le destinataire', async () => {
    const s = setup();
    const c = await s.svc.openDirect('u-ph'); // médecin → pharmacien
    expect(c.id).toBe(R.directId('u-doc', 'u-ph'));
    expect((await s.svc.openDirect('u-ph')).id).toBe(c.id); // idempotent
    await s.svc.send({ conversationId: c.id, body: 'Bonjour, ordonnance RX-1 prête ?' });
    s.tick();
    await s.svc.send({ conversationId: c.id, body: 'Je regarde.' });
    // l'expéditeur n'a rien de non lu
    expect((await s.svc.conversations()).find((x) => x.conversation.id === c.id)!.unread).toBe(0);
    // le destinataire : 2 non lus
    s.as(1);
    const mine = await s.svc.conversations();
    expect(mine.find((x) => x.conversation.id === c.id)).toMatchObject({ unread: 2, last: { body: 'Je regarde.' } });
    await s.svc.markRead(c.id);
    expect((await s.svc.conversations()).find((x) => x.conversation.id === c.id)!.unread).toBe(0);
    // un troisième utilisateur ne voit rien et ne peut rien lire ni écrire
    s.as(2);
    expect((await s.svc.conversations()).map((x) => x.conversation.id)).toEqual(['channel-general']);
    expect(await code(s.svc.thread(c.id))).toBe('notFound');
    expect(await code(s.svc.send({ conversationId: c.id, body: 'intrus' }))).toBe('notFound');
    expect(await code(s.svc.markRead(c.id))).toBe('notFound');
  });

  it('canal général : tout le monde y écrit, chacun a ses propres non lus ; nouveau message → de nouveau non lu', async () => {
    const s = setup();
    await s.svc.send({ conversationId: 'channel-general', body: 'Réunion à 14 h' });
    s.as(1);
    expect((await s.svc.conversations()).find((x) => x.conversation.id === 'channel-general')!.unread).toBe(1);
    await s.svc.markRead('channel-general');
    s.tick();
    s.as(2);
    await s.svc.send({ conversationId: 'channel-general', body: 'Reçu' });
    s.as(1);
    expect((await s.svc.conversations()).find((x) => x.conversation.id === 'channel-general')!.unread).toBe(1);
    expect((await s.svc.thread('channel-general')).map((m) => m.senderName)).toEqual(['Médecin', 'Labo']);
  });

  it('refus : contact inconnu, soi-même, message vide ; rien n’est enregistré', async () => {
    const s = setup();
    expect(await code(s.svc.openDirect('inconnu'))).toBe('contactUnknown');
    expect(await code(s.svc.openDirect('u-doc'))).toBe('selfConversation');
    expect(await code(s.svc.send({ conversationId: 'channel-general', body: '   ' }))).toBe('bodyRequired');
    expect(await s.svc.thread('channel-general')).toHaveLength(0);
    expect((await s.svc.contacts()).map((c) => c.id)).toEqual(['u-ph', 'u-lab']);
  });

  it('isolation entre établissements : le canal et les messages d’un site ne sont pas ceux d’un autre', async () => {
    const db = createMemoryDatabase();
    let facility = 'F1';
    const svc = createMessagingService({ run: (fn) => runUnit(fn, { db: async () => db, context: () => ({ facilityId: facility, actor: { id: 'u-doc', name: 'Médecin' } }), now: () => new Date(2026, 10, 15, 9) }), directory: () => DIR, newId: (p) => `${p}-${Math.random()}` });
    await svc.send({ conversationId: 'channel-general', body: 'site 1' });
    facility = 'F2';
    expect(await svc.thread('channel-general')).toHaveLength(0);
  });
});

describe('présence', () => {
  it('en ligne tant que le dernier signal a moins de 60 s ; ensuite hors ligne avec la dernière vue', async () => {
    const s = setup();
    await s.svc.heartbeat();
    s.as(1);
    const seen = (await s.svc.presence())['u-doc']!;
    expect(R.presenceOf(seen, s.state.now)).toEqual({ state: 'online' });
    s.tick(2);
    expect(R.presenceOf(seen, s.state.now)).toEqual({ state: 'offline', seenAt: seen });
    expect(R.presenceOf(undefined, s.state.now)).toEqual({ state: 'offline' });
    expect((await s.svc.presence())['u-lab']).toBeUndefined();
  });
});

describe('accusé de lecture', () => {
  it('le message est « lu » quand le destinataire a ouvert la conversation, pas avant ; refusé aux non-membres', async () => {
    const s = setup();
    const c = await s.svc.openDirect('u-ph');
    const m = await s.svc.send({ conversationId: c.id, body: 'ordonnance prête ?' });
    expect(R.readersOf(m, await s.svc.reads(c.id))).toHaveLength(0);
    s.tick();
    s.as(1);
    await s.svc.markRead(c.id);
    s.as(0);
    expect(R.readersOf(m, await s.svc.reads(c.id)).map((r) => r.userId)).toEqual(['u-ph']);
    s.tick();
    const m2 = await s.svc.send({ conversationId: c.id, body: 'merci' });
    expect(R.readersOf(m2, await s.svc.reads(c.id))).toHaveLength(0);
    s.as(2);
    expect(await code(s.svc.reads(c.id))).toBe('notFound');
  });
});
