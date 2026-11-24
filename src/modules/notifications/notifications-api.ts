import { healthClient } from '@/core/api';

/** Notifications de la personne connectée, lues sur le serveur. La charge utile ne contient que des identifiants et des codes courts. */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);

export const NOTIFICATIONS_PAGE = 20;
export const NOTIFICATIONS_READ = 'health.notifications.read';

export interface ApiNotification { id: string; kind: string; payload: Row; createdAt: string; readAt: string }

export function notificationFrom(r: Row): ApiNotification {
  return { id: text(r.id), kind: text(r.kind), payload: rec(r.payload), createdAt: text(r.created_at), readAt: text(r.read_at) };
}
export const unreadIn = (list: readonly ApiNotification[]): number => list.filter((n) => n.readAt === '').length;

export interface NotificationView { key: string; title: string; to: string; lines: number }

/** Titre lisible et écran à ouvrir pour chaque type connu ; un type inconnu reste affiché sans lien (jamais ignoré). */
export function describeNotification(n: Pick<ApiNotification, 'kind' | 'payload'>): NotificationView {
  const lines = Number(n.payload.lines);
  switch (n.kind) {
    case 'admission.discharge_requested': return { key: 'discharge', title: 'Sortie demandée pour une hospitalisation', to: '/hospitalization', lines: 0 };
    case 'lab.validated': return { key: 'lab', title: 'Résultats de laboratoire validés', to: '/laboratory', lines: 0 };
    case 'rx.deviation': return { key: 'rx', title: 'La pharmacie s’est écartée d’une ordonnance', to: '/prescriptions', lines: Number.isFinite(lines) && lines > 0 ? lines : 0 };
    default: return { key: 'other', title: 'Nouvelle notification', to: '', lines: 0 };
  }
}

export const apiNotifications = {
  list: async (): Promise<ApiNotification[]> =>
    rows((await healthClient.get<Row[]>('/notifications', { params: { per_page: NOTIFICATIONS_PAGE } })).data).map(notificationFrom),
  unread: async (): Promise<number> => {
    const n = Number(rec((await healthClient.get<Row>('/notifications/unread-count')).data).unread);
    return Number.isFinite(n) && n > 0 ? n : 0;
  },
  read: async (id: string): Promise<void> => { await healthClient.post(`/notifications/${id}/read`, {}); },
  readAll: async (): Promise<void> => { await healthClient.post('/notifications/read-all', {}); },
};
