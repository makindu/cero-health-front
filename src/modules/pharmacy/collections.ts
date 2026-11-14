import { defineCollection } from '@/core/local/unit-of-work';
import type { Dispensation, StockLot, StockMovement } from './pharmacy-rules';

export const PHARMACY_COLLECTIONS = {
  lots: 'health-pharmacy-lots',
  movements: 'health-pharmacy-movements',
  dispensations: 'health-pharmacy-dispensations',
} as const;

/** DONNÉES FICTIVES : lots de démonstration (aucun stock réel). Un lot périmé est inclus pour montrer qu'il n'est jamais dispensé. */
const open = (id: string, itemId: string, lotNumber: string, expiresAt: string | null, quantity: number): StockLot => ({ id, itemId, lotNumber, expiresAt, quantity });
export const LOT_SEED: StockLot[] = [
  open('lot-01', 'cat-06', 'LOT-DEMO-A1', '2027-06-30', 40),
  open('lot-02', 'cat-06', 'LOT-DEMO-A2', '2028-03-31', 60),
  open('lot-03', 'cat-06', 'LOT-DEMO-PERIME', '2024-01-31', 30),
  open('lot-04', 'cat-07', 'LOT-DEMO-B1', '2027-12-31', 25),
];
export const MOVEMENT_SEED: StockMovement[] = LOT_SEED.map((l, i) => ({
  id: `mov-seed-${i + 1}`, at: '2026-01-01T08:00:00.000Z', by: 'Démonstration', itemId: l.itemId, lotId: l.id, delta: l.quantity, kind: 'receive', reason: 'Stock initial (démo)',
}));

export const lotsRef = defineCollection<StockLot>(PHARMACY_COLLECTIONS.lots, LOT_SEED);
export const movementsRef = defineCollection<StockMovement>(PHARMACY_COLLECTIONS.movements, MOVEMENT_SEED);
export const dispensationsRef = defineCollection<Dispensation>(PHARMACY_COLLECTIONS.dispensations);
