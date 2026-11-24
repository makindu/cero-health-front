import { assertPermission } from '@/core/local/session';
import { defineCollection, runUnit } from '@/core/local/unit-of-work';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { BusinessRuleError } from '../_shared/business-error';
import { referenceFromApi } from '../_shared/reference-data';
import { apiMail } from './mail-api';
import { buildMail, checkMail, type MailKind, type OutboxMail } from './mail-rules';

export const mailRef = defineCollection<OutboxMail>('health-patient-mail');

export interface QueueMailInput {
  patientId: string; patientName: string; to: string; kind: MailKind; subject: string; body: string; scheduledFor?: string; sourceRef?: string;
}

/** Boîte d'envoi des e-mails aux patients : atomique, permission vérifiée dans le service. */
export const patientMail = {
  list: (patientId: string): Promise<OutboxMail[]> => referenceFromApi() ? apiMail.list(patientId) : runUnit(async (u) => {
    assertPermission(P.patients.view);
    return (await u.list(mailRef)).filter((m) => m.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }),

  queue: (input: QueueMailInput): Promise<OutboxMail> => referenceFromApi()
    ? apiMail.queue(input.patientId, { kind: input.kind, subject: input.subject, body: input.body, ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}), ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}) })
    : runUnit(async (u) => {
    assertPermission(P.patients.update);
    const problems = checkMail(input, await u.list(mailRef));
    if (problems.length > 0) throw new BusinessRuleError(`mail.${problems[0]}`, {}, problems[0] === 'alreadyQueued' ? 'conflict' : 'validation');
    const mail = buildMail({ ...input, id: `mail-${globalThis.crypto.randomUUID().slice(0, 12)}`, now: u.now.toISOString(), by: u.ctx.actor.name });
    await u.insert(mailRef, mail, { action: 'mail:queue' });
    return mail;
  }),

  /** Remis à la messagerie de l'utilisateur (lien mailto) : seul état « envoyé » que le mode local peut garantir. */
  markHandedOff: (input: { id: string }): Promise<void> => runUnit(async (u) => {
    assertPermission(P.patients.update);
    await u.update(mailRef, input.id, (m) => (m.status === 'queued' ? { ...m, status: 'handedOff' as const, handedOffAt: u.now.toISOString() } : m), { action: 'mail:handoff' });
  }),

  /** Envoi réel par le serveur (API uniquement). */
  send: (input: { id: string }): Promise<OutboxMail> => apiMail.send(input.id),

  cancel: (input: { id: string }): Promise<void> => referenceFromApi() ? apiMail.cancel(input.id).then(() => undefined) : runUnit(async (u) => {
    assertPermission(P.patients.update);
    await u.update(mailRef, input.id, (m) => (m.status === 'queued' ? { ...m, status: 'cancelled' as const } : m), { action: 'mail:cancel' });
  }),
};
