import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from '@/core/preferences/preferences-store';

/**
 * Annonces « nouvel ajout » du temps réel. Le signal (entité + identifiant de ce qui vient d'être créé) arrive seul : le bandeau s'affiche
 * tout de suite, SANS aucune requête. Ce n'est qu'au clic sur « Voir » que l'élément est lu sur l'API (un appel ciblé), puis montré dans la liste.
 */
export const HIGHLIGHT_MS = 8000;

export type ArrivalListener = (facilityId: string | null, entity: string, ids: number[]) => void;
const listeners = new Set<ArrivalListener>();

export function subscribeArrivals(listener: ArrivalListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Appelé par le branchement temps réel quand des créations arrivent. */
export function publishArrivals(facilityId: string | null, groups: readonly { entity: string; ids: number[] }[]): void {
  for (const g of groups) for (const l of listeners) l(facilityId, g.entity, g.ids);
}

/** Ajoute `found` à `items` (sans doublon d'identifiant) et trie. */
export function mergeItems<T extends { id: string }>(items: readonly T[], found: readonly T[], compare: (a: T, b: T) => number): T[] {
  const byId = new Map<string, T>(items.map((i) => [i.id, i]));
  for (const f of found) byId.set(f.id, f);
  return [...byId.values()].sort(compare);
}

/** Fait défiler jusqu'à la ligne (tableau ou carte mobile, selon celle qui est visible). */
export function scrollToRow(id: string): void {
  if (typeof document === 'undefined') return;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-row-id]')).filter((n) => n.dataset.rowId === id);
  const visible = nodes.find((n) => n.offsetParent !== null) ?? nodes[0];
  visible?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export interface CatalogArrivals {
  /** Identifiants annoncés et pas encore consultés. */
  ids: number[];
  /** Lecture en cours après le clic sur « Voir ». */
  viewing: boolean;
  /** Identifiants (texte) à montrer une fois la lecture faite. */
  toShow: string[] | null;
  /** Lignes à mettre en surbrillance. */
  fresh: ReadonlySet<string>;
  flash: (ids: readonly string[]) => void;
  /** Lit les éléments annoncés (un appel ciblé) ; rejette si la lecture échoue. */
  view: () => Promise<void>;
  clearShow: () => void;
  dismiss: () => void;
}

export function useCatalogArrivals(opts: { entities: readonly string[]; load: (ids: number[]) => Promise<void> }): CatalogArrivals {
  const { activeFacilityId } = usePreferences();
  const entitiesKey = opts.entities.join(',');
  const [ids, setIds] = useState<number[]>([]);
  const [viewing, setViewing] = useState(false);
  const [toShow, setToShow] = useState<string[] | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const loadRef = useRef(opts.load);
  loadRef.current = opts.load;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setIds([]);
    setToShow(null);
    const wanted = entitiesKey.split(',');
    return subscribeArrivals((facility, entity, added) => {
      if (facility !== activeFacilityId || !wanted.includes(entity)) return;
      setIds((prev) => [...new Set([...prev, ...added])]);
    });
  }, [activeFacilityId, entitiesKey]);

  const flash = useCallback((list: readonly string[]) => {
    setFresh((prev) => new Set([...prev, ...list]));
    for (const id of list) {
      const old = timers.current.get(id);
      if (old) clearTimeout(old);
      timers.current.set(id, setTimeout(() => {
        timers.current.delete(id);
        setFresh((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }, HIGHLIGHT_MS));
    }
  }, []);

  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); }, []);

  const view = useCallback(async () => {
    const wanted = idsRef.current;
    if (wanted.length === 0) return;
    setViewing(true);
    try {
      await loadRef.current(wanted);
      setToShow(wanted.map(String));
      setIds([]);
    } finally {
      setViewing(false);
    }
  }, []);

  const clearShow = useCallback(() => setToShow(null), []);
  const dismiss = useCallback(() => setIds([]), []);
  return { ids, viewing, toShow, fresh, flash, view, clearShow, dismiss };
}

/**
 * Après « Voir » : va à la page de la liste où se trouve le premier élément lu, le met en surbrillance et y fait défiler.
 * `base` = liste complète triée (sans filtre de recherche). Si rien n'y correspond (ajout d'un autre catalogue), `onNone` prévient.
 */
export function useArrivalFocus<T extends { id: string }>(
  arrivals: Pick<CatalogArrivals, 'toShow' | 'clearShow' | 'flash'>,
  base: readonly T[],
  o: { perPage: number; setPage: (page: number) => void; setSearch: (search: string) => void; onNone: () => void },
): void {
  const { toShow, clearShow, flash } = arrivals;
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => {
    if (!toShow) return;
    const found = toShow.filter((id) => base.some((i) => i.id === id));
    if (found.length > 0) {
      const idx = base.findIndex((i) => i.id === found[0]);
      ref.current.setSearch('');
      ref.current.setPage(Math.floor(idx / ref.current.perPage) + 1);
      flash(found);
      clearShow();
      setTimeout(() => scrollToRow(found[0]!), 150);
      return;
    }
    // la liste peut mettre un instant à refléter la lecture : on attend un peu avant de conclure que rien ne correspond
    const timer = setTimeout(() => {
      ref.current.onNone();
      clearShow();
    }, 1500);
    return () => clearTimeout(timer);
  }, [toShow, base, flash, clearShow]);
}
