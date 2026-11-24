import { healthClient } from '@/core/api';
import { MAIL_KINDS, type MailKind, type MailStatus, type OutboxMail } from './mail-rules';

type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const STATUSES: readonly MailStatus[] = ['queued', 'handedOff', 'sent', 'failed', 'cancelled'];

/** Courrier du serveur → ligne de la boîte d'envoi. Le destinataire est l'adresse de la fiche patient, jamais une saisie. */
export function mailFrom(r: Row): OutboxMail {
  const kind = text(r.kind) as MailKind;
  const status = text(r.status) as MailStatus;
  return {
    id: text(r.id), patientId: text(r.patient_id), patientName: '', to: text(r.to),
    kind: MAIL_KINDS.includes(kind) ? kind : 'free', subject: text(r.subject), body: text(r.body),
    status: STATUSES.includes(status) ? status : 'queued', createdAt: text(r.created_at), createdBy: text(r.created_by),
    ...(r.scheduled_for ? { scheduledFor: text(r.scheduled_for) } : {}), ...(r.source_ref ? { sourceRef: text(r.source_ref) } : {}),
    ...(r.sent_at ? { sentAt: text(r.sent_at) } : {}), ...(r.error_code ? { errorCode: text(r.error_code) } : {}),
  };
}

export interface ApiQueueInput { kind: MailKind; subject: string; body: string; scheduledFor?: string; sourceRef?: string }

export const apiMail = {
  list: async (patientId: string): Promise<OutboxMail[]> => {
    const res = await healthClient.get<Row[]>(`/patients/${patientId}/mails`);
    return (Array.isArray(res.data) ? res.data : []).map(mailFrom);
  },
  queue: async (patientId: string, i: ApiQueueInput): Promise<OutboxMail> => {
    const body: Row = { kind: i.kind, subject: i.subject, body: i.body };
    if (i.scheduledFor) body.scheduled_for = i.scheduledFor;
    if (i.sourceRef) body.source_ref = i.sourceRef;
    return mailFrom((await healthClient.post<Row>(`/patients/${patientId}/mails`, body)).data as Row);
  },
  /** Envoi réel par le serveur ; un échec d'acheminement revient avec le statut « failed » (le message reste renvoyable). */
  send: async (id: string): Promise<OutboxMail> => mailFrom((await healthClient.post<Row>(`/patient-mails/${id}/send`, {})).data as Row),
  cancel: async (id: string): Promise<OutboxMail> => mailFrom((await healthClient.post<Row>(`/patient-mails/${id}/cancel`, {})).data as Row),
};
