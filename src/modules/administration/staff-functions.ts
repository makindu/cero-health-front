import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { ApiError, healthClient } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { referenceFromApi, resetReference } from '../_shared/reference-data';

/** Fonction du personnel créée par l'établissement ; elle reprend les règles d'un type commun (baseType). */
export interface StaffFunction {
  id: string;
  code: string;
  label: string;
  baseType: string;
  /** Nombre de profils qui l'utilisent (une fonction utilisée ne peut pas être supprimée). */
  used: number;
}

/** Fonction courante proposée aux administrateurs. */
export interface StaffFunctionSuggestion {
  key: string;
  label: string;
  baseType: string;
  added: boolean;
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export const staffFunctionFrom = (r: Record<string, unknown>): StaffFunction => ({
  id: text(r.id), code: text(r.code), label: text(r.label), baseType: text(r.base_type), used: Number(r.used ?? 0) || 0,
});

export const suggestionFrom = (r: Record<string, unknown>): StaffFunctionSuggestion => ({
  key: text(r.key), label: text(r.label), baseType: text(r.base_type), added: r.added === true,
});

/** Valeur d'une option de la liste « Fonction » : type commun (« t:doctor ») ou fonction de l'établissement (« f:12 »). */
export const typeOption = (type: string): string => `t:${type}`;
export const functionOption = (id: string): string => `f:${id}`;

/** Ce que choisit une option : le type à enregistrer et, pour une fonction de l'établissement, son identifiant. */
export function resolveFunctionOption(value: string, functions: readonly StaffFunction[]): { type: string; functionId: string } {
  if (value.startsWith('f:')) {
    const f = functions.find((x) => x.id === value.slice(2));
    return f ? { type: f.baseType, functionId: f.id } : { type: '', functionId: '' };
  }
  return { type: value.startsWith('t:') ? value.slice(2) : '', functionId: '' };
}

/** Option actuellement choisie pour un profil. */
export const optionOf = (type: string, functionId: string): string => (functionId ? functionOption(functionId) : type ? typeOption(type) : '');

export interface StaffFunctionsData {
  functions: StaffFunction[];
  suggestions: StaffFunctionSuggestion[];
}

/** Fonctions de l'établissement actif et fonctions courantes proposées. Relu en direct (entité staff_functions). */
export function useStaffFunctions() {
  const { activeFacilityId } = usePreferences();
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'staff-functions'),
    queryFn: async (): Promise<StaffFunctionsData> => {
      // La réponse porte aussi les fonctions courantes (clé « suggestions ») : on lit le corps brut, le normaliseur ne garde que « data ».
      const res = await healthClient.raw.get<{ data?: unknown; suggestions?: unknown }>('/staff-functions');
      const body = res.data ?? {};
      const rows = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
      const sugg = Array.isArray(body.suggestions) ? (body.suggestions as Record<string, unknown>[]) : [];
      return { functions: rows.map(staffFunctionFrom), suggestions: sugg.map(suggestionFrom) };
    },
    enabled: referenceFromApi(),
    staleTime: 10_000,
  });
}

export async function createStaffFunction(input: { label: string; baseType: string }): Promise<void> {
  await healthClient.post('/staff-functions', { label: input.label.trim(), base_type: input.baseType });
  resetReference();
}

export async function addSuggestedFunctions(keys: string[]): Promise<void> {
  await healthClient.post('/staff-functions/suggested', { keys });
  resetReference();
}

export async function deleteStaffFunction(id: string): Promise<void> {
  await healthClient.delete(`/staff-functions/${encodeURIComponent(id)}`);
  resetReference();
}

/** Exécute une action sur les fonctions, puis relit les fonctions, le personnel et les listes de référence. */
export function useFunctionMutation<I>(run: (input: I) => Promise<void>, options: { successTitle: string; onDone?: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      for (const scope of ['staff-functions', 'staff', 'reference']) void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, scope) });
      toast({ tone: 'success', title: options.successTitle });
      options.onDone?.();
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'staff-functions') });
      const server = error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined;
      toast({ tone: 'danger', title: server ?? t('module.saveFailed'), description: server ? undefined : t('module.saveFailedHint') });
    },
  });
}
