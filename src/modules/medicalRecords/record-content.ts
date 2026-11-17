import { consultationRepo, type Consultation } from '../consultations/data';
import type { ConsultationDraft } from '../consultations/clinical/model';
import { localRepositoryFor } from '../_shared/resource-service';
import type { Visit } from '../hospitalization/visit-rules';
import type { Admission } from '../hospitalization/hospital-rules';
import { hospital, visits } from '../hospitalization/hospital';
import type { LabOrderView } from '../laboratory/lab-service';
import { lab } from '../laboratory/lab';
import { rx } from '../prescriptions/rx';
import type { Rx } from '../prescriptions/rx-rules';

export interface RecordAdmission {
  admission: Admission;
  /** Dernier diagnostic posé en visite (si le droit de lecture des visites le permet). */
  diagnosis?: string;
  /** Visites du séjour, la plus récente d'abord (vide si le droit de lecture des visites manque). */
  visits: Visit[];
}

/** Contenu d'un dossier, relevé en direct dans les modules (rien n'est copié). `null` = section non accessible avec les droits de l'utilisateur. */
export interface RecordContent {
  consultations: Consultation[] | null;
  prescriptions: Rx[] | null;
  labOrders: LabOrderView[] | null;
  admissions: RecordAdmission[] | null;
}

const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
  try { return await fn(); } catch { return null; }
};

export async function loadRecordContent(patientId: string): Promise<RecordContent> {
  const [consultations, prescriptions, labOrders, admissions] = await Promise.all([
    safe(async () => (await consultationRepo.list()).filter((c) => c.patientId === patientId).sort((a, b) => b.date.localeCompare(a.date))),
    safe(async () => (await rx.list()).filter((r) => r.patientId === patientId)),
    safe(async () => (await lab.list()).filter((o) => o.order.patientId === patientId)),
    safe(async () => {
      const mine = (await hospital.board()).admissions.filter((a) => a.patientId === patientId);
      return Promise.all(mine.map(async (admission): Promise<RecordAdmission> => {
        const ledger = await safe(() => visits.ledger(admission.id));
        const diagnosis = ledger?.visits.find((v) => v.clinical?.diagnosis)?.clinical?.diagnosis;
        return { admission, visits: ledger?.visits ?? [], ...(diagnosis ? { diagnosis } : {}) };
      }));
    }),
  ]);
  return { consultations, prescriptions, labOrders, admissions };
}

/** Brouillon clinique d'une consultation (mode local : conservé sur l'appareil par l'écran de consultation). `null` = pas encore rédigé. */
const consultationRecordRepo = localRepositoryFor<{ id: string; draft: ConsultationDraft }>('/health/consultation-records');
export async function loadConsultationDraft(consultationId: string): Promise<ConsultationDraft | null> {
  return (await consultationRecordRepo.get(consultationId))?.draft ?? null;
}
