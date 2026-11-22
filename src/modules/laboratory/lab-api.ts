import { healthClient } from '@/core/api';
import { ensureReference, staffByUserId } from '../_shared/reference-data';
import type { LabAmendment, LabFlag, LabOrder, LabPriority, LabResultValue, LabStatus } from './lab-rules';
import type { LabOrderView } from './lab-service';

/**
 * Laboratoire branché sur l'API HEALTH. Le serveur applique les droits, le flux (demandé → prélevé → en cours →
 * saisi → validé), le contrôle de paiement avant prélèvement et la double validation éventuelle.
 * Aucune valeur de résultat n'est jamais proposée : tout vient de la saisie du laborantin.
 */
type Row = Record<string, unknown>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const FLAGS: readonly LabFlag[] = ['unspecified', 'normal', 'abnormal'];
const STATUSES: readonly LabStatus[] = ['requested', 'collected', 'inProgress', 'resultEntered', 'validated', 'cancelled'];
const author = (userId: unknown): string => (userId === null || userId === undefined ? '' : staffByUserId(str(userId))?.name ?? `#${str(userId)}`);
const flagOf = (v: unknown): LabFlag => (FLAGS.includes(v as LabFlag) ? (v as LabFlag) : 'unspecified');

export const resultFrom = (r: Row): LabResultValue => ({
  code: str(r.code),
  value: str(r.value),
  unit: str(r.unit),
  referenceRange: str(r.reference_range),
  flag: flagOf(r.flag),
  comment: str(r.comment),
});

const stamp = (at: unknown, by: unknown): { at: string; by: string } | undefined => (at ? { at: str(at), by: author(by) } : undefined);

export function labOrderFrom(r: Row): LabOrderView {
  const tests = (Array.isArray(r.tests) ? (r.tests as Row[]) : []);
  const patient = (r.patient ?? {}) as Row;
  const status = STATUSES.includes(r.status as LabStatus) ? (r.status as LabStatus) : 'requested';
  const amendments: LabAmendment[] = (Array.isArray(r.amendments) ? (r.amendments as Row[]) : []).map((a) => ({
    at: str(a.amended_at),
    by: author(a.amended_by_user_id),
    reason: str(a.reason),
    previous: (Array.isArray(a.previous) ? (a.previous as Row[]) : []).map(resultFrom),
  }));
  const collected = stamp(r.collected_at, r.collected_by_user_id);
  const cancelledAt = r.cancelled_at ? str(r.cancelled_at) : undefined;
  const order: LabOrder = {
    id: str(r.id),
    number: str(r.number),
    patientId: str(r.patient_id),
    patientName: str(patient.full_name) || `Patient n°${str(r.patient_id)}`,
    consultationId: r.consultation_id ? str(r.consultation_id) : undefined,
    requestedBy: author(r.requested_by_user_id),
    requestedAt: str(r.requested_at),
    priority: (r.priority === 'urgent' ? 'urgent' : 'routine') as LabPriority,
    clinicalNote: str(r.clinical_note),
    status,
    tests: tests.map((t) => ({ code: str(t.code), label: str(t.label), catalogItemId: '' })),
    invoiceId: '',
    collected: collected ? { ...collected, sampleNote: str(r.sample_note) } : undefined,
    started: stamp(r.started_at, r.started_by_user_id),
    results: tests.filter((t) => str(t.value) !== '').map(resultFrom),
    resultsEnteredBy: stamp(r.results_entered_at, r.results_entered_by_user_id),
    validation: stamp(r.validated_at, r.validated_by_user_id),
    amendments,
    cancellation: cancelledAt ? { at: cancelledAt, by: '', reason: str(r.cancel_reason), refundPending: false } : undefined,
  };
  // Le paiement est contrôlé par le serveur au moment du prélèvement : l'interface ne le préjuge pas.
  return { order, invoice: undefined, paymentCleared: true, paymentState: 'waived', paymentWaived: true, serverSide: true };
}

const valueBody = (v: LabResultValue): Row => ({
  code: v.code,
  value: v.value,
  unit: v.unit,
  reference_range: v.referenceRange,
  flag: v.flag,
  comment: v.comment,
});

const one = (res: { data: unknown }): LabOrderView => labOrderFrom(res.data as Row);
const act = async (orderId: string, action: string, body: Row = {}): Promise<LabOrderView> => {
  await ensureReference();
  return one(await healthClient.post(`/lab-orders/${orderId}/actions/${action}`, body));
};

export const apiLab = {
  list: async (): Promise<LabOrderView[]> => {
    await ensureReference();
    const res = await healthClient.get<Row[]>('/lab-orders', { params: { per_page: 100 } });
    return (Array.isArray(res.data) ? res.data : []).map(labOrderFrom);
  },

  /** Examens actifs du catalogue de l'établissement. */
  catalog: async (): Promise<{ id: string; code: string; label: string }[]> => {
    const res = await healthClient.get<Row[]>('/lab-tests', { params: { is_active: 'true' } });
    return (Array.isArray(res.data) ? res.data : []).map((t) => ({ id: str(t.id), code: str(t.code), label: str(t.label) }));
  },

  /** Examen absent du catalogue : créé en silence « à valider » (ou réutilisé s'il existe déjà), sans interrompre le médecin. */
  addTest: async (label: string): Promise<{ id: string; code: string; label: string }> => {
    const res = await healthClient.post<Row>('/lab-tests/quick', { label });
    const t = res.data as Row;
    return { id: str(t.id), code: str(t.code), label: str(t.label) };
  },

  order: async (input: { patientId: string; testItemIds: string[]; priority: LabPriority; clinicalNote: string; consultationId?: string }): Promise<LabOrderView> => {
    await ensureReference();
    return one(await healthClient.post('/lab-orders', {
      patient_id: Number(input.patientId),
      consultation_id: input.consultationId ? Number(input.consultationId) : null,
      priority: input.priority,
      clinical_note: input.clinicalNote.trim() || null,
      test_ids: input.testItemIds.map(Number),
    }));
  },

  collect: (input: { orderId: string; sampleNote: string }) => act(input.orderId, 'collect', { sample_note: input.sampleNote.trim() || null }),
  start: (input: { orderId: string }) => act(input.orderId, 'start'),
  reopenResults: (input: { orderId: string }) => act(input.orderId, 'reopen'),
  validate: (input: { orderId: string }) => act(input.orderId, 'validate'),
  cancel: (input: { orderId: string; reason: string }) => act(input.orderId, 'cancel', { reason: input.reason }),

  enterResults: async (input: { orderId: string; values: LabResultValue[] }): Promise<LabOrderView> => {
    await ensureReference();
    return one(await healthClient.put(`/lab-orders/${input.orderId}/results`, { values: input.values.map(valueBody) }));
  },

  amend: async (input: { orderId: string; values: LabResultValue[]; reason: string }): Promise<LabOrderView> => {
    await ensureReference();
    return one(await healthClient.post(`/lab-orders/${input.orderId}/amendments`, { values: input.values.map(valueBody), reason: input.reason }));
  },

  /** Le contrôle de paiement se règle côté serveur : pas d'exception de paiement depuis l'interface pour le moment. */
  grantPaymentException: (_input: { orderId: string; reason: string }): Promise<LabOrderView> => Promise.reject(new Error('unsupported')),
};
