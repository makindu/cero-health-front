import { ApiError, healthClient, idCoreClient, uzishaClient } from '@/core/api';
import type { ApiClient } from '@/core/api/create-api-client';
import { env } from '@/core/config/env';
import { getLocalContext, type LocalContext } from '@/core/local/context';
import { getLocalDatabase } from '@/core/local/open';
import { collectionNameFor, createLocalRepository, type Repository } from '@/core/local/repository';
import { assertPermission } from '@/core/local/session';
import type { SortState } from '@/components/tables/data-table';

/**
 * Service de ressource : la SEULE couche que les pages utilisent pour lire/écrire des données.
 * Les composants ne connaissent ni les clients HTTP ni les URLs.
 *
 * Trois modes, résolus à chaque appel :
 *  1. « api »  : l'API est configurée ET son endpoint est connu → appel réel.
 *  2. « demo » : sinon, en mode aperçu uniquement, et si des données fictives sont fournies →
 *                données FICTIVES (isDemo = true), lecture seule : aucune écriture n'est simulée comme réelle.
 *  3. « local » : VITE_LOCAL_MODE=true → données persistantes dans IndexedDB (appareil uniquement), jamais de réseau.
 *  4. sinon    : erreur « config » (« Service non configuré »). Aucune donnée n'est inventée.
 */

export type ResourceSource = 'health' | 'uzisha' | 'id-core';

export interface ListParams {
  page: number;
  perPage: number;
  search: string;
  filters: Record<string, string>;
  sort: SortState | null;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
  /** Vrai si les données sont fictives (mode démonstration). */
  isDemo: boolean;
}

export interface DetailResult<T> {
  item: T;
  isDemo: boolean;
}

export interface MutationResult {
  /** Vrai si RIEN n'a été enregistré (démonstration). */
  isDemo: boolean;
  /** API réelle : identifiant de l'élément créé, quand le serveur le renvoie. */
  id?: string;
}

export interface ResourceService<T extends { id: string }> {
  /** Endpoint de collection (contrat cible), s'il est connu. */
  readonly endpoint: string | undefined;
  list(params: ListParams): Promise<ListResult<T>>;
  get(id: string): Promise<DetailResult<T>>;
  create(input: Record<string, string>): Promise<MutationResult>;
  /** Modification d'un élément. Contrat cible : PUT {endpoint}/{id}. En démonstration, rien n'est modifié. */
  update(id: string, input: Record<string, string>): Promise<MutationResult>;
  /**
   * Commande métier sur un élément (valider, dispenser, annuler…).
   * Contrat cible : POST {endpoint}/{id}/{action}. En démonstration, rien n'est modifié.
   */
  command(id: string, action: string, payload?: Record<string, string>): Promise<MutationResult>;
}

/**
 * Correspondance avec l'API réelle (champs en snake_case, chemins du serveur). Sans cette option, le service garde
 * le contrat générique d'origine. Le serveur revérifie toujours les droits : ceci ne fait que traduire les données.
 */
export interface ApiMapping<T> {
  /** Chemin réel de la collection côté serveur (ex. « /patients »). */
  endpoint: string;
  /** Ligne du serveur -> objet de l'interface. */
  fromApi: (row: Record<string, unknown>) => T;
  /** Saisie du formulaire -> corps de requête du serveur. */
  toApi: (input: Record<string, string>) => Record<string, unknown>;
  /** Filtre de l'interface -> paramètre du serveur ; null = pas d'équivalent (ignoré). */
  filterMap?: Record<string, string | null>;
  /** Colonne de l'interface -> champ de tri du serveur ; absent = non triable côté serveur. */
  sortMap?: Record<string, string>;
  /** Filtre qui se traduit en un ou plusieurs paramètres (ex. période -> from/to). Prioritaire sur filterMap ; null = ignoré. */
  mapFilter?: (id: string, value: string) => Record<string, string> | null | undefined;
  /** Corps d'une modification (PATCH) quand il diffère de celui d'une création. */
  toApiUpdate?: (input: Record<string, string>) => Record<string, unknown>;
  /** Chemin de création quand il dépend de la saisie (ex. passage sans rendez-vous). */
  createPath?: (input: Record<string, string>) => string;
  /** Chemin et corps d'une action métier (ex. POST /appointments/{id}/actions/cancel). */
  commandPath?: (id: string, action: string) => string;
  commandBody?: (action: string, payload: Record<string, string>) => Record<string, unknown>;
}

export interface ResourceServiceOptions<T extends { id: string }> {
  source: ResourceSource;
  /** Chemin de la collection. Absent = contrat inconnu (ex. routes UZISHA non fournies). */
  endpoint?: string;
  /** Données fictives (mode aperçu). Doivent être clairement fictives. */
  demoRows?: readonly T[];
  /** Texte interrogé par la recherche (mode démo). */
  searchText?: (row: T) => string;
  /** Test d'un filtre (mode démo). Par défaut : égalité stricte du champ du même nom. */
  matchFilter?: (row: T, filterId: string, value: string) => boolean;
  /** Valeur de tri d'une colonne (mode démo). Par défaut : le champ du même nom. */
  sortValue?: (row: T, columnId: string) => string | number;
  /**
   * Mode local (VITE_LOCAL_MODE) : données persistantes dans IndexedDB, sans aucune requête réseau.
   * Par défaut, la lecture fonctionne (jeu fictif copié dans le stockage local). L'écriture n'est autorisée que si le
   * module déclare ici ses règles métier : jamais de création générique qui produirait des données incohérentes.
   */
  local?: LocalResourceOptions<T>;
  /** Traduction vers l'API réelle (voir ApiMapping). */
  api?: ApiMapping<T>;
}

export interface LocalWriteContext extends LocalContext {
  now: Date;
}
export interface LocalResourceOptions<T extends { id: string }> {
  /** Nom du dépôt local. Par défaut : dérivé de l'endpoint (ex. « /health/patients » → « health-patients »). */
  collection?: string;
  /** Faux = ne PAS copier le jeu fictif en mode local (ex. comptabilité : on part de livres vides). */
  seed?: boolean;
  /** Construit la ligne à créer à partir de la saisie. Absent = création locale non encore disponible. */
  create?: (input: Record<string, string>, ctx: LocalWriteContext, repo: Repository<T>) => T | Promise<T>;
  update?: (row: T, input: Record<string, string>, ctx: LocalWriteContext, repo: Repository<T>) => T | Promise<T>;
  /** Commandes métier (ex. « check-in », « cancel »). Une commande absente est refusée. */
  commands?: Record<string, (row: T, payload: Record<string, string>, ctx: LocalWriteContext, repo: Repository<T>) => T | Promise<T>>;
  /** Permissions vérifiées DANS le service (et pas seulement par le masquage des boutons). */
  permissions?: { create?: string; update?: string; commands?: Record<string, string> };
}

type Mode = 'api' | 'demo' | 'local';

export function resolveMode(source: ResourceSource, endpoint: string | undefined, hasDemo: boolean, hasLocal = false): Mode {
  // Mode local : prioritaire, et exclusif — aucune requête n'est jamais envoyée à une API.
  if (env.localMode && hasLocal) return 'local';
  const baseUrl =
    source === 'health' ? env.api.health : source === 'uzisha' ? env.api.uzisha : env.api.idCore;
  if (baseUrl && endpoint) return 'api';
  if (env.previewMode && hasDemo) return 'demo';
  throw new ApiError(
    'config',
    `Service "${source}" non configuré${endpoint ? '' : ' (endpoint inconnu)'}.`,
    { source },
  );
}

const asRecord = (row: unknown): Record<string, unknown> => row as Record<string, unknown>;

interface QueryHelpers<T> {
  searchText?: (row: T) => string;
  matchFilter?: (row: T, filterId: string, value: string) => boolean;
  sortValue?: (row: T, columnId: string) => string | number;
}

/** Recherche, filtres, tri et pagination côté client (démonstration et mode local) : une seule implémentation. */
function queryRows<T>(source: readonly T[], params: ListParams, helpers: QueryHelpers<T>): { rows: T[]; total: number } {
  const { searchText, matchFilter, sortValue } = helpers;
  let rows = [...source];
  const needle = params.search.trim().toLowerCase();
  if (needle) {
    rows = rows.filter((row) => (searchText ? searchText(row) : JSON.stringify(row)).toLowerCase().includes(needle));
  }
  for (const [id, value] of Object.entries(params.filters)) {
    if (!value) continue;
    rows = rows.filter((row) => (matchFilter ? matchFilter(row, id, value) : String(asRecord(row)[id]) === value));
  }
  if (params.sort) {
    const { columnId, direction } = params.sort;
    const read = (row: T): string | number => (sortValue ? sortValue(row, columnId) : String(asRecord(row)[columnId] ?? ''));
    rows.sort((a, b) => {
      const left = read(a);
      const right = read(b);
      const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      return direction === 'asc' ? order : -order;
    });
  }
  const start = (params.page - 1) * params.perPage;
  return { rows: rows.slice(start, start + params.perPage), total: rows.length };
}

const collectionOf = (endpoint: string | undefined, explicit: string | undefined): string | undefined =>
  explicit ?? (endpoint ? collectionNameFor(endpoint) : undefined);

/**
 * Dépôt local d'une ressource, pour les règles métier qui lisent une AUTRE collection (ex. retrouver un patient depuis un
 * rendez-vous). Même collection, même établissement et même semis que le service de cette ressource.
 */
export function localRepositoryFor<T extends { id: string }>(endpoint: string, seed?: readonly T[], collection?: string): Repository<T> {
  return createLocalRepository<T>({
    db: getLocalDatabase,
    collection: collectionOf(endpoint, collection) ?? endpoint,
    context: getLocalContext,
    seed,
  });
}

export function createResourceService<T extends { id: string }>(
  options: ResourceServiceOptions<T>,
): ResourceService<T> {
  const { source, endpoint, demoRows, searchText, matchFilter, sortValue, local, api } = options;
  const client: ApiClient =
    source === 'health' ? healthClient : source === 'uzisha' ? uzishaClient : idCoreClient;
  const hasDemo = demoRows !== undefined;
  const collection = collectionOf(endpoint, local?.collection);
  const hasLocal = collection !== undefined;
  const modeNow = () => resolveMode(source, endpoint, hasDemo, hasLocal);
  const localRepo: Repository<T> | null = collection && endpoint ? localRepositoryFor<T>(endpoint, local?.seed === false ? undefined : demoRows, local?.collection) : null;
  const writeContext = (): LocalWriteContext => ({ ...getLocalContext(), now: new Date() });
  const unsupported = (what: string) =>
    new ApiError('validation', `${what} : non disponible en mode local pour ce module.`, { source, status: 422, code: 'local_unsupported' });

  return {
    endpoint,

    async list(params) {
      const mode = modeNow();
      if (mode === 'local' && localRepo) {
        const rows = await localRepo.list();
        return { ...queryRows(rows, params, { searchText, matchFilter, sortValue }), isDemo: false };
      }
      if (mode === 'api' && api) {
        const query: Record<string, string | number> = { page: params.page, per_page: params.perPage };
        if (params.search) query.q = params.search;
        for (const [id, value] of Object.entries(params.filters)) {
          if (!value) continue;
          const mapped = api.mapFilter?.(id, value);
          if (mapped) {
            Object.assign(query, mapped);
            continue;
          }
          if (mapped === null) continue;
          const name = api.filterMap && id in api.filterMap ? api.filterMap[id] : id;
          if (name) query[name] = value;
        }
        const sortField = params.sort ? api.sortMap?.[params.sort.columnId] : undefined;
        if (params.sort && sortField) {
          query.sort = sortField;
          query.dir = params.sort.direction;
        }
        const result = await client.get<Record<string, unknown>[]>(api.endpoint, { params: query });
        const rows = Array.isArray(result.data) ? result.data.map(api.fromApi) : [];
        return { rows, total: result.meta?.total ?? rows.length, isDemo: false };
      }
      if (mode === 'api' && endpoint) {
        const query: Record<string, string | number> = {
          page: params.page,
          per_page: params.perPage,
        };
        if (params.search) query.search = params.search;
        for (const [id, value] of Object.entries(params.filters)) if (value) query[id] = value;
        if (params.sort) {
          query.sort = `${params.sort.direction === 'desc' ? '-' : ''}${params.sort.columnId}`;
        }
        const result = await client.get<T[]>(endpoint, { params: query });
        const rows = Array.isArray(result.data) ? result.data : [];
        return { rows, total: result.meta?.total ?? rows.length, isDemo: false };
      }

      return { ...queryRows(demoRows ?? [], params, { searchText, matchFilter, sortValue }), isDemo: true };
    },

    async get(id) {
      const mode = modeNow();
      if (mode === 'local' && localRepo) {
        const item = await localRepo.get(id);
        if (!item) throw new ApiError('not_found', 'Not found', { source, status: 404 });
        return { item, isDemo: false };
      }
      if (mode === 'api' && api) {
        const result = await client.get<Record<string, unknown>>(`${api.endpoint}/${encodeURIComponent(id)}`);
        return { item: api.fromApi(result.data), isDemo: false };
      }
      if (mode === 'api' && endpoint) {
        const result = await client.get<T>(`${endpoint}/${encodeURIComponent(id)}`);
        return { item: result.data, isDemo: false };
      }
      const item = (demoRows ?? []).find((row) => row.id === id);
      if (!item) throw new ApiError('not_found', 'Not found', { source, status: 404 });
      return { item, isDemo: true };
    },

    async create(input) {
      const mode = modeNow();
      if (mode === 'local' && localRepo) {
        const creator = local?.create;
        if (!creator) throw unsupported('Création');
        assertPermission(local?.permissions?.create);
        const ctx = writeContext();
        const row = await creator(input, ctx, localRepo);
        await localRepo.insert(row, { action: 'create' });
        return { isDemo: false };
      }
      if (mode === 'api' && api) {
        const created = await client.post<Record<string, unknown> | undefined>(api.createPath ? api.createPath(input) : api.endpoint, api.toApi(input));
        const newId = created?.data?.id;
        return newId === undefined || newId === null ? { isDemo: false } : { isDemo: false, id: String(newId) };
      }
      if (mode === 'api' && endpoint) {
        await client.post(endpoint, input);
        return { isDemo: false };
      }
      // Démonstration : RIEN n'est enregistré. L'interface doit le dire (jamais « enregistré »).
      return { isDemo: true };
    },

    async update(id, input) {
      const mode = modeNow();
      if (mode === 'local' && localRepo) {
        const updater = local?.update;
        if (!updater) throw unsupported('Modification');
        assertPermission(local?.permissions?.update);
        const ctx = writeContext();
        const current = await localRepo.get(id);
        if (!current) throw new ApiError('not_found', 'Not found', { source, status: 404 });
        const next = await updater(current, input, ctx, localRepo);
        await localRepo.update(id, () => next, { action: 'update' });
        return { isDemo: false };
      }
      if (mode === 'api' && api) {
        await client.patch(`${api.endpoint}/${encodeURIComponent(id)}`, (api.toApiUpdate ?? api.toApi)(input));
        return { isDemo: false };
      }
      if (mode === 'api' && endpoint) {
        await client.put(`${endpoint}/${encodeURIComponent(id)}`, input);
        return { isDemo: false };
      }
      return { isDemo: true };
    },

    async command(id, action, payload) {
      const mode = modeNow();
      if (mode === 'local' && localRepo) {
        const handler = local?.commands?.[action];
        if (!handler) throw unsupported(`Action « ${action} »`);
        assertPermission(local?.permissions?.commands?.[action]);
        const ctx = writeContext();
        const current = await localRepo.get(id);
        if (!current) throw new ApiError('not_found', 'Not found', { source, status: 404 });
        const next = await handler(current, payload ?? {}, ctx, localRepo);
        await localRepo.update(id, () => next, { action: `command:${action}`, reason: payload?.reason });
        return { isDemo: false };
      }
      if (mode === 'api' && api?.commandPath) {
        await client.post(api.commandPath(id, action), api.commandBody ? api.commandBody(action, payload ?? {}) : payload);
        return { isDemo: false };
      }
      if (mode === 'api' && endpoint) {
        await client.post(`${endpoint}/${encodeURIComponent(id)}/${action}`, payload);
        return { isDemo: false };
      }
      return { isDemo: true };
    },
  };
}
