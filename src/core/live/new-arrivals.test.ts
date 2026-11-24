import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { mergeItems, publishArrivals, useCatalogArrivals } from './new-arrivals';

type Row = { id: string; label: string };
const byLabel = (a: Row, b: Row) => a.label.localeCompare(b.label);

describe('mergeItems', () => {
  it('insère à la place alphabétique et ne double jamais un identifiant', () => {
    const out = mergeItems<Row>([{ id: '1', label: 'Amoxicilline' }, { id: '2', label: 'Zinc' }], [{ id: '3', label: 'Paracétamol' }, { id: '1', label: 'Amoxicilline 500' }], byLabel);
    expect(out.map((r) => r.label)).toEqual(['Amoxicilline 500', 'Paracétamol', 'Zinc']);
  });
});

describe('useCatalogArrivals', () => {
  const setup = (load = vi.fn(async () => undefined)) => renderHook(() => useCatalogArrivals({ entities: ['catalog_items'], load }));

  it('affiche le bandeau dès le signal, sans aucune lecture', () => {
    const load = vi.fn(async () => undefined);
    const { result } = setup(load);
    act(() => publishArrivals(null, [{ entity: 'catalog_items', ids: [7] }]));
    expect(result.current.ids).toEqual([7]);
    expect(load).not.toHaveBeenCalled();
  });

  it("ignore les autres entités et cumule sans doublon", () => {
    const { result } = setup();
    act(() => publishArrivals(null, [{ entity: 'patients', ids: [1] }, { entity: 'catalog_items', ids: [7] }]));
    act(() => publishArrivals(null, [{ entity: 'catalog_items', ids: [7, 8] }]));
    expect(result.current.ids).toEqual([7, 8]);
  });

  it('ignore les signaux d’un autre établissement', () => {
    const { result } = setup();
    act(() => publishArrivals('autre', [{ entity: 'catalog_items', ids: [7] }]));
    expect(result.current.ids).toEqual([]);
  });

  it('ne lit qu’au clic sur « Voir », puis prépare l’affichage et ferme le bandeau', async () => {
    const load = vi.fn(async () => undefined);
    const { result } = setup(load);
    act(() => publishArrivals(null, [{ entity: 'catalog_items', ids: [7, 8] }]));
    await act(async () => { await result.current.view(); });
    expect(load).toHaveBeenCalledWith([7, 8]);
    expect(result.current.toShow).toEqual(['7', '8']);
    expect(result.current.ids).toEqual([]);
  });

  it('garde le bandeau si la lecture échoue', async () => {
    const load = vi.fn(async () => { throw new Error('réseau'); });
    const { result } = setup(load);
    act(() => publishArrivals(null, [{ entity: 'catalog_items', ids: [7] }]));
    await act(async () => { await result.current.view().catch(() => undefined); });
    expect(result.current.ids).toEqual([7]);
    expect(result.current.viewing).toBe(false);
  });

  it('« Fermer » vide le bandeau', () => {
    const { result } = setup();
    act(() => publishArrivals(null, [{ entity: 'catalog_items', ids: [7] }]));
    act(() => result.current.dismiss());
    expect(result.current.ids).toEqual([]);
  });
});
