import type { ListParams, ResourceService } from '../resource-service';

export interface FetchAllResult<T> {
  rows: T[];
  total: number;
  isDemo: boolean;
  /** Vrai si le plafond a été atteint : l'export est alors incomplet et doit le signaler. */
  truncated: boolean;
}

/**
 * Lit toutes les pages d'une liste via le contrat de liste existant (aucun endpoint d'export inventé).
 * Plafonné pour éviter de charger un volume excessif dans le navigateur.
 */
export async function fetchAll<T extends { id: string }>(
  service: ResourceService<T>,
  base: Omit<ListParams, 'page' | 'perPage'>,
  options: { perPage?: number; maxRows?: number } = {},
): Promise<FetchAllResult<T>> {
  const perPage = options.perPage ?? 100;
  const maxRows = options.maxRows ?? 5000;
  const rows: T[] = [];
  let total = 0;
  let isDemo = false;
  for (let page = 1; rows.length < maxRows; page += 1) {
    const result = await service.list({ ...base, page, perPage });
    isDemo = result.isDemo;
    total = result.total;
    rows.push(...result.rows);
    if (result.rows.length === 0 || rows.length >= result.total) break;
  }
  return { rows: rows.slice(0, maxRows), total, isDemo, truncated: total > maxRows };
}
