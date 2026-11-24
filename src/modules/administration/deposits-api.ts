import { healthClient } from '@/core/api';

/**
 * Dépôts de stock (données UZISHA, via HEALTH) : liste, création avec chef, membres et leurs droits de mouvement manuel.
 * entry = entrées, withdraw = sorties, all = les deux, chief = chef du dépôt (tous les droits, un seul par dépôt).
 */
type Row = Record<string, unknown>;

export const DEPOSIT_LEVELS = ['entry', 'withdraw', 'all', 'chief'] as const;
export type DepositLevel = (typeof DEPOSIT_LEVELS)[number];

export interface DepositRow { id: string; name: string; description: string; membersCount: number; chiefName: string; myLevel: DepositLevel | '' }
export interface StockLine { serviceId: string; name: string; available: number; perPack: number; packLabel: string; baseLabel: string }

/** Produit à stock proposé à la réception, avec son conditionnement (défini dans le pricing). */
export interface StockItemHit { id: string; name: string; nature: string; unitLabel: string; baseUnitLabel: string; perUnit: number; derived: boolean }

export type ReceiveUnitValue = 'base' | 'pack' | 'derived';
export interface ReceiveUnit { value: ReceiveUnitValue; label: string; /** Unités de base contenues dans une unité reçue. */ factor: number }
export interface DepositMember { staffId: string; name: string; level: DepositLevel }
export interface MemberDraft { key: number; staffId: string; level: DepositLevel | '' }

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

export const depositFrom = (r: Row): DepositRow => ({
  id: text(r.id), name: text(r.name), description: text(r.description), membersCount: Number(r.members_count) || 0, chiefName: text(r.chief_name),
  myLevel: (DEPOSIT_LEVELS as readonly string[]).includes(text(r.my_level)) ? (text(r.my_level) as DepositLevel) : '',
});

/** Peut enregistrer une entrée de stock dans ce dépôt : niveau entry, all ou chief (le serveur revérifie). */
export const canEnterStock = (level: DepositLevel | ''): boolean => level === 'entry' || level === 'all' || level === 'chief';

export const stockLineFrom = (r: Row): StockLine => ({
  serviceId: text(r.service_id), name: text(r.name), available: Number(r.available) || 0,
  perPack: Math.max(1, Number(r.per_pack) || 1), packLabel: text(r.pack_label), baseLabel: text(r.base_label),
});

/** Le stock est compté en unité de base ; avec un conditionnement, on ajoute l'équivalent en boîtes + reste (ex. « 235 comprimé (2 boîte + 35 comprimé) »). */
export function stockText(l: StockLine): string {
  const base = l.baseLabel || '';
  const head = base ? `${l.available} ${base}` : String(l.available);
  if (l.perPack <= 1 || !l.packLabel) return head;
  const packs = Math.floor(l.available / l.perPack);
  if (packs === 0) return head;
  const rest = l.available - packs * l.perPack;
  return `${head} (${packs} ${l.packLabel}${rest > 0 ? ` + ${rest} ${base}` : ''})`;
}

export const stockItemFrom = (r: Row): StockItemHit => ({
  id: text(r.id), name: text(r.generic_name), nature: text(r.nature), unitLabel: text(r.unit_label), baseUnitLabel: text(r.base_unit_label),
  perUnit: Math.max(1, Number(r.stock_per_unit) || 1), derived: r.stock_item_id !== null && r.stock_item_id !== undefined && text(r.stock_item_id) !== text(r.id),
});

/**
 * Unités dans lesquelles ce produit peut être reçu : une unité dérivée se reçoit dans sa propre unité ; un produit principal conditionné
 * se reçoit en unité de base ou en boîte (conditionnement) ; sans conditionnement, en unité de base seulement.
 */
export function receiveUnits(item: StockItemHit, fallbackLabel: string): ReceiveUnit[] {
  if (item.derived) return [{ value: 'derived', label: item.unitLabel || fallbackLabel, factor: item.perUnit }];
  if (item.perUnit > 1) {
    return [
      { value: 'base', label: item.baseUnitLabel || fallbackLabel, factor: 1 },
      { value: 'pack', label: item.unitLabel || fallbackLabel, factor: item.perUnit },
    ];
  }
  return [{ value: 'base', label: item.unitLabel || fallbackLabel, factor: 1 }];
}

export interface EntryInput { depositId: string; catalogItemId: string; quantity: number; unit: ReceiveUnitValue; unitCost: string; expirationDate: string; reference: string }

/** Corps de l'entrée : prix, péremption et référence vides ne sont pas envoyés. */
export function entryBody(i: EntryInput): Record<string, unknown> {
  const body: Record<string, unknown> = { catalog_item_id: Number(i.catalogItemId), quantity: i.quantity };
  if (i.unit === 'pack') body.unit = 'pack';   // « base » est le défaut ; une unité dérivée se reçoit dans sa propre unité
  const cost = i.unitCost.trim().replace(',', '.');
  if (cost !== '') body.unit_cost = cost;
  if (i.expirationDate !== '') body.expiration_date = i.expirationDate;
  if (i.reference.trim() !== '') body.reference = i.reference.trim();
  return body;
}

export const memberFrom = (r: Row): DepositMember => ({
  staffId: text(r.staff_id),
  name: text(r.name),
  level: (DEPOSIT_LEVELS as readonly string[]).includes(text(r.level)) ? (text(r.level) as DepositLevel) : 'entry',
});

export type MembersProblem = 'empty' | 'incomplete' | 'duplicate' | 'noChief' | 'manyChiefs';

/** Mêmes règles que le serveur : au moins un membre, chacun avec un niveau, sans doublon, exactement un chef. */
export function membersProblem(list: readonly { staffId: string; level: string }[]): MembersProblem | null {
  if (list.length === 0) return 'empty';
  if (list.some((m) => m.staffId === '' || m.level === '')) return 'incomplete';
  if (new Set(list.map((m) => m.staffId)).size !== list.length) return 'duplicate';
  const chiefs = list.filter((m) => m.level === 'chief').length;
  if (chiefs === 0) return 'noChief';
  if (chiefs > 1) return 'manyChiefs';
  return null;
}

export const membersBody = (list: readonly { staffId: string; level: string }[]): { members: { staff_id: number; level: string }[] } => ({
  members: list.map((m) => ({ staff_id: Number(m.staffId), level: m.level })),
});

export const apiDeposits = {
  list: async (): Promise<DepositRow[]> => {
    const res = await healthClient.get<Row[]>('/stock-deposits');
    return rows(res.data).map(depositFrom);
  },
  create: async (input: { name: string; description: string; chiefStaffId: string }): Promise<void> => {
    await healthClient.post('/stock-deposits', {
      name: input.name.trim(),
      description: input.description.trim() || null,
      chief_staff_id: Number(input.chiefStaffId),
    });
  },
  stock: async (depositId: string, q: string): Promise<StockLine[]> => {
    const res = await healthClient.get<Row[]>(`/stock-deposits/${encodeURIComponent(depositId)}/stock`, { params: q.trim() ? { q: q.trim() } : {} });
    return rows(res.data).map(stockLineFrom);
  },
  searchItems: async (q: string): Promise<StockItemHit[]> => {
    const res = await healthClient.get<Row[]>('/catalog-items', { params: { q, per_page: 15, is_active: true } });
    return rows(res.data).map(stockItemFrom).filter((h) => ['medication', 'consumable', 'medical_device'].includes(h.nature));
  },
  receive: async (input: EntryInput): Promise<void> => {
    await healthClient.post(`/stock-deposits/${encodeURIComponent(input.depositId)}/entries`, entryBody(input));
  },
  members: async (depositId: string): Promise<DepositMember[]> => {
    const res = await healthClient.get<Row[]>(`/stock-deposits/${encodeURIComponent(depositId)}/members`);
    return rows(res.data).map(memberFrom);
  },
  replaceMembers: async (input: { depositId: string; members: readonly { staffId: string; level: string }[] }): Promise<void> => {
    await healthClient.put(`/stock-deposits/${encodeURIComponent(input.depositId)}/members`, membersBody(input.members));
  },
};
