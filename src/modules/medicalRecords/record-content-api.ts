import { healthClient } from '@/core/api';

/**
 * Contenu d'un dossier médical relu en direct sur le serveur. Chaque section vaut `null` quand les droits de la personne ne la couvrent pas
 * (jamais « vide » : elle ne doit pas croire qu'il n'y a rien). Chaque ouverture est tracée par le serveur : on ne la déclenche qu'après confirmation.
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const list = (v: unknown): Row[] | null => (Array.isArray(v) ? v.map(rec) : null);
const num = (v: unknown): number | null => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

export interface DiagnosisLine { label: string; icd10: string; type: string; status: string }
/** Ce que le médecin a rédigé, en texte brut par rubrique. Seulement dans une synthèse remise, et seulement pour une consultation validée. */
export interface ClinicalText { complaint: string; history: string; exam: string; evaluation: string; plan: string; conclusion: string }
export interface ConsultationLine { id: string; at: string; reason: string; status: string; diagnoses: DiagnosisLine[]; clinical?: ClinicalText | null | undefined }
export interface RxItemLine { label: string; dosage: string; frequency: string; duration: string; quantity: number | null }
export interface PrescriptionLine { id: string; number: string; at: string; status: string; items: RxItemLine[] }
export interface LabTestLine { label: string; value: string; unit: string; flag: string }
export interface LabOrderLine { id: string; number: string; at: string; status: string; priority: string; tests: LabTestLine[] }
export interface VisitLine { id: string; at: string; type: string; diagnosis: string }
export interface AdmissionLine { id: string; number: string; at: string; status: string; reason: string; outcome: string; visits: VisitLine[] | null }
export interface DocumentLine { id: string; type: string; mime: string; sizeBytes: number | null; at: string }

/** Coordonnées de l'établissement, envoyées avec les synthèses remises (jamais avec une simple lecture). */
export interface EnterpriseInfo { name: string; address: string; phone: string; mail: string; website: string; rccm: string; idnat: string; nif: string; authorization: string }
export interface PatientIdentity { sex: string; birthDate: string }

export interface RecordContent {
  cap: number;
  consultations: ConsultationLine[] | null;
  prescriptions: PrescriptionLine[] | null;
  labOrders: LabOrderLine[] | null;
  admissions: AdmissionLine[] | null;
  documents: DocumentLine[] | null;
  enterprise?: EnterpriseInfo | null;
  identity?: PatientIdentity | null;
}

const CLINICAL_KEYS = ['complaint', 'history', 'exam', 'evaluation', 'plan', 'conclusion'] as const;
/** `null` quand le serveur n'a rien envoyé (lecture simple, brouillon) ou que tout est vide. */
export function clinicalFrom(v: unknown): ClinicalText | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const r = v as Row;
  const out = { complaint: '', history: '', exam: '', evaluation: '', plan: '', conclusion: '' };
  for (const k of CLINICAL_KEYS) out[k] = text(r[k]).trim();
  return CLINICAL_KEYS.some((k) => out[k] !== '') ? out : null;
}

export function contentFrom(data: Row): RecordContent {
  const s = rec(data.sections);
  const diagnoses = list(s.diagnoses) ?? [];
  const consultations = list(s.consultations);
  const visits = list(s.visits);
  const admissions = list(s.admissions);
  const e = data.enterprise === undefined || data.enterprise === null ? null : rec(data.enterprise);
  const id = data.identity === undefined || data.identity === null ? null : rec(data.identity);
  return {
    cap: num(data.cap) ?? 0,
    enterprise: e && { name: text(e.name).trim(), address: text(e.address).trim(), phone: text(e.phone).trim(), mail: text(e.mail).trim(), website: text(e.website).trim(), rccm: text(e.rccm).trim(), idnat: text(e.idnat).trim(), nif: text(e.nif).trim(), authorization: text(e.authorization).trim() },
    identity: id && { sex: text(id.sex).trim(), birthDate: text(id.birth_date).slice(0, 10) },
    consultations: consultations && consultations.map((c) => ({
      id: text(c.id), at: text(c.started_at), reason: text(c.reason_code), status: text(c.status), clinical: clinicalFrom(c.clinical),
      diagnoses: diagnoses.filter((d) => text(d.consultation_id) === text(c.id)).map((d) => ({ label: text(d.label), icd10: text(d.icd10), type: text(d.type), status: text(d.status) })),
    })),
    prescriptions: list(s.prescriptions)?.map((p) => ({
      id: text(p.id), number: text(p.number), at: text(p.prescribed_at), status: text(p.status),
      items: (list(p.items) ?? []).map((i) => ({ label: text(i.label), dosage: text(i.dosage), frequency: text(i.frequency), duration: text(i.duration), quantity: num(i.quantity) })),
    })) ?? null,
    labOrders: list(s.lab_orders)?.map((o) => ({
      id: text(o.id), number: text(o.number), at: text(o.requested_at), status: text(o.status), priority: text(o.priority),
      tests: (list(o.tests) ?? []).map((t) => ({ label: text(t.label), value: text(t.value), unit: text(t.unit), flag: text(t.flag) })),
    })) ?? null,
    admissions: admissions && admissions.map((a) => ({
      id: text(a.id), number: text(a.number), at: text(a.admitted_at), status: text(a.status), reason: text(a.reason), outcome: text(rec(a.discharge).outcome),
      // Les visites portent le volet clinique : sans le droit dédié le serveur renvoie null, et on garde ce « non accessible ».
      visits: visits === null ? null : visits.filter((v) => text(v.admission_id) === text(a.id)).map((v) => ({
        id: text(v.id), at: text(v.visited_at), type: text(v.visit_type), diagnosis: typeof rec(v.clinical).diagnosis === 'string' ? text(rec(v.clinical).diagnosis) : '',
      })),
    })),
    documents: list(s.documents)?.map((d) => ({ id: text(d.id), type: text(d.document_type), mime: text(d.mime_type), sizeBytes: num(d.size_bytes), at: text(d.uploaded_at) })) ?? null,
  };
}

/** Taille lisible d'un document (octets → Ko / Mo). */
export function sizeLabel(bytes: number | null): string {
  if (bytes === null || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/** Une section au plafond du serveur est peut-être tronquée : on le dit. */
export const atCap = (n: number | null | undefined, cap: number): boolean => cap > 0 && (n ?? 0) >= cap;

/** view = lecture ; print / xlsx / summary_pdf / summary_docx = remise en document (export : droit dédié, tracé par le serveur). */
export type ContentPurpose = 'view' | 'print' | 'xlsx' | 'summary_pdf' | 'summary_docx';

export const apiRecordContent = {
  /** Lecture nominative : le serveur enregistre qui a ouvert ce dossier, quand, et pour quel usage. */
  open: async (id: string, purpose: ContentPurpose = 'view'): Promise<RecordContent> => contentFrom(rec((await healthClient.get<Row>(`/medical-records/${id}/content`, { params: { purpose } })).data)),
};
