import { PERMISSIONS } from '@/core/permissions/permissions';
import { createResourceService, localRepositoryFor, type ApiMapping } from '../_shared/resource-service';
import { useResourceList } from '../_shared/use-resource';
import { applyCategoryUpdate, buildCategory, DEFAULT_CATEGORIES, type PatientCategory } from './categories';
import { CATEGORIES_ENDPOINT } from './payment-policy';

export const patientCategoryRepo = localRepositoryFor<PatientCategory>(CATEGORIES_ENDPOINT, DEFAULT_CATEGORIES);

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const flagOf = (v: string | undefined): boolean | undefined => (v === 'true' ? true : v === 'false' ? false : undefined);

/** Correspondance avec l'API réelle : l'identifiant de l'interface est le CODE ; l'API modifie par identifiant numérique. */
const CATEGORY_API: ApiMapping<PatientCategory> = {
  endpoint: '/patient-categories',
  fromApi: (r) => ({
    id: text(r.code),
    apiId: text(r.id),
    label: text(r.label),
    description: text(r.description),
    payConsultation: r.pay_consultation === true,
    payLab: r.pay_lab === true,
    payMedication: r.pay_medication === true,
    active: r.is_active !== false,
  }),
  toApi: (i) => {
    const body: Record<string, unknown> = {
      label: i.label?.trim() || undefined,
      description: i.description === undefined ? undefined : i.description.trim() || null,
      pay_consultation: flagOf(i.payConsultation),
      pay_lab: flagOf(i.payLab),
      pay_medication: flagOf(i.payMedication),
      is_active: flagOf(i.active),
    };
    return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  },
};

/** Contrat cible proposé : GET/POST/PUT /health/patient-categories. */
export const patientCategoryService = createResourceService<PatientCategory>({
  source: 'health',
  endpoint: CATEGORIES_ENDPOINT,
  api: CATEGORY_API,
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
