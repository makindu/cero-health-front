import { healthClient } from '@/core/api';
import { ensureReference, findStaff, staffById, staffByUserId } from '../_shared/reference-data';
import type { Admission, AdmissionStatus, DischargeOutcome, Bed, BedStatus, Room, RoomKind, Stay, WardKey } from './hospital-rules';
import type { BedView } from './hospital-service';

/**
 * Hospitalisation branchée sur l'API HEALTH. Le serveur garantit qu'un lit n'a qu'un patient et qu'un patient
 * n'a qu'une admission active ; l'écran ne fait qu'afficher et envoyer les demandes.
 * Le « service » d'une chambre est l'unité de soin du serveur (identifiant) ; son nom s'affiche via `wardLabel`.
 */
type Row = Record<string, unknown>;
const CONSUMABLE_NATURES = ['medication', 'consumable', 'medical_device', 'procedure'];

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const author = (userId: unknown): string => (userId === null || userId === undefined ? '' : staffByUserId(str(userId))?.name ?? `#${str(userId)}`);
const BED_STATUSES: readonly BedStatus[] = ['free', 'occupied', 'cleaning', 'maintenance'];
const ADM_STATUSES: readonly AdmissionStatus[] = ['admitted', 'dischargePending', 'discharged', 'cancelled'];

const OUTCOME_FROM: Record<string, DischargeOutcome> = { home: 'normal', transferred_out: 'referral', against_advice: 'againstAdvice', deceased: 'deceased', other: 'normal' };
const OUTCOME_TO: Record<DischargeOutcome, string> = { normal: 'home', referral: 'transferred_out', againstAdvice: 'against_advice', deceased: 'deceased' };

const wardOf = (careUnitId: unknown): WardKey => str(careUnitId) as WardKey;

function stayFrom(r: Row): Stay {
  return { bedId: str(r.bed_id), roomId: str(r.room_id), from: str(r.started_at), to: r.ended_at ? str(r.ended_at) : undefined, by: '', reason: r.transfer_reason ? str(r.transfer_reason) : undefined };
}

export function admissionFrom(r: Row): Admission {
  const patient = (r.patient ?? {}) as Row;
  const status: AdmissionStatus = r.status === 'closed' ? 'discharged' : ADM_STATUSES.includes(r.status as AdmissionStatus) ? (r.status as AdmissionStatus) : 'admitted';
  const discharge = (r.discharge ?? null) as Row | null;
  const closure = (r.closure ?? null) as Row | null;
  const requested = r.discharge_requested_at ? { at: str(r.discharge_requested_at), by: author(r.discharge_requested_by_user_id), note: str(r.discharge_request_note) } : undefined;
  return {
    id: str(r.id),
    number: str(r.number),
    patientId: str(r.patient_id),
    patientName: str(patient.full_name) || `Patient n°${str(r.patient_id)}`,
    consultationId: r.consultation_id ? str(r.consultation_id) : undefined,
    ward: wardOf(r.care_unit_id),
    wardName: r.care_unit_name ? str(r.care_unit_name) : undefined,
    status,
    admittedAt: str(r.admitted_at),
    admittedBy: r.admitted_by_name ? str(r.admitted_by_name) : author(r.admitted_by_user_id),
    attending: r.attending_staff_name ? str(r.attending_staff_name) : r.attending_staff_id ? staffById(str(r.attending_staff_id))?.name ?? `#${str(r.attending_staff_id)}` : '',
    reason: str(r.reason),
    expectedDischarge: r.expected_discharge ? str(r.expected_discharge) : undefined,
    stays: rows(r.stays).map(stayFrom),
    dischargeRequest: requested,
    discharge: discharge
      ? { at: str(discharge.discharged_at), by: author(discharge.discharged_by_user_id), outcome: OUTCOME_FROM[str(discharge.outcome)] ?? 'normal', note: str(discharge.note), exception: discharge.exception_reason ? { reason: str(discharge.exception_reason) } : undefined }
      : undefined,
    closure: closure ? { at: str(closure.closed_at), by: author(closure.closed_by_user_id), note: str(closure.note), exception: closure.exception_reason ? { reason: str(closure.exception_reason) } : undefined } : undefined,
    cancellation: r.cancelled_at ? { at: str(r.cancelled_at), by: author(r.cancelled_by_user_id), reason: str(r.cancel_reason) } : undefined,
  };
}

/** Compte du séjour côté serveur : ce qui reste à facturer, les factures du séjour et le solde du patient (montants en unités mineures). */
export interface AccountLink { id: string; kind: 'roomDays' | 'consumptions'; status: string; currency: string; total: number; paid: number; remaining: number; createdAt: string }
export interface AccountApi { admissionId: string; pendingDays: number; pendingLines: number; links: AccountLink[]; balances: { currency: string; outstanding: number }[] }

export function accountFrom(r: Row): AccountApi {
  return {
    admissionId: str(r.admission_id),
    pendingDays: Number(r.pending_days ?? 0),
    pendingLines: Number(r.pending_consumption_lines ?? 0),
    links: rows(r.links).map((l) => ({
      id: str(l.id), kind: l.source_type === 'admission_days' ? 'roomDays' : 'consumptions', status: str(l.status), currency: str(l.currency),
      total: Number(l.total_minor ?? 0), paid: Number(l.paid_minor ?? 0), remaining: Number(l.remaining_minor ?? 0), createdAt: str(l.created_at),
    })),
    balances: rows(r.balances).map((b) => ({ currency: str(b.currency), outstanding: Number(b.outstanding_minor ?? 0) })),
  };
}

/** Demande d'hospitalisation : le médecin a choisi l'orientation, le service des admissions choisit le lit. */
export interface AdmissionRequestRow { consultationId: string; patientId: string; patientName: string; practitioner: string; target: string; at: string }

/** Visites (tour de salle) et consommations d'un séjour, tels que le serveur les tient. */
export interface ApiVisit {
  id: string; type: 'round' | 'care'; at: string; by: string;
  clinical?: { complaints?: { none: boolean; text: unknown }; examination?: { evolution: string; text: unknown }; diagnosis?: string; plan?: { treatment?: string; labs: boolean; discharge: boolean; note: unknown } };
}
export type ApiRowStatus = 'pending' | 'billed' | 'reversed' | 'reversal';
export interface ApiLedgerRow { id: string; visitId: string; kind: 'consumption' | 'reversal'; itemId: string; name: string; quantity: number; net: number; reason: string; at: string; by: string; status: ApiRowStatus; invoiceId?: string }
export interface ApiVisitsView { visits: ApiVisit[]; rows: ApiLedgerRow[]; pending: number }
export interface ConsumableHit { id: string; name: string; nature: string }

/** Demande d'hospitalisation adressée par les admissions, à valider par un médecin du service d'accueil. */
export interface HospRequestRow {
  id: string; patientId: string; patientName: string; careUnitId: string; reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'admitted';
  requestedAt: string; decidedBy: string; decidedAt?: string; decisionNote: string; admissionId?: string;
  /** Vrai si l'utilisateur est un médecin actif du service d'accueil et que la demande attend une décision. */
  canDecide: boolean;
}

const REQ_STATUSES: readonly HospRequestRow['status'][] = ['pending', 'approved', 'rejected', 'cancelled', 'admitted'];
export function hospRequestFrom(r: Row): HospRequestRow {
  const patient = (r.patient ?? {}) as Row;
  return {
    id: str(r.id), patientId: str(r.patient_id), patientName: str(patient.full_name) || `Patient n°${str(r.patient_id)}`,
    careUnitId: str(r.care_unit_id), reason: str(r.reason),
    status: REQ_STATUSES.includes(r.status as HospRequestRow['status']) ? (r.status as HospRequestRow['status']) : 'pending',
    requestedAt: str(r.requested_at), decidedBy: r.decided_by_staff_id ? staffById(str(r.decided_by_staff_id))?.name ?? `#${str(r.decided_by_staff_id)}` : '',
    decidedAt: r.decided_at ? str(r.decided_at) : undefined, decisionNote: str(r.decision_note),
    admissionId: r.admission_id ? str(r.admission_id) : undefined, canDecide: r.can_decide === true,
  };
}

export interface ConfigBed { id: string; label: string; status: string; active: boolean }
export interface ConfigRoom { id: string; careUnitId: string; code: string; kind: RoomKind; active: boolean; beds: ConfigBed[] }

const oneAdmission = (res: { data: unknown }): Admission => admissionFrom(res.data as Row);

async function board(): Promise<{ beds: BedView[]; admissions: Admission[]; day: string }> {
  await ensureReference();
  const [roomsRes, activeRes, recentRes] = await Promise.all([
    healthClient.get<Row[]>('/bed-board'),
    healthClient.get<Row[]>('/admissions', { params: { active: 1, per_page: 100 } }),
    healthClient.get<Row[]>('/admissions', { params: { per_page: 100 } }),
  ]);
  const byId = new Map<string, Admission>();
  for (const r of [...rows(recentRes.data), ...rows(activeRes.data)]) byId.set(str(r.id), admissionFrom(r));
  const views: BedView[] = [];
  for (const rr of rows(roomsRes.data)) {
    const room: Room = { id: str(rr.id), ward: wardOf(rr.care_unit_id), code: str(rr.code), kind: (rr.kind === 'private' ? 'private' : 'standard') as RoomKind, dailyItemId: '' };
    for (const br of rows(rr.beds)) {
      const status = BED_STATUSES.includes(br.status as BedStatus) ? (br.status as BedStatus) : 'free';
      const cur = (br.current ?? null) as Row | null;
      const bed: Bed = { id: str(br.id), roomId: room.id, label: str(br.label), status, admissionId: cur ? str(cur.admission_id) : undefined, maintenanceReason: br.maintenance_reason ? str(br.maintenance_reason) : undefined };
      let admission = cur ? byId.get(str(cur.admission_id)) : undefined;
      if (cur && !admission) {
        // Admission hors des 100 plus récentes : on reconstitue l'essentiel depuis le plan des lits.
        admission = {
          id: str(cur.admission_id), number: str(cur.admission_number), patientId: str(cur.patient_id), patientName: str(cur.patient_name) || `Patient n°${str(cur.patient_id)}`,
          ward: room.ward, status: cur.admission_status === 'dischargePending' ? 'dischargePending' : 'admitted', admittedAt: str(cur.since), admittedBy: '', attending: '', reason: '',
          stays: [{ bedId: bed.id, roomId: room.id, from: str(cur.since), by: '' }],
        };
        byId.set(admission.id, admission);
      }
      views.push({ bed, room, admission });
    }
  }
  views.sort((a, b) => a.bed.label.localeCompare(b.bed.label));
  const admissions = [...byId.values()].sort((a, b) => b.admittedAt.localeCompare(a.admittedAt));
  return { beds: views, admissions, day: new Date().toISOString().slice(0, 10) };
}

const act = async (admissionId: string, action: string, body: Row = {}): Promise<Admission> => {
  await ensureReference();
  return oneAdmission(await healthClient.post(`/admissions/${admissionId}/actions/${action}`, body));
};

export const apiHospital = {
  board,

  admit: async (input: { patientId: string; bedId: string; reason: string; attending?: string; expectedDischarge?: string; consultationId?: string; requestId?: string }): Promise<Admission> => {
    await ensureReference();
    // Une admission part toujours d'une décision médicale : demande du médecin en consultation, ou demande validée par un médecin du service.
    // Le médecin référent est déterminé par le serveur (celui qui a demandé ou validé) ; il n'est plus choisi ici.
    const body: Row = { patient_id: Number(input.patientId), bed_id: Number(input.bedId), reason: input.reason.trim() };
    const staff = input.attending ? findStaff(input.attending) : undefined;
    if (staff) body.attending_staff_id = Number(staff.id);
    if (input.expectedDischarge) body.expected_discharge = input.expectedDischarge;
    const consultation = Number(input.consultationId);
    const request = Number(input.requestId);
    if (Number.isInteger(consultation) && consultation > 0) body.consultation_id = consultation;
    if (Number.isInteger(request) && request > 0) body.hospitalization_request_id = request;
    return oneAdmission(await healthClient.post('/admissions', body));
  },

  /** Produits et prestations consommables d'un séjour (médicaments, consommables, dispositifs, actes) : recherche côté serveur, 15 résultats au plus. */
  searchConsumables: async (q: string): Promise<ConsumableHit[]> => {
    await ensureReference();
    const res = await healthClient.get<Row[]>('/catalog-items', { params: { q, per_page: 15, is_active: true } });
    return rows(res.data).filter((r) => CONSUMABLE_NATURES.includes(str(r.nature))).map((r) => ({ id: str(r.id), name: str(r.generic_name), nature: str(r.nature) }));
  },
  visitsLedger: async (admissionId: string): Promise<ApiVisitsView> => {
    await ensureReference();
    const [v, l] = await Promise.all([
      healthClient.get<Row[]>(`/admissions/${admissionId}/visits`, { params: { per_page: 100 } }),
      healthClient.get<Row[]>(`/admissions/${admissionId}/consumptions`),
    ]);
    const entries = rows(l.data);
    // Les prestations (actes) n'ont pas toujours de nom de stock : on les relit dans le catalogue, en une requête.
    const unnamed = [...new Set(entries.filter((e) => !e.name).map((e) => str(e.catalog_item_id)))];
    const names = new Map<string, string>();
    if (unnamed.length > 0) {
      const cat = await healthClient.get<Row[]>('/catalog-items', { params: { ids: unnamed.join(','), per_page: 100 } });
      for (const c of rows(cat.data)) names.set(str(c.id), str(c.generic_name));
    }
    const out: ApiLedgerRow[] = entries.map((e) => ({
      id: str(e.id), visitId: str(e.visit_id), kind: e.entry_type === 'reversal' ? 'reversal' : 'consumption', itemId: str(e.catalog_item_id),
      name: str(e.name) || names.get(str(e.catalog_item_id)) || `#${str(e.catalog_item_id)}`, quantity: Number(e.quantity ?? 0), net: Number(e.net_quantity ?? 0),
      reason: str(e.reason), at: str(e.created_at), by: e.recorded_by_name ? str(e.recorded_by_name) : author(e.recorded_by_user_id),
      status: (['pending', 'billed', 'reversed', 'reversal'].includes(str(e.status)) ? str(e.status) : 'pending') as ApiRowStatus,
      invoiceId: e.billing_link_id ? str(e.billing_link_id) : undefined,
    }));
    const visits: ApiVisit[] = rows(v.data).map((r) => ({
      id: str(r.id), type: r.visit_type === 'care' ? 'care' : 'round', at: str(r.visited_at), by: r.recorded_by_name ? str(r.recorded_by_name) : author(r.recorded_by_user_id),
      clinical: (r.clinical ?? undefined) as ApiVisit['clinical'],
    }));
    return { visits, rows: out, pending: out.filter((x) => x.kind === 'consumption' && x.status === 'pending').length };
  },
  /** Enregistre une visite et ses consommations. Le prix n'est jamais envoyé : il vient du catalogue. */
  recordVisit: async (input: { admissionId: string; type: 'round' | 'care'; lines: { catalogItemId: string; quantity: number }[]; clinical?: Row }): Promise<ApiVisit> => {
    await ensureReference();
    const body: Row = { visit_type: input.type };
    if (input.lines.length > 0) body.lines = input.lines.map((l) => ({ catalog_item_id: Number(l.catalogItemId), quantity: l.quantity }));
    if (input.clinical && Object.keys(input.clinical).length > 0) body.clinical = input.clinical;
    const res = await healthClient.post(`/admissions/${input.admissionId}/visits`, body);
    const r = res.data as Row;
    return { id: str(r.id), type: r.visit_type === 'care' ? 'care' : 'round', at: str(r.visited_at), by: r.recorded_by_name ? str(r.recorded_by_name) : author(r.recorded_by_user_id) };
  },
  /** Contre-écriture motivée : la ligne d'origine reste visible. */
  reverseConsumption: async (input: { admissionId: string; consumptionId: string; reason: string; quantity?: number }): Promise<void> => {
    await ensureReference();
    const body: Row = { reason: input.reason.trim() };
    if (input.quantity && input.quantity > 0) body.quantity = input.quantity;
    await healthClient.post(`/admissions/${input.admissionId}/consumptions/${input.consumptionId}/reverse`, body);
  },

  /** Demandes d'hospitalisation ouvertes (en attente de décision ou validées, pas encore suivies d'une admission). */
  hospRequests: async (): Promise<HospRequestRow[]> => {
    await ensureReference();
    const res = await healthClient.get<Row[]>('/hospitalization-requests');
    return rows(res.data).map(hospRequestFrom);
  },
  createRequest: async (input: { patientId: string; careUnitId: string; reason: string }): Promise<HospRequestRow> => {
    await ensureReference();
    const res = await healthClient.post('/hospitalization-requests', { patient_id: Number(input.patientId), care_unit_id: Number(input.careUnitId), reason: input.reason.trim() });
    return hospRequestFrom(res.data as Row);
  },
  /** Un médecin du service d'accueil valide ou refuse, avec un motif. */
  decideRequest: async (input: { id: string; approve: boolean; note: string }): Promise<HospRequestRow> => {
    await ensureReference();
    const res = await healthClient.post(`/hospitalization-requests/${input.id}/actions/${input.approve ? 'approve' : 'reject'}`, { note: input.note.trim() });
    return hospRequestFrom(res.data as Row);
  },
  cancelRequest: async (input: { id: string; note: string }): Promise<HospRequestRow> => {
    await ensureReference();
    const res = await healthClient.post(`/hospitalization-requests/${input.id}/actions/cancel`, { note: input.note.trim() });
    return hospRequestFrom(res.data as Row);
  },

  transfer: (input: { admissionId: string; bedId: string; reason: string }): Promise<Admission> => act(input.admissionId, 'transfer', { bed_id: Number(input.bedId), reason: input.reason }),
  cancel: (input: { admissionId: string; reason: string }): Promise<Admission> => act(input.admissionId, 'cancel', { reason: input.reason }),
  requestDischarge: (input: { admissionId: string; note: string }): Promise<Admission> => act(input.admissionId, 'request-discharge', { note: input.note }),
  /** Sortie médicale validée : le lit passe en nettoyage. La clôture financière se fait à part. */
  discharge: (input: { admissionId: string; outcome: DischargeOutcome; note: string }): Promise<Admission> => act(input.admissionId, 'discharge', { outcome: OUTCOME_TO[input.outcome], note: input.note }),
  revokeDischarge: (input: { admissionId: string }): Promise<Admission> => act(input.admissionId, 'revoke-discharge'),

  /** Compte du séjour (clôture financière). */
  account: async (admissionId: string): Promise<AccountApi> => {
    const res = await healthClient.get<Row>(`/admissions/${admissionId}/account`);
    return accountFrom((res.data ?? {}) as Row);
  },
  /** Une facture pour tous les jours de chambre non encore facturés ; le prix vient du serveur. */
  billRoomDays: async (input: { admissionId: string }): Promise<void> => {
    await healthClient.post(`/admissions/${input.admissionId}/actions/bill-room-days`, {});
  },
  /** Une facture pour les consommations en attente ; la réduction (avec motif) exige le droit correspondant côté serveur. */
  billConsumptions: async (input: { admissionId: string }): Promise<void> => {
    await healthClient.post(`/admissions/${input.admissionId}/actions/bill-consumptions`, {});
  },
  /** Clôture administrative après la sortie médicale ; une dérogation financière exige un motif et un droit particulier. */
  close: (input: { admissionId: string; note: string; exceptionReason?: string }): Promise<Admission> => {
    const body: Row = {};
    if (input.note.trim() !== '') body.note = input.note.trim();
    if (input.exceptionReason && input.exceptionReason.trim() !== '') body.exception_reason = input.exceptionReason.trim();
    return act(input.admissionId, 'close', body);
  },

  /** Crée une chambre puis ses lits (« 101-1 », « 101-2 »…). Si un lit échoue, la chambre reste et on peut compléter. */
  setupRoom: async (input: { careUnitId: string; code: string; kind: RoomKind; beds: number }): Promise<{ roomId: string; beds: number }> => {
    const room = (await healthClient.post('/rooms', { care_unit_id: Number(input.careUnitId), code: input.code.trim(), kind: input.kind })).data as Row;
    const roomId = str(room.id);
    const code = str(room.code) || input.code.trim();
    for (let i = 1; i <= input.beds; i += 1) await healthClient.post('/beds', { room_id: Number(roomId), label: `${code}-${i}` });
    return { roomId, beds: input.beds };
  },

  requests: async (): Promise<AdmissionRequestRow[]> => {
    await ensureReference();
    const res = await healthClient.get<Row[]>('/admission-requests');
    return rows(res.data).map((r) => ({
      consultationId: str(r.consultation_id), patientId: str(r.patient_id),
      patientName: str(((r.patient ?? {}) as Row).full_name) || `Patient n°${str(r.patient_id)}`,
      practitioner: r.practitioner_staff_id ? staffById(str(r.practitioner_staff_id))?.name ?? '' : '',
      target: str(r.orientation_target), at: str(r.requested_at),
    }));
  },

  /** Toutes les chambres (actives ou non) avec leurs lits, pour l'écran de configuration. */
  rooms: async (): Promise<ConfigRoom[]> => {
    await ensureReference();
    const res = await healthClient.get<Row[]>('/rooms', { params: { per_page: 200 } });
    return rows(res.data).map((r) => ({
      id: str(r.id), careUnitId: str(r.care_unit_id), code: str(r.code), kind: (r.kind === 'private' ? 'private' : 'standard') as RoomKind, active: r.is_active !== false,
      beds: rows(r.beds).map((b) => ({ id: str(b.id), label: str(b.label), status: str(b.status), active: b.is_active !== false })),
    }));
  },
  updateRoom: async (input: { roomId: string; code: string; kind: RoomKind }): Promise<void> => {
    await healthClient.patch(`/rooms/${input.roomId}`, { code: input.code.trim(), kind: input.kind });
  },
  deleteRoom: async (input: { roomId: string }): Promise<void> => {
    await healthClient.delete(`/rooms/${input.roomId}`);
  },
  renameBed: async (input: { bedId: string; label: string }): Promise<void> => {
    await healthClient.patch(`/beds/${input.bedId}`, { label: input.label.trim() });
  },
  deleteBed: async (input: { bedId: string }): Promise<void> => {
    await healthClient.delete(`/beds/${input.bedId}`);
  },
  setRoomActive: async (input: { roomId: string; active: boolean }): Promise<void> => {
    await healthClient.patch(`/rooms/${input.roomId}`, { is_active: input.active });
  },
  addBed: async (input: { roomId: string; label: string }): Promise<void> => {
    await healthClient.post('/beds', { room_id: Number(input.roomId), label: input.label.trim() });
  },
  setBedActive: async (input: { bedId: string; active: boolean }): Promise<void> => {
    await healthClient.patch(`/beds/${input.bedId}`, { is_active: input.active });
  },

  setBedState: async (input: { bedId: string; to: 'free' | 'maintenance'; reason: string; from?: BedStatus }): Promise<Bed> => {
    const action = input.to === 'maintenance' ? 'maintenance' : input.from === 'maintenance' ? 'restore' : 'clean-done';
    const res = await healthClient.post(`/beds/${input.bedId}/actions/${action}`, input.to === 'maintenance' ? { reason: input.reason } : {});
    const r = res.data as Row;
    return { id: str(r.id), roomId: str(r.room_id), label: str(r.label), status: BED_STATUSES.includes(r.status as BedStatus) ? (r.status as BedStatus) : 'free', maintenanceReason: r.maintenance_reason ? str(r.maintenance_reason) : undefined };
  },
};
