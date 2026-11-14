/**
 * Messagerie interne (fonctions pures). Conversations à deux et canaux ouverts à tous.
 * Mode local : les messages restent sur CET appareil ; ils ne sont lus que par les rôles de démonstration qui s'y connectent.
 * Un message est du TEXTE brut (jamais interprété comme du HTML). La messagerie n'est pas un dossier médical :
 * on y renvoie à un patient par son numéro de dossier, sans y écrire de données cliniques détaillées.
 */
export const MAX_MESSAGE_LENGTH = 2000;
export const ALL = '*';

export type ConversationKind = 'direct' | 'channel';

export interface Conversation {
  id: string;
  kind: ConversationKind;
  /** Titre d'un canal (absent pour une conversation à deux). */
  title?: string;
  /** Identifiants des membres ; « * » = tout le monde (canal général). */
  memberIds: string[];
  createdAt: string;
  lastMessageAt?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  at: string;
}

/** Dernier instant de lecture d'un utilisateur dans une conversation. */
export interface ReadMark {
  id: string; // `${conversationId}:${userId}`
  conversationId: string;
  userId: string;
  readAt: string;
}

export class MessagingError extends Error {
  constructor(readonly code: string, readonly params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'MessagingError';
  }
}
const fail = (code: string, params?: Record<string, string | number>): never => { throw new MessagingError(code, params); };

export const readMarkId = (conversationId: string, userId: string): string => `${conversationId}:${userId}`;

/** Identifiant stable d'une conversation à deux : le même pour (a,b) et (b,a). */
export const directId = (a: string, b: string): string => `dm:${[a, b].sort().join(':')}`;

export const isMember = (c: Conversation, userId: string): boolean => c.memberIds.includes(ALL) || c.memberIds.includes(userId);

export function buildDirect(me: string, other: string, now: string): Conversation {
  if (!other.trim()) fail('contactRequired');
  if (me === other) fail('selfConversation');
  return { id: directId(me, other), kind: 'direct', memberIds: [me, other].sort(), createdAt: now };
}

/** Message valide : texte non vide après nettoyage, borné. Les espaces de début/fin sont retirés, les retours à la ligne gardés. */
export function buildMessage(input: { id: string; conversation: Conversation; senderId: string; senderName: string; body: string; now: string }): Message {
  if (!isMember(input.conversation, input.senderId)) fail('notMember');
  const body = input.body.replace(/\r\n/g, '\n').trim();
  if (!body) fail('bodyRequired');
  if (body.length > MAX_MESSAGE_LENGTH) fail('bodyTooLong', { max: MAX_MESSAGE_LENGTH });
  return { id: input.id, conversationId: input.conversation.id, senderId: input.senderId, senderName: input.senderName, body, at: input.now };
}

export interface ConversationSummary {
  conversation: Conversation;
  last?: Message;
  unread: number;
}

/** Résumé d'une conversation pour `userId` : dernier message et nombre de messages reçus non lus. */
export function summarize(c: Conversation, messages: readonly Message[], mark: ReadMark | undefined, userId: string): ConversationSummary {
  const mine = messages.filter((m) => m.conversationId === c.id).sort((a, b) => a.at.localeCompare(b.at));
  const unread = mine.filter((m) => m.senderId !== userId && (!mark || m.at > mark.readAt)).length;
  const last = mine[mine.length - 1];
  return { conversation: c, ...(last ? { last } : {}), unread };
}

/** Tri de la liste : la plus récente activité d'abord, les canaux sans message en dernier. */
export function sortSummaries(list: readonly ConversationSummary[]): ConversationSummary[] {
  const at = (s: ConversationSummary): string => s.last?.at ?? s.conversation.lastMessageAt ?? '';
  return [...list].sort((a, b) => at(b).localeCompare(at(a)) || a.conversation.id.localeCompare(b.conversation.id));
}

export const totalUnread = (list: readonly ConversationSummary[]): number => list.reduce((n, s) => n + s.unread, 0);

/** Présence : chaque poste ouvert signale « je suis là » toutes les 20 s ; au-delà de 60 s sans signal, la personne est hors ligne. */
export const HEARTBEAT_MS = 20_000;
export const ONLINE_WINDOW_MS = 60_000;

export interface Presence { id: string; userId: string; seenAt: string }

export type PresenceState = { state: 'online' } | { state: 'offline'; seenAt?: string };

export function presenceOf(seenAt: string | undefined, now: Date): PresenceState {
  if (!seenAt) return { state: 'offline' };
  const age = now.getTime() - new Date(seenAt).getTime();
  return age >= -ONLINE_WINDOW_MS && age <= ONLINE_WINDOW_MS ? { state: 'online' } : { state: 'offline', seenAt };
}

/** Personnes (autres que l'expéditeur) qui ont lu le message : leur marque de lecture est au moins aussi récente que lui. */
export const readersOf = (message: Message, marks: readonly ReadMark[]): ReadMark[] =>
  marks.filter((m) => m.conversationId === message.conversationId && m.userId !== message.senderId && m.readAt >= message.at);
