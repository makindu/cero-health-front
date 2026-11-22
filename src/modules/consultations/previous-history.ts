import { useMemo } from 'react';
import { referenceFromApi } from '../_shared/reference-data';
import { useResourceList } from '../_shared/use-resource';
import { consultationService } from './data';
import { recordService } from './record-service';
import { EMPTY_DOC, type RichDoc } from './richtext/doc';
import type { Antecedent } from './clinical/model';

const ALL = { page: 1, perPage: 1000, search: '', filters: {}, sort: null } as const;

export interface PreviousHistory { pending: boolean; antecedents: Antecedent[]; notes: RichDoc; from: string }

/**
 * Antécédents connus du patient, repris de sa consultation précédente la plus récente qui en contient.
 * Les entrées gardent leur auteur et leur date d'origine ; le médecin doit les revérifier pour cette consultation.
 */
export function usePreviousHistory(patientId: string | undefined, currentId: string | undefined, currentDate: string | undefined): PreviousHistory {
  // API réelle : les antécédents sont ceux du dossier du patient (chargés avec la consultation) ; ni liste de brouillons, ni requête ici.
  const local = !referenceFromApi();
  const consultations = useResourceList('consultations', consultationService, ALL, { enabled: local });
  const records = useResourceList('consultation-records', recordService, ALL, { enabled: local });
  const pending = local && Boolean(patientId) && (consultations.isPending || records.isPending);
  return useMemo(() => {
    const none: PreviousHistory = { pending, antecedents: [], notes: EMPTY_DOC, from: '' };
    if (!patientId || !currentDate) return none;
    const byId = new Map((records.data?.rows ?? []).map((r) => [r.id, r.draft]));
    const earlier = (consultations.data?.rows ?? [])
      .filter((c) => c.patientId === patientId && c.id !== currentId && c.date < currentDate)
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const c of earlier) {
      const draft = byId.get(c.id);
      if (draft && draft.antecedents.length > 0) return { pending, antecedents: draft.antecedents, notes: draft.antecedentNotes ?? EMPTY_DOC, from: c.date };
    }
    return none;
  }, [pending, patientId, currentId, currentDate, consultations.data, records.data]);
}
