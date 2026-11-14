import { defineCollection } from '@/core/local/unit-of-work';
import { ALL, type Conversation, type Message, type Presence, type ReadMark } from './messaging-rules';

export const MESSAGING_COLLECTIONS = { conversations: 'health-chat-conversations', messages: 'health-chat-messages', reads: 'health-chat-reads', presence: 'health-chat-presence' } as const;

/** FICTIF : un canal général ouvert à tous les utilisateurs de démonstration. */
export const GENERAL_CHANNEL: Conversation = { id: 'channel-general', kind: 'channel', title: 'Général', memberIds: [ALL], createdAt: '2026-01-01T08:00:00.000Z' };

export const conversationsRef = defineCollection<Conversation>(MESSAGING_COLLECTIONS.conversations, [GENERAL_CHANNEL]);
export const messagesRef = defineCollection<Message>(MESSAGING_COLLECTIONS.messages);
export const readsRef = defineCollection<ReadMark>(MESSAGING_COLLECTIONS.reads);
export const presenceRef = defineCollection<Presence>(MESSAGING_COLLECTIONS.presence);
