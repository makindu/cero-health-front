/**
 * Suivi des patients (fonctions pures) : la POSITION d'un patient est DÉDUITE des opérations déjà enregistrées
 * (arrivée à l'accueil, triage, consultation, laboratoire, pharmacie, caisse, hospitalisation). Personne ne la saisit.
 * La position actuelle est le dernier événement daté ; l'historique est la suite de tous les événements.
 * Limite : on sait où en est le DOSSIER du patient dans le circuit, pas où il se trouve physiquement.
 */
export type Place = 'reception' | 'triage' | 'consultation' | 'laboratory' | 'pharmacy' | 'cashier' | 'ward';
export const PLACES: readonly Place[] = ['reception', 'triage', 'consultation', 'laboratory', 'pharmacy', 'cashier', 'ward'];

export interface FlowEvent {
  patientId: string;
  patientName: string;
  at: string;
  place: Place;
  /** Clé de traduction de l'étape (ex. « arrived », « collected »). */
  step: string;
  /** Référence lisible (numéro de facture, de demande, de dispensation…). */
  ref?: string;
  /** Précision libre déjà présente dans la donnée (service, etc.). Jamais d'information clinique. */
  detail?: string;
}

// --- Formes minimales lues (indépendantes des modules : seules les propriétés utiles) ---
export interface SrcAppointment { patientId: string; patientName: string; arrivedAt?: string; status: string; service?: string }
export interface SrcTriage { patientId: string; patientName: string; arrivedAt: string; status: string }
export interface SrcConsultation { id: string; patientId: string; patientName: string; date: string; status: string; service?: string }
export interface SrcRx { number: string; patientId: string; patientName: string; prescribedAt: string; validation?: { at: string }; cancellation?: { at: string } }
export interface SrcLab {
  number: string; patientId: string; patientName: string; requestedAt: string;
  collected?: { at: string }; started?: { at: string }; resultsEnteredBy?: { at: string }; validation?: { at: string }; cancellation?: { at: string };
}
export interface SrcDispensation { number: string; patientId: string; patientName: string; preparedAt: string; dispensed?: { at: string }; cancellation?: { at: string } }
export interface SrcInvoice { number: string; patientId: string; patientName: string; createdAt: string; cancellation?: { at: string } }
export interface SrcPayment { kind: string; at: string; patientId: string; invoiceId: string }
export interface SrcAdmission { number: string; patientId: string; patientName: string; ward: string; status: string; admittedAt: string; stays: { from: string }[]; discharge?: { at: string }; cancellation?: { at: string } }

export interface FlowSources {
  appointments: readonly SrcAppointment[];
  triage: readonly SrcTriage[];
  consultations: readonly SrcConsultation[];
  rx: readonly SrcRx[];
  lab: readonly SrcLab[];
  dispensations: readonly SrcDispensation[];
  invoices: readonly (SrcInvoice & { id: string })[];
  payments: readonly SrcPayment[];
  admissions: readonly SrcAdmission[];
  /** Nom du patient par identifiant (pour les paiements, qui ne portent pas le nom). */
  names?: ReadonlyMap<string, string>;
}

const valid = (at: string | undefined): at is string => typeof at === 'string' && !Number.isNaN(Date.parse(at));

/** Tous les événements datés, du plus récent au plus ancien (à instant égal, l'étape la plus avancée du circuit passe en premier). */
export function buildEvents(src: FlowSources): FlowEvent[] {
  const out: FlowEvent[] = [];
  const add = (e: Omit<FlowEvent, 'at'> & { at: string | undefined }): void => { if (valid(e.at)) out.push(e as FlowEvent); };

  for (const a of src.appointments) add({ patientId: a.patientId, patientName: a.patientName, at: a.arrivedAt, place: 'reception', step: 'arrived', detail: a.service });
  for (const t of src.triage) add({ patientId: t.patientId, patientName: t.patientName, at: t.arrivedAt, place: 'triage', step: t.status });
  for (const c of src.consultations) add({ patientId: c.patientId, patientName: c.patientName, at: c.date, place: 'consultation', step: c.status, detail: c.service });
  for (const r of src.rx) {
    add({ patientId: r.patientId, patientName: r.patientName, at: r.prescribedAt, place: 'consultation', step: 'prescribed', ref: r.number });
    add({ patientId: r.patientId, patientName: r.patientName, at: r.validation?.at, place: 'pharmacy', step: 'rxValidated', ref: r.number });
  }
  for (const l of src.lab) {
    const base = { patientId: l.patientId, patientName: l.patientName, place: 'laboratory' as const, ref: l.number };
    add({ ...base, at: l.requestedAt, step: 'requested' });
    add({ ...base, at: l.collected?.at, step: 'collected' });
    add({ ...base, at: l.started?.at, step: 'inProgress' });
    add({ ...base, at: l.resultsEnteredBy?.at, step: 'resultEntered' });
    add({ ...base, at: l.validation?.at, step: 'validated' });
    add({ ...base, at: l.cancellation?.at, step: 'cancelled' });
  }
  for (const d of src.dispensations) {
    const base = { patientId: d.patientId, patientName: d.patientName, place: 'pharmacy' as const, ref: d.number };
    add({ ...base, at: d.preparedAt, step: 'prepared' });
    add({ ...base, at: d.dispensed?.at, step: 'dispensed' });
  }
  const invoiceNumber = new Map(src.invoices.map((i) => [i.id, i.number]));
  for (const i of src.invoices) add({ patientId: i.patientId, patientName: i.patientName, at: i.createdAt, place: 'cashier', step: 'invoiced', ref: i.number });
  for (const p of src.payments.filter((x) => x.kind === 'payment')) {
    add({ patientId: p.patientId, patientName: src.names?.get(p.patientId) ?? p.patientId, at: p.at, place: 'cashier', step: 'paid', ref: invoiceNumber.get(p.invoiceId) });
  }
  for (const a of src.admissions) {
    const base = { patientId: a.patientId, patientName: a.patientName, place: 'ward' as const, ref: a.number, detail: a.ward };
    add({ ...base, at: a.admittedAt, step: 'admitted' });
    for (const s of a.stays.slice(1)) add({ ...base, at: s.from, step: 'transferred' });
    add({ ...base, at: a.discharge?.at, step: 'discharged' });
  }
  // Tri : plus récent d'abord. À instant égal, on garde l'ordre d'insertion inverse (étapes postérieures ajoutées après).
  return out.map((e, i) => ({ e, i })).sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i).map((x) => x.e);
}

/** Jour civil local (AAAA-MM-JJ) d'un instant ISO. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface FlowRow {
  patientId: string;
  patientName: string;
  /** Dernière position connue (événement le plus récent). */
  last: FlowEvent;
  /** Nombre d'étapes enregistrées aujourd'hui. */
  todayCount: number;
  /** Service d'hospitalisation si le patient est actuellement hospitalisé. */
  inpatientWard?: string;
}

/**
 * Tableau du jour : patients ayant au moins un événement aujourd'hui, ou actuellement hospitalisés.
 * Trié par dernière activité (la plus récente d'abord).
 */
export function buildBoard(events: readonly FlowEvent[], admissions: readonly Pick<SrcAdmission, 'patientId' | 'status' | 'ward'>[], now: Date): FlowRow[] {
  const today = dayKey(now.toISOString());
  const inpatient = new Map<string, string>();
  for (const a of admissions) if (a.status === 'admitted' || a.status === 'dischargePending') inpatient.set(a.patientId, a.ward);
  const byPatient = new Map<string, FlowEvent[]>();
  for (const e of events) {
    if (Date.parse(e.at) > now.getTime() + 60_000) continue; // événement futur : ignoré
    byPatient.set(e.patientId, [...(byPatient.get(e.patientId) ?? []), e]);
  }
  const rows: FlowRow[] = [];
  for (const [patientId, list] of byPatient) {
    const todays = list.filter((e) => dayKey(e.at) === today);
    const ward = inpatient.get(patientId);
    if (todays.length === 0 && !ward) continue;
    const last = list[0]!; // list est déjà trié du plus récent au plus ancien
    rows.push({ patientId, patientName: last.patientName, last, todayCount: todays.length, ...(ward ? { inpatientWard: ward } : {}) });
  }
  return rows.sort((a, b) => b.last.at.localeCompare(a.last.at));
}

/** Historique d'un patient (du plus récent au plus ancien). */
export const historyOf = (events: readonly FlowEvent[], patientId: string, now: Date): FlowEvent[] =>
  events.filter((e) => e.patientId === patientId && Date.parse(e.at) <= now.getTime() + 60_000);

/** Durée écoulée en minutes (jamais négative). */
export const minutesSince = (iso: string, now: Date): number => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
