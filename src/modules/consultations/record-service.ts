import { PERMISSIONS } from '@/core/permissions/permissions';
import { createResourceService } from '../_shared/resource-service';
import type { ConsultationDraft } from './clinical/model';

export interface ClinicalRecord {
  id: string;
  draft: ConsultationDraft;
}
/** Contrat proposé : GET/PUT /health/consultation-records/{consultationId} (voir docs/API_CONTRACTS_NEEDED.md). */
const parseDraft = (raw: string | undefined): ConsultationDraft => {
  const parsed: unknown = JSON.parse(raw ?? '');
  if (typeof parsed !== 'object' || parsed === null) throw new Error('draft');
  return parsed as ConsultationDraft;
};
/** Mode local : le brouillon clinique est conservé sur l'appareil ; permission vérifiée dans le service. */
export const recordService = createResourceService<ClinicalRecord>({
  source: 'health', endpoint: '/health/consultation-records', demoRows: [],
  local: {
    seed: false,
    create: (input) => ({ id: input.id ?? '', draft: parseDraft(input.draft) }),
    update: (row, input) => ({ ...row, draft: parseDraft(input.draft) }),
    permissions: { create: PERMISSIONS.consultations.update, update: PERMISSIONS.consultations.update },
  },
});
