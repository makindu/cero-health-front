/**
 * E-mails au patient (fonctions pures). Le mode local n'a pas de serveur d'envoi : un message est mis en file (« boîte d'envoi »),
 * puis remis à la messagerie de l'utilisateur (lien mailto). Avec le serveur, la même file sera consommée par l'envoi réel.
 * Règle de confidentialité : un e-mail ne contient JAMAIS de données cliniques (résultats, diagnostic) — il invite à venir les retirer.
 */
export type MailKind = 'appointment' | 'unpaidInvoices' | 'labResult' | 'free';
export type MailStatus = 'queued' | 'handedOff' | 'sent' | 'failed' | 'cancelled';
export const MAIL_KINDS: readonly MailKind[] = ['appointment', 'unpaidInvoices', 'labResult', 'free'];

export interface OutboxMail {
  id: string;
  patientId: string;
  patientName: string;
  to: string;
  kind: MailKind;
  subject: string;
  body: string;
  status: MailStatus;
  createdAt: string;
  createdBy: string;
  /** Rappel programmé : date d'envoi souhaitée (le serveur l'enverra ; en mode local l'utilisateur le voit « à envoyer »). */
  scheduledFor?: string;
  handedOffAt?: string;
  /** Avec le serveur : date d'envoi réel et cause d'un échec (le message reste en file, renvoyable). */
  sentAt?: string;
  errorCode?: string;
  /** Source (rendez-vous, examen…) : évite de mettre deux fois le même rappel en file. */
  sourceRef?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (v: string | undefined | null): v is string => Boolean(v) && EMAIL.test((v as string).trim());

export type MailProblem = 'recipientInvalid' | 'subjectRequired' | 'bodyRequired' | 'alreadyQueued';

export function checkMail(input: { to: string; subject: string; body: string; sourceRef?: string }, existing: readonly OutboxMail[]): MailProblem[] {
  const p: MailProblem[] = [];
  if (!isEmail(input.to)) p.push('recipientInvalid');
  if (input.subject.trim().length === 0 || input.subject.length > 200) p.push('subjectRequired');
  if (input.body.trim().length === 0 || input.body.length > 5000) p.push('bodyRequired');
  if (input.sourceRef && existing.some((m) => m.sourceRef === input.sourceRef && m.status !== 'cancelled')) p.push('alreadyQueued');
  return p;
}

export function buildMail(input: {
  id: string; now: string; by: string; patientId: string; patientName: string; to: string; kind: MailKind; subject: string; body: string;
  scheduledFor?: string; sourceRef?: string;
}): OutboxMail {
  return {
    id: input.id, patientId: input.patientId, patientName: input.patientName, to: input.to.trim(), kind: input.kind,
    subject: input.subject.trim(), body: input.body.trim(), status: 'queued', createdAt: input.now, createdBy: input.by,
    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}), ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
  };
}

/** Date d'envoi d'un rappel : `daysBefore` jours (ou heures si `hours`) avant le rendez-vous. */
export function reminderTime(startsAtIso: string, lead: { days?: number; hours?: number }): string {
  const ms = (lead.days ?? 0) * 86_400_000 + (lead.hours ?? 0) * 3_600_000;
  return new Date(new Date(startsAtIso).getTime() - ms).toISOString();
}

/** Un message programmé est « à envoyer » quand son échéance est passée et qu'il n'est ni remis ni annulé. */
export const isDue = (m: OutboxMail, nowIso: string): boolean => m.status === 'queued' && (m.scheduledFor === undefined || m.scheduledFor <= nowIso);

export function mailtoHref(m: Pick<OutboxMail, 'to' | 'subject' | 'body'>): string {
  return `mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
}
