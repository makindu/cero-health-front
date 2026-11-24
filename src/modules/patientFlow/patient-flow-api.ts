import { healthClient } from '@/core/api';
import * as R from './flow-rules';
import type { FlowSnapshot } from './patient-flow';

type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);

const PLACE_SET = new Set<string>(R.PLACES);

/** Un événement du serveur → événement du suivi. Un lieu inconnu ou une date illisible est écarté (null). */
export function flowEventFrom(r: Row): R.FlowEvent | null {
  const place = text(r.place);
  const at = text(r.at);
  if (!PLACE_SET.has(place) || Number.isNaN(Date.parse(at)) || r.patient_id === null || r.patient_id === undefined) return null;
  const ref = text(r.ref);
  const detail = text(r.detail);
  return {
    patientId: text(r.patient_id), patientName: text(r.patient_name), at, place: place as R.Place, step: text(r.step),
    ...(ref ? { ref } : {}), ...(detail ? { detail } : {}),
  };
}

/** Réponse de GET /patient-flow → même instantané que le mode local (tableau du jour calculé par les mêmes règles). */
export function snapshotFrom(data: unknown, fallbackNow: Date = new Date()): FlowSnapshot {
  const d = rec(data);
  const parsed = Date.parse(text(d.now));
  const now = Number.isNaN(parsed) ? fallbackNow : new Date(parsed);
  const events = rows(d.events).map(flowEventFrom).filter((e): e is R.FlowEvent => e !== null);
  // le serveur envoie du plus récent au plus ancien ; on re-trie pour ne jamais dépendre de cet ordre
  const sorted = events.map((e, i) => ({ e, i })).sort((a, b) => b.e.at.localeCompare(a.e.at) || a.i - b.i).map((x) => x.e);
  const inpatients = rows(d.inpatients).map((w) => ({ patientId: text(w.patient_id), status: text(w.status), ward: text(w.ward) }));
  return { now: now.toISOString(), events: sorted, board: R.buildBoard(sorted, inpatients, now) };
}

/** Suivi des patients lu sur le serveur (lecture seule ; chaque lieu dépend de vos droits de lecture). */
export const apiPatientFlow = {
  async snapshot(): Promise<FlowSnapshot> {
    const res = await healthClient.get<Row>('/patient-flow');
    return snapshotFrom(res.data);
  },
};
