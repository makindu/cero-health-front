import { PERMISSIONS } from '@/core/permissions/permissions';
import { createResourceService, type DetailResult, type MutationResult, type ResourceService } from '../_shared/resource-service';
import { referenceFromApi } from '../_shared/reference-data';
import type { ConsultationDraft } from './clinical/model';
import { fetchDraft, saveDraft } from './record-api';

export interface ClinicalRecord {
  id: string;
  draft: ConsultationDraft;
}
const parseDraft = (raw: string | undefined): ConsultationDraft => {
  const parsed: unknown = JSON.parse(raw ?? '');
  if (typeof parsed !== 'object' || parsed === null) throw new Error('draft');
  return parsed as ConsultationDraft;
};
/** Mode local : le brouillon clinique est conservé sur l'appareil ; permission vérifiée dans le service. */
const localRecordService = createResourceService<ClinicalRecord>({
  source: 'health', endpoint: '/health/consultation-records', demoRows: [],
  local: {
    seed: false,
    create: (input) => ({ id: input.id ?? '', draft: parseDraft(input.draft) }),
    update: (row, input) => ({ ...row, draft: parseDraft(input.draft) }),
    permissions: { create: PERMISSIONS.consultations.update, update: PERMISSIONS.consultations.update },
  },
});

/**
 * Avec l'API réelle, le dossier clinique est celui de la consultation : lecture de GET /consultations/{id}, écriture
 * par section (contenu, diagnostics, vérification des antécédents, addenda). Sans API, le mode local ci-dessus s'applique.
 */
export const recordService: ResourceService<ClinicalRecord> = {
  ...localRecordService,
  async get(id): Promise<DetailResult<ClinicalRecord>> {
    if (!referenceFromApi()) return localRecordService.get(id);
    return { item: { id, draft: await fetchDraft(id) }, isDemo: false };
  },
  async create(input): Promise<MutationResult> {
    if (!referenceFromApi()) return localRecordService.create(input);
    await saveDraft(input.id ?? '', parseDraft(input.draft));
    return { isDemo: false };
  },
  async update(id, input): Promise<MutationResult> {
    if (!referenceFromApi()) return localRecordService.update(id, input);
    await saveDraft(id, parseDraft(input.draft));
    return { isDemo: false };
  },
};
