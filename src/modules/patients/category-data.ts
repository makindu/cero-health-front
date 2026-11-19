import { PERMISSIONS } from '@/core/permissions/permissions';
import { createResourceService, localRepositoryFor } from '../_shared/resource-service';
import { useResourceList } from '../_shared/use-resource';
import { applyCategoryUpdate, buildCategory, DEFAULT_CATEGORIES, type PatientCategory } from './categories';
import { CATEGORIES_ENDPOINT } from './payment-policy';

export const patientCategoryRepo = localRepositoryFor<PatientCategory>(CATEGORIES_ENDPOINT, DEFAULT_CATEGORIES);

/** Contrat cible proposé : GET/POST/PUT /health/patient-categories. */
export const patientCategoryService = createResourceService<PatientCategory>({
  source: 'health',
  endpoint: CATEGORIES_ENDPOINT,
  demoRows: DEFAULT_CATEGORIES,
  local: {
    create: async (input, _ctx, repo) => buildCategory(input, await repo.list()),
    update: async (row, input, _ctx, repo) => applyCategoryUpdate(row, input, await repo.list()),
    permissions: { create: PERMISSIONS.administration.manageSettings, update: PERMISSIONS.administration.manageSettings },
  },
  searchText: (c) => `${c.label} ${c.description}`,
});

/** Catégories (actives ou non) pour les listes et les libellés. */
export function usePatientCategories() {
  const list = useResourceList('patient-categories', patientCategoryService, { page: 1, perPage: 200, search: '', filters: {}, sort: null });
  const all = list.data?.rows ?? [];
  return { all, active: all.filter((c) => c.active), byId: new Map(all.map((c) => [c.id, c])), isPending: list.isPending };
}
