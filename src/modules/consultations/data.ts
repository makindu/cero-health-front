import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { isoAt } from '@/utils/dates';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { createResourceService, type LocalWriteContext } from '../_shared/resource-service';
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
  /** Médecin de l'annuaire du personnel (mode local). */
  practitionerId?: string;
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

export const consultationService = createResourceService<Consultation>({
  source: 'health',
  endpoint: HEALTH_ENDPOINTS.consultationsList.collection,
  demoRows: DEMO_CONSULTATIONS,
  local: {
    create: async (input, ctx: LocalWriteContext) => {
      const patients = await patientRepo.list();
      const patient = resolvePatient(input.patient ?? '', patients);
      const fee = await finance.feeStatusFor(patient.id);
      return buildConsultation(input, patients, fee, ctx.now, `CONS-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`, await staffRepo.list());
    },
    commands: Object.fromEntries(Object.keys(COMMAND_TARGET).map((a) => [a, async (row: Consultation) => applyConsultationCommand(row, a)])),
    permissions: { create: P.consultations.create, commands: { start: P.consultations.update, 'await-results': P.consultations.update, submit: P.consultations.update, sign: P.consultations.sign, close: P.consultations.close } },
  },
  searchText: (c) => `${c.patientName} ${c.patientId} ${c.practitioner} ${c.id}`,
  sortValue: (c, column) => String((c as unknown as Record<string, unknown>)[column] ?? ''),
});
