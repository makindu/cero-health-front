import { useQuery } from '@tanstack/react-query';
import { env } from '@/core/config/env';
import { getAccessToken } from '@/core/auth/cero-id';
import { queryKeys } from '@/core/api/query-client';

/** Fiche de l'établissement telle que CERO ID la fournit (lecture seule). */
export interface FacilityProfile {
  id: number;
  name: string;
  description: string;
  category: string;
  phone: string;
  mail: string;
  address: string;
  website: string;
  rccm: string;
  nationalId: string;
  taxNumber: string;
  authorization: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  status: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function profileFrom(raw: Record<string, unknown>): FacilityProfile {
  return {
    id: Number(raw.id ?? 0),
    name: str(raw.name),
    description: str(raw.description),
    category: str(raw.category),
    phone: str(raw.phone),
    mail: str(raw.mail),
    address: str(raw.adresse),
    website: str(raw.website),
    rccm: str(raw.rccm),
    nationalId: str(raw.national_identification),
    taxNumber: str(raw.num_impot),
    authorization: str(raw.autorisation_fct),
    facebook: str(raw.facebook),
    instagram: str(raw.instagram),
    linkedin: str(raw.linkdin),
    status: str(raw.status),
  };
}

/** Adresse publique du logo (le Core le sert sans authentification). */
export function logoUrl(facilityId: number | string | null | undefined, base: string | null = env.api.idCore ?? null): string | null {
  const id = Number(facilityId);
  if (!base || !Number.isInteger(id) || id <= 0) return null;
  return `${base.replace(/\/+$/, '')}/api/v1/enterprise-logos/${id}`;
}

export async function fetchFacilityProfile(facilityId: number): Promise<FacilityProfile> {
  const base = (env.api.idCore ?? '').replace(/\/+$/, '');
  const token = getAccessToken();
  const res = await fetch(`${base}/api/v1/auth/enterprise?enterprise_id=${facilityId}`, {
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as { data?: Record<string, unknown> };
  return profileFrom(body.data ?? {});
}

export function useFacilityProfile(facilityId: number | undefined) {
  // La clé suit l'établissement demandé (celui de l'en-tête), pas un état annexe : changer d'établissement change la clé.
  return useQuery({
    queryKey: queryKeys.scoped(facilityId ? String(facilityId) : null, 'reference', 'facility-profile', facilityId ?? 0),
    queryFn: () => fetchFacilityProfile(facilityId as number),
    enabled: Boolean(facilityId && env.api.idCore),
    staleTime: 60_000,
  });
}
