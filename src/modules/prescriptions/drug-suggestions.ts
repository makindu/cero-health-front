import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthClient } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { referenceFromApi } from '../_shared/reference-data';

export interface DrugSuggestion {
  name: string;
  /** « catalog » : pharmacie de l'établissement ; « prescribed » : déjà prescrit par un confrère (hors pharmacie possible). */
  source: 'catalog' | 'prescribed';
}

/** Ajout rapide : mémorise en silence un médicament absent des listes (sans prix ni stock, à valider par les gestionnaires). */
export async function addDrug(name: string): Promise<DrugSuggestion> {
  const res = await healthClient.post<DrugSuggestion>('/drug-suggestions', { name });
  return res.data as DrugSuggestion;
}

/**
 * Médicaments proposés pendant la saisie d'une ordonnance (API réelle) : la requête part après une courte pause de frappe
 * et dès 2 caractères, jamais à chaque touche. Un médicament absent reste saisissable librement ; il est mémorisé par le
 * serveur à l'enregistrement de l'ordonnance, puis proposé aux confrères.
 */
export function useDrugSuggestions(text: string) {
  const { activeFacilityId } = usePreferences();
  const [q, setQ] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(handle);
  }, [text]);
  return useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'prescriptions', 'drug-suggest', q),
    queryFn: async (): Promise<DrugSuggestion[]> => {
      const res = await healthClient.get<DrugSuggestion[]>('/drug-suggestions', { params: { q } });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: referenceFromApi() && q.length >= 2,
    staleTime: 60_000,
  });
}
