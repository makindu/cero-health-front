import { MoneyError, decimalsOf, parseMoney } from '@/core/money/money';
import type { ApiRule } from './insurance-api';

/**
 * Règles de saisie des contrats et abonnements, sans interface : testables seules.
 * Le serveur reste l'autorité (il valide chaque champ) ; ici on évite d'envoyer une valeur illisible ou arrondie en silence.
 */
export const CATEGORIES = ['consultation', 'laboratory', 'pharmacy', 'hospitalization', 'room', 'procedure', 'nursing', 'consumable'] as const;
export const CONTRACT_STATUSES = ['active', 'suspended', 'terminated'] as const;
export const SUB_TYPES = ['individual', 'family', 'company'] as const;
export const SUB_STATUSES = ['active', 'suspended', 'cancelled'] as const;

/** Pourcentage saisi (« 80 », « 12,5 ») → points de base (0 à 10 000). Plus de 2 décimales ou hors 0–100 : refusé. */
export function percentToBp(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const bp = Math.round(Number(s) * 100);
  return bp >= 0 && bp <= 10_000 ? bp : null;
}
export const bpToPercent = (bp: number): string => String(bp / 100);

/** Montant facultatif : vide → null (pas de limite) ; illisible, négatif ou trop précis → undefined (à refuser). */
export function optionalMinor(text: string, currency: string): number | null | undefined {
  if (text.trim() === '') return null;
  try {
    const { minor } = parseMoney(text, currency);
    return minor >= 0 ? minor : undefined;
  } catch (e) {
    if (e instanceof MoneyError) return undefined;
    throw e;
  }
}
export const minorToText = (minor: number | null, currency: string): string => {
  if (minor === null) return '';
  const d = decimalsOf(currency);
  return (minor / 10 ** d).toFixed(d);
};

export interface RuleDraft {
  category: string; itemCode: string; /** Actes du catalogue visés (une règle serveur par acte, mêmes conditions) */ catalogItemIds: string[]; rate: string; negotiated: string; ceilingLine: string; quota: string; excluded: boolean; auth: boolean;
}
export const blankRule = (): RuleDraft => ({ category: '', itemCode: '', catalogItemIds: [], rate: '80', negotiated: '', ceilingLine: '', quota: '', excluded: false, auth: false });

export interface RuleBody {
  category: string | null; item_code: string | null; catalog_item_id: number | null; coverage_bp: number; excluded: boolean; negotiated_unit_minor: number | null;
  ceiling_per_line_minor: number | null; quota: number | null; requires_authorization: boolean;
}

/**
 * Une règle saisie → un corps serveur par acte choisi dans le catalogue (mêmes conditions pour chacun), ou un seul corps
 * (catégorie, règle générale ou ancien code). Null si un champ est invalide. Une règle « exclue » ne couvre rien (0 %).
 * Le quota s'applique PAR ACTE.
 */
export function ruleBodies(d: RuleDraft, currency: string): RuleBody[] | null {
  const bp = d.excluded ? 0 : percentToBp(d.rate);
  const negotiated = optionalMinor(d.negotiated, currency);
  const ceiling = optionalMinor(d.ceilingLine, currency);
  const quota = d.quota.trim() === '' ? null : Number(d.quota);
  if (bp === null || negotiated === undefined || ceiling === undefined) return null;
  if (quota !== null && (!Number.isInteger(quota) || quota < 1 || quota > 100_000)) return null;
  // Un acte choisi dans le catalogue (identifiant stable) remplace tout code saisi ; le code seul ne reste que pour les anciennes règles.
  const ids = [...new Set(d.catalogItemIds.map((i) => i.trim()).filter((i) => i !== ''))];
  const numbers = ids.map(Number);
  if (numbers.some((n) => !Number.isInteger(n) || n < 1)) return null;
  const item = ids.length > 0 ? '' : d.itemCode.trim();
  if (item !== '' && !/^[A-Za-z0-9._-]{1,40}$/.test(item)) return null;
  const make = (code: string, catalogId: number | null): RuleBody => ({
    category: d.category === '' ? null : d.category, item_code: code === '' ? null : code, catalog_item_id: catalogId, coverage_bp: bp, excluded: d.excluded,
    negotiated_unit_minor: negotiated, ceiling_per_line_minor: ceiling, quota, requires_authorization: d.auth,
  });
  return numbers.length > 0 ? numbers.map((n) => make('', n)) : [make(item, null)];
}

/** Règle visant un seul acte (ou aucun) → son corps serveur ; null si invalide ou si plusieurs actes sont choisis. */
export function ruleBody(d: RuleDraft, currency: string): RuleBody | null {
  const bodies = ruleBodies(d, currency);
  return bodies !== null && bodies.length === 1 ? (bodies[0] ?? null) : null;
}

/** Règles du serveur → règles saisies : les règles par acte aux conditions identiques sont regroupées en une seule ligne. */
export function draftsOfRules(rules: readonly ApiRule[], currency: string): RuleDraft[] {
  const out: RuleDraft[] = [];
  const groups = new Map<string, RuleDraft>();
  for (const r of rules) {
    const draft: RuleDraft = {
      category: r.category, itemCode: r.itemCode, catalogItemIds: r.catalogItemId ? [r.catalogItemId] : [], rate: bpToPercent(r.coverageBp),
      negotiated: minorToText(r.negotiatedUnitMinor, currency), ceilingLine: minorToText(r.ceilingPerLineMinor, currency),
      quota: r.quota === null ? '' : String(r.quota), excluded: r.excluded, auth: r.requiresAuthorization,
    };
    if (!r.catalogItemId) { out.push(draft); continue; }
    const key = JSON.stringify([draft.category, draft.rate, draft.negotiated, draft.ceilingLine, draft.quota, draft.excluded, draft.auth]);
    const same = groups.get(key);
    if (same) same.catalogItemIds.push(r.catalogItemId);
    else { groups.set(key, draft); out.push(draft); }
  }
  return out;
}

export interface ContractDraft {
  organizationId: string; label: string; currency: string; validFrom: string; validTo: string; status: string;
  franchise: string; ceiling: string; allowsComplementary: boolean; canBeComplementary: boolean; conditions: string;
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Corps d'un contrat, ou null si invalide. À la création : organisme et devise ; en modification : statut, et les règles seulement si elles ont été touchées (sinon on ne les remplace pas). */
export function contractBody(d: ContractDraft, rules: RuleDraft[], rulesTouched: boolean, creating: boolean): Record<string, unknown> | null {
  const franchise = optionalMinor(d.franchise, d.currency);
  const ceiling = optionalMinor(d.ceiling, d.currency);
  if (d.label.trim().length < 2 || !DAY.test(d.validFrom) || !DAY.test(d.validTo) || d.validTo < d.validFrom) return null;
  if (franchise === undefined || ceiling === undefined) return null;
  const body: Record<string, unknown> = {
    label: d.label.trim(), valid_from: d.validFrom, valid_to: d.validTo, franchise_per_episode_minor: franchise, ceiling_per_episode_minor: ceiling,
    allows_complementary: d.allowsComplementary, can_be_complementary: d.canBeComplementary, conditions: d.conditions.trim() === '' ? null : d.conditions.trim(),
  };
  if (creating) {
    if (!/^\d+$/.test(d.organizationId) || !/^[A-Za-z]{3}$/.test(d.currency)) return null;
    body.organization_id = Number(d.organizationId);
    body.currency = d.currency.toUpperCase();
  } else body.status = d.status;
  if (creating || rulesTouched) {
    const bodies = rules.map((r) => ruleBodies(r, d.currency));
    if (bodies.some((b) => b === null)) return null;
    body.rules = bodies.flatMap((b) => b ?? []);
  }
  return body;
}

export interface SubscriptionDraft {
  type: string; holderName: string; patientIds: string[]; price: string; currency: string; validFrom: string; validTo: string; status: string;
  free: string; labDiscount: string; included: string[];
}

/** Corps d'un abonnement, ou null si invalide. Les remises des autres catégories sont conservées telles quelles ; seule « laboratoire » se règle ici. */
export function subscriptionBody(d: SubscriptionDraft, otherDiscounts: Record<string, number>, creating: boolean): Record<string, unknown> | null {
  const price = optionalMinor(d.price, d.currency);
  const free = d.free.trim() === '' ? null : Number(d.free);
  const lab = d.labDiscount.trim() === '' ? 0 : percentToBp(d.labDiscount);
  if (d.holderName.trim().length < 2 || d.patientIds.length < 1 || price === undefined || price === null) return null;
  if (!DAY.test(d.validFrom) || !DAY.test(d.validTo) || d.validTo < d.validFrom || lab === null) return null;
  if (free !== null && (!Number.isInteger(free) || free < 0 || free > 999)) return null;
  if (creating && (!/^[A-Za-z]{3}$/.test(d.currency) || !(SUB_TYPES as readonly string[]).includes(d.type))) return null;
  const discounts: Record<string, number> = { ...otherDiscounts };
  if (lab > 0) discounts.laboratory = lab; else delete discounts.laboratory;
  const body: Record<string, unknown> = {
    holder_name: d.holderName.trim(), patient_ids: d.patientIds.map(Number), price_minor: price, currency: d.currency.toUpperCase(),
    valid_from: d.validFrom, valid_to: d.validTo, free_consultations: free, discounts, included_categories: d.included,
  };
  if (creating) body.type = d.type; else body.status = d.status;
  return body;
}

export const COVERAGE_KINDS = ['insurance', 'mutuelle'] as const;
/** Décisions permises depuis chaque statut (les mêmes transitions que le serveur : jamais de saut). */
const TRANSITIONS: Record<string, readonly string[]> = { pending: ['validated', 'rejected'], validated: ['suspended'], suspended: ['validated'] };
export const allowedDecisions = (status: string): readonly string[] => TRANSITIONS[status] ?? [];
/** Un rejet ou une suspension se motive (3 caractères au moins) ; une validation peut l'être. */
export const decisionOk = (status: string, note: string): boolean => (status === 'rejected' || status === 'suspended' ? note.trim().length >= 3 : true);
export const authorizationCodeOk = (code: string): boolean => /^[A-Za-z0-9._-]{1,40}$/.test(code.trim());

export interface CoverageDraft {
  organizationId: string; contractId: string; kind: string; validFrom: string; validTo: string; policy: string; card: string; member: string;
  coverageType: string; ceilingRemaining: string; priority: string; beneficiaryIds: string[];
}

/** Corps d'une couverture, ou null si invalide. À la création : identité (organisme, contrat, type, période) ; en modification : seulement carte, plafond, priorité et bénéficiaires. */
export function coverageBody(d: CoverageDraft, currency: string, creating: boolean): Record<string, unknown> | null {
  const ceiling = optionalMinor(d.ceilingRemaining, currency);
  const priority = Number(d.priority);
  if (ceiling === undefined || !Number.isInteger(priority) || priority < 1 || priority > 9 || d.beneficiaryIds.length > 30) return null;
  const opt = (s: string): string | null => (s.trim() === '' ? null : s.trim());
  if ([d.policy, d.card, d.member].some((x) => x.trim().length > 40) || d.coverageType.trim().length > 60) return null;
  const body: Record<string, unknown> = {
    policy_number: opt(d.policy), card_number: opt(d.card), member_number: opt(d.member), coverage_type: opt(d.coverageType),
    ceiling_remaining_minor: ceiling, priority, beneficiary_ids: d.beneficiaryIds.map(Number),
  };
  if (creating) {
    if (!/^\d+$/.test(d.organizationId) || !/^\d+$/.test(d.contractId) || !(COVERAGE_KINDS as readonly string[]).includes(d.kind)) return null;
    if (!DAY.test(d.validFrom) || !DAY.test(d.validTo) || d.validTo < d.validFrom) return null;
    Object.assign(body, { organization_id: Number(d.organizationId), contract_id: Number(d.contractId), kind: d.kind, valid_from: d.validFrom, valid_to: d.validTo });
  }
  return body;
}
