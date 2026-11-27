import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoAt } from '@/utils/dates';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { ApiError } from '@/core/api';
import { createResourceService, localRepositoryFor, type ApiMapping, type LocalWriteContext, type ResourceService } from '../_shared/resource-service';
import { ensureReference, findStaff, findUnit, staffById, unitById } from '../_shared/reference-data';
import { CONSULTATION_DURATION_KEY, DEFAULT_CONSULTATION_DAYS, readSetting } from '../settings/app-settings';
import { staffRepo } from '../administration/data';
import { finance } from '../finance/finance';
import { patientRepo } from '../patients/data';
import { resolvePatient } from '../patients/local-rules';
import { applyConsultationCommand, buildConsultation, COMMAND_TARGET } from './local-rules';
import { SERVICE_KEYS, demoPerson, pick, staffFor, type ServiceKey } from '../_shared/demo-people';

import type { ClinicalStatus } from './clinical/model';

export type ConsultationStatus = ClinicalStatus;
export type ConsultationReason = 'firstVisit' | 'followUp' | 'control' | 'vaccination' | 'prenatal';

export interface Consultation {
  id: string;
  patientId: string;
  patientName: string;
  practitioner: string;
  service: ServiceKey;
  date: string;
  reason: ConsultationReason;
  status: ConsultationStatus;
  /** Rendez-vous d'origine, ou origine « sans rendez-vous » (renseignés par l'API). */
  appointmentId?: string;
  origin?: 'appointment' | 'walkIn';
  /** Fiche de triage liée : source des constantes déjà prises. */
  triageEntryId?: string;
  /** Médecin de l'annuaire du personnel (mode local) ou profil de personnel (API). */
  practitionerId?: string;
  /** API réelle : l'utilisateur peut-il modifier cette consultation ? Seul son praticien le peut ; absent = non précisé. */
  canWrite?: boolean;
  /** Durée prévue en jours, figée à l'ouverture : modifier le réglage plus tard ne change JAMAIS les consultations passées. */
  durationDays?: number;
  /** Fin de validité (ISO) = création + durée en jours, figée à la création comme la durée. */
  expiresAt?: string;
  /** API réelle : unité de soin (identifiant) et son nom. */
  careUnitId?: string;
  serviceLabel?: string;
}

/** FICTIF. Aucun diagnostic, aucune observation clinique : seulement le cadre administratif. */
export const DEMO_CONSULTATIONS: readonly Consultation[] = Array.from({ length: 28 }, (_, i) => {
  const person = demoPerson((i * 3) % 24);
  const service = pick(SERVICE_KEYS, i);
  return {
    id: `DEMO-C-${String(i + 1).padStart(3, '0')}`,
    patientId: person.id,
    patientName: person.fullName,
    practitioner: staffFor(service),
    service,
    date: isoAt(-(i % 14), 8 + (i % 8), (i % 2) * 30),
    reason: pick<ConsultationReason>(['firstVisit', 'followUp', 'control', 'vaccination', 'prenatal'], i),
    status: pick<ConsultationStatus>(['inProgress', 'draft', 'signed', 'closed', 'closed', 'signed'], i),
  };
});

/** Dépôt local des consultations (lecture par le suivi des patients). */
export const consultationRepo = localRepositoryFor<Consultation>(HEALTH_ENDPOINTS.consultationsList.collection, DEMO_CONSULTATIONS);

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const invalid = (message: string): never => {
  throw new ApiError('validation', message, { source: 'health', status: 422, code: 'invalid_input' });
};

/**
 * API réelle : /consultations (liste, ouverture, étapes start / await-results / submit / sign / close).
 * Le contenu clinique (sections, versions, addenda) est un autre contrat : il n'est pas concerné ici.
 */
export const CONSULTATION_API: ApiMapping<Consultation> = {
  endpoint: '/consultations',
  fromApi: (r) => {
    const unit = unitById(text(r.care_unit_id));
    const staff = staffById(text(r.practitioner_staff_id));
    const patient = (r.patient ?? null) as { full_name?: string } | null;
    const code = unit?.code ?? '';
    return {
      id: text(r.id),
      patientId: text(r.patient_id),
      patientName: patient?.full_name ?? `Patient n°${text(r.patient_id)}`,
      practitioner: staff?.name ?? '',
      practitionerId: r.practitioner_staff_id ? text(r.practitioner_staff_id) : undefined,
      canWrite: typeof r.can_write === 'boolean' ? r.can_write : undefined,
      service: (SERVICE_KEYS as readonly string[]).includes(code) ? (code as ServiceKey) : 'generalMedicine',
      careUnitId: r.care_unit_id ? text(r.care_unit_id) : undefined,
      serviceLabel: unit?.name,
      date: text(r.started_at),
      reason: text(r.reason_code) as ConsultationReason,
      status: text(r.status) as ConsultationStatus,
      appointmentId: r.appointment_id ? text(r.appointment_id) : undefined,
      origin: r.origin === 'appointment' || r.origin === 'walkIn' ? r.origin : undefined,
      triageEntryId: r.triage_entry_id ? text(r.triage_entry_id) : undefined,
    };
  },
  toApi: (i) => {
    const patient = Number(i.patient);
    if (!Number.isInteger(patient) || patient <= 0) invalid('Choisissez un patient dans la liste.');
    const unit = findUnit(i.service ?? '');
    if (!unit) invalid('Service inconnu pour cet établissement : choisissez un service de la liste.');
    const member = findStaff(i.practitioner ?? '');
    if (!member) invalid('Praticien inconnu pour cet établissement : choisissez un praticien de la liste.');
    const body: Record<string, unknown> = {
      patient_id: patient,
      practitioner_staff_id: Number(member?.id),
      care_unit_id: Number(unit?.id),
      reason_code: i.reason,
    };
    if (Number(i.appointmentId) > 0) body.appointment_id = Number(i.appointmentId);
    if (Number(i.triageEntryId) > 0) body.triage_entry_id = Number(i.triageEntryId);
    return body;
  },
  commandPath: (id, action) => `/consultations/${encodeURIComponent(id)}/actions/${action}`,
  commandBody: () => ({}),
  filterMap: { service: null },
  mapFilter: (id, value) => (id === 'service' ? { care_unit_id: findUnit(value)?.id ?? '0' } : undefined),
};

const baseConsultationService = createResourceService<Consultation>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.consultationsList.collection,
  api: CONSULTATION_API,
  demoRows: DEMO_CONSULTATIONS,
  local: {
    create: async (input, ctx: LocalWriteContext) => {
      const patients = await patientRepo.list();
      const patient = resolvePatient(input.patient ?? '', patients);
      const fee = await finance.feeStatusFor(patient.id);
      const configured = Number(await readSetting(CONSULTATION_DURATION_KEY, String(DEFAULT_CONSULTATION_DAYS)));
      return buildConsultation(input, patients, fee, ctx.now, `CONS-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`, await staffRepo.list(), configured);
    },
    commands: Object.fromEntries(Object.keys(COMMAND_TARGET).map((a) => [a, async (row: Consultation) => applyConsultationCommand(row, a)])),
    permissions: { create: P.consultations.create, commands: { start: P.consultations.update, 'await-results': P.consultations.update, submit: P.consultations.update, sign: P.consultations.sign, close: P.consultations.close } },
  },
  searchText: (c) => `${c.patientName} ${c.patientId} ${c.practitioner} ${c.id}`,
  sortValue: (c, column) => String((c as unknown as Record<string, unknown>)[column] ?? ''),
});

const prepared =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R> => {
    await ensureReference();
    return fn(...args);
  };

export const consultationService: ResourceService<Consultation> = {
  ...baseConsultationService,
  list: prepared(baseConsultationService.list),
  get: prepared(baseConsultationService.get),
  create: prepared(baseConsultationService.create),
  command: prepared(baseConsultationService.command),
};
