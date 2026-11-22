import { healthClient } from '@/core/api';
import { authorName } from '../consultations/record-api';
import type { AppointmentEvent, AppointmentEventType } from './data';

const TYPES: readonly AppointmentEventType[] = ['created', 'updated', 'rescheduled', 'cancelled', 'checkedIn', 'noShow', 'confirmed', 'waiting', 'started', 'completed', 'assigned'];

/** Historique réel d'un rendez-vous (GET /appointments/{id}/events) : ajout seul côté serveur, le plus récent est trié à l'affichage. */
export async function fetchAppointmentHistory(id: string): Promise<AppointmentEvent[]> {
  const res = await healthClient.get<Record<string, unknown>[]>(`/appointments/${encodeURIComponent(id)}/events`);
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.flatMap((r) => {
    const type = String(r.event_type ?? '') as AppointmentEventType;
    if (!TYPES.includes(type)) return [];
    return [{
      type,
      at: String(r.occurred_at ?? ''),
      by: authorName(r.actor_user_id) || '—',
      ...(r.reason ? { reason: String(r.reason) } : {}),
      ...(r.from_starts_at ? { from: String(r.from_starts_at) } : {}),
    }];
  });
}
