import { ApiError, healthClient } from '@/core/api';
import { ensureReference, staffById } from '../_shared/reference-data';
import type { Rx, RxItem, RxStatus } from './rx-rules';
import type { RxService } from './rx-service';

/**
 * Ordonnances sur l'API réelle (HEALTH) : /prescriptions. Le serveur numérote, fixe le statut, le prescripteur et les dates.
 * Posologie, fréquence et durée restent saisies par le prescripteur : l'interface n'en propose et n'en contrôle aucune.
 */
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const STATUSES: readonly string[] = ['toValidate', 'validated', 'dispensed', 'cancelled'];

export function rxFromApi(r: Record<string, unknown>): Rx {
  const patient = (r.patient ?? null) as { full_name?: string } | null;
  const items = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  const status = text(r.status);
  const rx: Rx = {
    id: text(r.id),
    number: text(r.number),
    patientId: text(r.patient_id),
    patientName: patient?.full_name ?? `Patient n°${text(r.patient_id)}`,
    consultationId: r.consultation_id ? text(r.consultation_id) : undefined,
    prescriber: staffById(text(r.prescriber_staff_id))?.name ?? '',
    prescriberId: r.prescriber_user_id ? text(r.prescriber_user_id) : undefined,
    prescribedAt: text(r.prescribed_at),
    status: (STATUSES.includes(status) ? status : 'toValidate') as RxStatus,
    items: items.map(
      (i): RxItem => ({
        label: text(i.label),
        dosage: text(i.dosage),
        frequency: text(i.frequency),
        duration: text(i.duration),
        quantity: Number(i.quantity) || 0,
        instructions: text(i.instructions),
      }),
    ),
    note: text(r.note),
  };
  if (r.validated_at) rx.validation = { at: text(r.validated_at), by: '' };
  if (r.cancelled_at) rx.cancellation = { at: text(r.cancelled_at), by: '', reason: text(r.cancel_reason) };
  return rx;
}

export function rxToApi(input: { patientId: string; items: RxItem[]; note: string; consultationId?: string }): Record<string, unknown> {
  const patient = Number(input.patientId);
  if (!Number.isInteger(patient) || patient <= 0) {
    throw new ApiError('validation', 'Choisissez un patient dans la liste.', { source: 'health', status: 422, code: 'invalid_input' });
  }
  const body: Record<string, unknown> = {
    patient_id: patient,
    items: input.items.map((i) => ({
      label: i.label.trim(),
      dosage: i.dosage.trim(),
      frequency: i.frequency.trim(),
      duration: i.duration.trim(),
      quantity: i.quantity,
      instructions: i.instructions.trim(),
    })),
  };
  if (input.note.trim()) body.note = input.note.trim().slice(0, 255);
  const consultation = Number(input.consultationId);
  if (input.consultationId && Number.isInteger(consultation) && consultation > 0) body.consultation_id = consultation;
  return body;
}

export const rxApi: RxService = {
  async list() {
    await ensureReference();
    const res = await healthClient.get<Record<string, unknown>[]>('/prescriptions', { params: { per_page: 100 } });
    return (Array.isArray(res.data) ? res.data : []).map(rxFromApi);
  },
  async create(input) {
    await ensureReference();
    const res = await healthClient.post<Record<string, unknown>>('/prescriptions', rxToApi(input));
    return rxFromApi(res.data);
  },
  async validate({ id }) {
    await ensureReference();
    const res = await healthClient.post<Record<string, unknown>>(`/prescriptions/${encodeURIComponent(id)}/actions/validate`, {});
    return rxFromApi(res.data);
  },
  async cancel({ id, reason }) {
    await ensureReference();
    const res = await healthClient.post<Record<string, unknown>>(`/prescriptions/${encodeURIComponent(id)}/actions/cancel`, { reason: reason.trim().slice(0, 255) });
    return rxFromApi(res.data);
  },
};
