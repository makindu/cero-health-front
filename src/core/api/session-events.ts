import type { ApiSource } from './types';

/**
 * Bus d'événements minimal entre la couche API et l'authentification.
 * Les clients HTTP signalent une session expirée ; la couche d'authentification (phase 2)
 * y réagit (déconnexion, redirection) sans que la couche API dépende d'elle.
 */

export type SessionEvent =
  | { type: 'unauthorized'; source: ApiSource }
  | { type: 'csrf-expired'; source: ApiSource };

type Handler = (event: SessionEvent) => void;

const handlers = new Set<Handler>();

export const sessionEvents = {
  subscribe(handler: Handler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  },
  emit(event: SessionEvent): void {
    handlers.forEach((handler) => handler(event));
  },
};
