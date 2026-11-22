import { healthClient } from '@/core/api';
import { ensureReference, staffById } from '../_shared/reference-data';
import type { Contact } from './messaging-service';
import type { Conversation, ConversationSummary, Message, ReadMark } from './messaging-rules';

/**
 * Messagerie branchée sur l'API HEALTH. Les identifiants de personnes sont ceux des profils de personnel du serveur.
 * Le serveur vérifie l'appartenance à chaque appel : une conversation dont on n'est pas membre est « introuvable ».
 */
type Row = Record<string, unknown>;

/** Taille d'une page de messages. */
export const PAGE = 50;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

/** Annuaire de la messagerie : ouvert à tout membre (la liste du personnel, elle, exige un droit que beaucoup n'ont pas). */
export interface DirectoryEntry { id: string; userId: string; name: string; role: string }
let directoryCache: { at: number; list: DirectoryEntry[] } | null = null;
const DIRECTORY_TTL_MS = 300_000;

export function directoryFrom(list: Row[]): DirectoryEntry[] {
  return list.map((r) => ({ id: str(r.id), userId: str(r.user_id), name: str(r.name) || `#${str(r.id)}`, role: str(r.staff_type) }));
}
export async function fetchDirectory(force = false): Promise<DirectoryEntry[]> {
  if (!force && directoryCache && Date.now() - directoryCache.at < DIRECTORY_TTL_MS) return directoryCache.list;
  const res = await healthClient.get<Row[]>('/messaging/directory');
  directoryCache = { at: Date.now(), list: directoryFrom(rows(res.data)) };
  return directoryCache.list;
}
/** Charge les références nécessaires aux noms ; l'annuaire ne bloque jamais le reste. */
const ensureNames = async (): Promise<void> => { await Promise.all([ensureReference(), fetchDirectory().catch(() => [])]); };

const nameOf = (staffId: unknown): string => directoryCache?.list.find((d) => d.id === str(staffId))?.name ?? staffById(str(staffId))?.name ?? `#${str(staffId)}`;

export function messageFrom(r: Row, conversationId?: string): Message {
  return { id: str(r.id), conversationId: conversationId ?? str(r.conversation_id), senderId: str(r.sender_staff_id), senderName: nameOf(r.sender_staff_id), body: str(r.body), at: str(r.sent_at) };
}

export function summaryFrom(r: Row): ConversationSummary {
  const id = str(r.id);
  const last = r.last_message && typeof r.last_message === 'object' ? messageFrom(r.last_message as Row, id) : undefined;
  const conversation: Conversation = {
    id, kind: r.kind === 'channel' ? 'channel' : 'direct', title: r.title ? str(r.title) : undefined,
    memberIds: (Array.isArray(r.member_staff_ids) ? r.member_staff_ids : []).map(str), createdAt: '', lastMessageAt: r.last_message_at ? str(r.last_message_at) : undefined,
  };
  return { conversation, ...(last ? { last } : {}), unread: Number(r.unread ?? 0) };
}

export function readsFrom(conversationId: string, list: Row[]): ReadMark[] {
  return list.map((m) => ({ id: `${conversationId}:${str(m.staff_id)}`, conversationId, userId: str(m.staff_id), readAt: str(m.read_at) }));
}

export const apiMessaging = {
  heartbeat: async (): Promise<void> => { await healthClient.post('/presence/ping', {}); },

  /** Les personnes en ligne (signal de moins de 2 minutes) : leur « vu » est maintenant ; les autres n'ont pas de date. */
  presence: async (): Promise<Record<string, string>> => {
    const res = await healthClient.get<Row>('/presence');
    const ids = (Array.isArray((res.data as Row | undefined)?.staff_ids) ? ((res.data as Row).staff_ids as unknown[]) : []).map(str);
    const now = new Date().toISOString();
    return Object.fromEntries(ids.map((id) => [id, now]));
  },

  contacts: async (): Promise<Contact[]> => (await fetchDirectory()).map((d) => ({ id: d.id, name: d.name, role: d.role })),

  conversations: async (): Promise<ConversationSummary[]> => {
    await ensureNames();
    const res = await healthClient.get<Row[]>('/conversations');
    return rows(res.data).map(summaryFrom);
  },

  thread: async (conversationId: string): Promise<Message[]> => {
    await ensureNames();
    const res = await healthClient.get<Row[]>(`/conversations/${conversationId}/messages`, { params: { limit: PAGE } });
    return rows(res.data).map((r) => messageFrom(r, conversationId)).reverse();
  },

  /** Messages plus anciens que `beforeId` (du plus ancien au plus récent). Moins de PAGE résultats = on a tout lu. */
  older: async (conversationId: string, beforeId: string): Promise<Message[]> => {
    await ensureNames();
    const res = await healthClient.get<Row[]>(`/conversations/${conversationId}/messages`, { params: { limit: PAGE, before_id: Number(beforeId) } });
    return rows(res.data).map((r) => messageFrom(r, conversationId)).reverse();
  },

  /** Crée un canal (groupe). Le créateur en fait partie d'office. Réservé à health.messaging.manage. */
  createChannel: async (input: { title: string; memberIds: string[] }): Promise<Conversation> => {
    const res = await healthClient.post<Row>('/conversations/channels', { title: input.title.trim(), member_ids: input.memberIds.map(Number) });
    return { id: str((res.data as Row).id), kind: 'channel', title: input.title.trim(), memberIds: input.memberIds, createdAt: '' };
  },

  addMembers: async (input: { conversationId: string; memberIds: string[] }): Promise<void> => {
    await healthClient.post(`/conversations/${input.conversationId}/members`, { member_ids: input.memberIds.map(Number) });
  },

  reads: async (conversationId: string): Promise<ReadMark[]> => {
    const res = await healthClient.get<Row[]>(`/conversations/${conversationId}/reads`);
    return readsFrom(conversationId, rows(res.data));
  },

  openDirect: async (otherId: string): Promise<Conversation> => {
    const res = await healthClient.post<Row>('/conversations/direct', { staff_id: Number(otherId) });
    return { id: str((res.data as Row).id), kind: 'direct', memberIds: [otherId], createdAt: '' };
  },

  send: async (input: { conversationId: string; body: string }): Promise<Message> => {
    await ensureNames();
    const res = await healthClient.post<Row>(`/conversations/${input.conversationId}/messages`, { body: input.body });
    return messageFrom(res.data as Row, input.conversationId);
  },

  /** « Je suis en train d'écrire » (signal court, sans contenu). */
  typing: async (conversationId: string): Promise<void> => { await healthClient.post(`/conversations/${conversationId}/typing`, {}); },

  /** Autres membres en train d'écrire (identifiants de personnel). */
  typists: async (conversationId: string): Promise<string[]> => {
    const res = await healthClient.get<Row>(`/conversations/${conversationId}/typing`);
    const ids = (res.data as Row | undefined)?.staff_ids;
    return (Array.isArray(ids) ? ids : []).map(str);
  },

  markRead: async (conversationId: string): Promise<void> => { await healthClient.post(`/conversations/${conversationId}/read`, {}); },
};
