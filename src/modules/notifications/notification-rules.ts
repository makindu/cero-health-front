/**
 * Notifications du mode local (fonctions pures). Une notification est adressée à UN utilisateur ; elle n'est jamais envoyée hors de l'appareil.
 * Seule notification à ce jour : la pharmacie s'est écartée de l'ordonnance (quantité réduite et/ou produit différent).
 * Le prescripteur reste responsable de son ordonnance : il doit en être informé, avec le motif donné par le pharmacien.
 */
export type NotificationKind = 'rxDeviation';

export interface RxDeviationLine {
  rxLabel: string;
  itemLabel: string;
  quantity: number;
  kinds: ('reduced' | 'substituted')[];
  reason: string;
}

export interface RxDeviationPayload {
  rxId: string;
  rxNumber: string;
  patientName: string;
  dispensationNumber: string;
  by: string;
  lines: RxDeviationLine[];
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  /** Identifiant de l'utilisateur destinataire (prescripteur). Absent pour une ordonnance ancienne : on retombe sur le nom. */
  recipientId?: string;
  recipientName: string;
  createdAt: string;
  readAt?: string;
  payload: RxDeviationPayload;
}

export interface Recipient { id: string; name: string }

/** Une notification est visible par son destinataire (identifiant, ou nom si l'identifiant est inconnu). */
export const isFor = (n: AppNotification, me: Recipient): boolean => (n.recipientId ? n.recipientId === me.id : n.recipientName === me.name);

export const unreadCount = (list: readonly AppNotification[]): number => list.filter((n) => !n.readAt).length;

export function buildRxDeviationNotification(input: {
  id: string; now: string; prescriberId?: string; prescriberName: string; payload: RxDeviationPayload;
}): AppNotification {
  return { id: input.id, kind: 'rxDeviation', recipientId: input.prescriberId, recipientName: input.prescriberName, createdAt: input.now, payload: input.payload };
}

export function markRead(n: AppNotification, now: string): AppNotification {
  return n.readAt ? n : { ...n, readAt: now };
}
