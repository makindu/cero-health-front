import type { Unit } from '@/core/local/unit-of-work';
import { conversationsRef, messagesRef, presenceRef, readsRef } from './collections';
import * as R from './messaging-rules';

export interface Contact { id: string; name: string; role: string }

export interface MessagingDeps {
  run: <T>(fn: (u: Unit) => Promise<T>) => Promise<T>;
  /** Personnes avec qui l'on peut converser (mode local : les utilisateurs de démonstration). */
  directory: () => readonly Contact[];
  newId: (prefix: string) => string;
}

function wrap<T>(fn: () => T): T { return fn(); }

/** Chacun ne voit que SES conversations (membre) ; aucune permission particulière, mais l'appartenance est vérifiée à chaque appel. */
export function createMessagingService(deps: MessagingDeps) {
  const member = async (u: Unit, id: string): Promise<R.Conversation> => {
    const c = await u.get(conversationsRef, id);
    if (!c || !R.isMember(c, u.ctx.actor.id)) throw new R.MessagingError('notFound');
    return c;
  };
  return {
    /** « Je suis là » : met à jour le dernier signal de l'utilisateur courant. */
    heartbeat: (): Promise<void> => deps.run(async (u) => {
      await u.put(presenceRef, { id: u.ctx.actor.id, userId: u.ctx.actor.id, seenAt: u.now.toISOString() }, { action: 'chat:presence' });
    }),

    /** Dernier signal de chacun (identifiant → date). Mode local : seuls les rôles actifs sur CET appareil apparaissent. */
    presence: (): Promise<Record<string, string>> => deps.run(async (u) => Object.fromEntries((await u.list(presenceRef)).map((p) => [p.userId, p.seenAt]))),

    contacts: async (): Promise<Contact[]> => deps.run(async (u) => deps.directory().filter((c) => c.id !== u.ctx.actor.id)),

    conversations: (): Promise<R.ConversationSummary[]> => deps.run(async (u) => {
      const me = u.ctx.actor.id;
      const [all, messages, marks] = await Promise.all([u.list(conversationsRef), u.list(messagesRef), u.list(readsRef)]);
      const mine = all.filter((c) => R.isMember(c, me));
      return R.sortSummaries(mine.map((c) => R.summarize(c, messages, marks.find((m) => m.id === R.readMarkId(c.id, me)), me)));
    }),

    thread: (conversationId: string): Promise<R.Message[]> => deps.run(async (u) => {
      await member(u, conversationId);
      return (await u.list(messagesRef)).filter((m) => m.conversationId === conversationId).sort((a, b) => a.at.localeCompare(b.at));
    }),

    /** Marques de lecture de la conversation (réservées aux membres) : sert à l'accusé « lu ». */
    reads: (conversationId: string): Promise<R.ReadMark[]> => deps.run(async (u) => {
      await member(u, conversationId);
      return (await u.list(readsRef)).filter((m) => m.conversationId === conversationId);
    }),

    /** Ouvre (ou crée) la conversation à deux avec une personne de l'annuaire. */
    openDirect: (otherId: string): Promise<R.Conversation> => deps.run(async (u) => {
      const me = u.ctx.actor.id;
      if (otherId !== me && !deps.directory().some((c) => c.id === otherId)) throw new R.MessagingError('contactUnknown');
      const id = R.directId(me, otherId);
      const existing = await u.get(conversationsRef, id);
      if (existing) return existing;
      const created = wrap(() => R.buildDirect(me, otherId, u.now.toISOString()));
      return u.insert(conversationsRef, created, { action: 'chat:open' });
    }),

    send: (input: { conversationId: string; body: string }): Promise<R.Message> => deps.run(async (u) => {
      const c = await member(u, input.conversationId);
      const message = wrap(() => R.buildMessage({
        id: deps.newId('msg'), conversation: c, senderId: u.ctx.actor.id, senderName: u.ctx.actor.name, body: input.body, now: u.now.toISOString(),
      }));
      await u.insert(messagesRef, message, { action: 'chat:send' });
      await u.update(conversationsRef, c.id, (cur) => ({ ...cur, lastMessageAt: message.at }), { action: 'chat:touch' });
      // Écrire dans une conversation, c'est l'avoir lue jusqu'ici.
      await u.put(readsRef, { id: R.readMarkId(c.id, u.ctx.actor.id), conversationId: c.id, userId: u.ctx.actor.id, readAt: message.at }, { action: 'chat:read' });
      return message;
    }),

    markRead: (conversationId: string): Promise<void> => deps.run(async (u) => {
      await member(u, conversationId);
      const me = u.ctx.actor.id;
      const last = (await u.list(messagesRef)).filter((m) => m.conversationId === conversationId).sort((a, b) => b.at.localeCompare(a.at))[0];
      if (!last) return;
      const id = R.readMarkId(conversationId, me);
      const cur = await u.get(readsRef, id);
      if (cur && cur.readAt >= last.at) return;
      await u.put(readsRef, { id, conversationId, userId: me, readAt: last.at }, { action: 'chat:read' });
    }),
  };
}
export type MessagingService = ReturnType<typeof createMessagingService>;
