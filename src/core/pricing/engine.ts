import { add, money, percentOf, sub, times, zero, type Money } from '../money/money';
import {
  emptyUsage,
  type AppliedRulesSnapshot,
  type CatalogItem,
  type Contract,
  type ContractRule,
  type CoverageBundle,
  type CoverageOutcome,
  type InsurerShare,
  type PricingContext,
  type PricingResult,
  type Reason,
  type Subscription,
  type UsageDelta,
  type UsageState,
} from './types';

/** Version du moteur, conservée dans l'instantané de chaque facture (traçabilité des règles appliquées). */
export const ENGINE_VERSION = 1;

/**
 * Moteur de tarification — fonctions PURES, sans accès au stockage ni à l'interface.
 *
 * Ordre de calcul d'une ligne (docs/BUSINESS_RULES.md §4) :
 *  1. droits valides À LA DATE de la prestation (validation, période, organisme, contrat, bénéficiaire) ;
 *  2. couverture principale (désignée, sinon la plus prioritaire éligible) ; règle du contrat (prestation > catégorie > générale) ;
 *  3. tarif négocié (sinon tarif privé) ; exclusion, autorisation préalable, quota ;
 *  4. franchise, puis taux sur le tarif négocié, puis plafonds (ligne, épisode, plafond connu) ;
 *  5. couverture complémentaire UNIQUEMENT si les deux contrats l'autorisent, sur le reste à charge dans le contrat ;
 *  6. à défaut d'assurance applicable : abonnement (gratuité, catégorie incluse, réduction), jamais cumulé avec l'assurance ;
 *  7. solde à la charge du patient = montant facturable − parts organismes − part abonnement.
 * Invariant : la somme des parts est TOUJOURS égale au montant facturable (aucune part négative).
 */

const inWindow = (date: string, from: string, to?: string): boolean => date >= from && (!to || date <= to);

const specificity = (rule: ContractRule): number => (rule.itemCode ? 2 : 0) + (rule.category ? 1 : 0);

/** Règle la plus spécifique applicable à la prestation (prestation précise > catégorie > générale). */
export function matchRule(contract: Contract, item: CatalogItem): ContractRule | undefined {
  let best: ContractRule | undefined;
  for (const rule of contract.rules) {
    if (rule.itemCode && rule.itemCode !== item.code) continue;
    if (rule.category && rule.category !== item.category) continue;
    if (!best || specificity(rule) > specificity(best)) best = rule;
  }
  return best;
}

/** Motif pour lequel une couverture ne s'applique pas à cette date/ce patient ; null si elle est éligible. */
export function coverageIneligibility(bundle: CoverageBundle, patientId: string, date: string, currency: string): Reason | null {
  const { coverage, organization, contract } = bundle;
  const who = { coverage: coverage.id, organization: organization.name };
  if (coverage.status !== 'validated') return { code: `coverage.${coverage.status}`, params: who };
  if (date < coverage.validFrom) return { code: 'coverage.notStarted', params: { ...who, from: coverage.validFrom } };
  if (date > coverage.validTo) return { code: 'coverage.expired', params: { ...who, to: coverage.validTo } };
  if (organization.status !== 'active' || !inWindow(date, organization.validFrom, organization.validTo)) return { code: 'coverage.organizationInactive', params: who };
  if (contract.status !== 'active' || !inWindow(date, contract.validFrom, contract.validTo)) return { code: 'coverage.contractOutOfPeriod', params: who };
  if (coverage.patientId !== patientId && !coverage.beneficiaryIds.includes(patientId)) return { code: 'coverage.notBeneficiary', params: who };
  if (contract.currency !== currency) return { code: 'coverage.currencyMismatch', params: who };
  return null;
}

export function subscriptionIneligibility(subscription: Subscription, patientId: string, date: string): Reason | null {
  if (subscription.status !== 'active') return { code: `subscription.${subscription.status}`, params: { subscription: subscription.id } };
  if (!inWindow(date, subscription.validFrom, subscription.validTo)) {
    return { code: date < subscription.validFrom ? 'subscription.notStarted' : 'subscription.expired', params: { subscription: subscription.id } };
  }
  if (!subscription.patientIds.includes(patientId)) return { code: 'subscription.notBeneficiary', params: { subscription: subscription.id } };
  return null;
}

const quotaKey = (coverageId: string, rule: ContractRule): string => `${coverageId}|${rule.itemCode ?? rule.category ?? '*'}`;
const spent = (usage: UsageState, coverageId: string): number => usage.coverageSpent[coverageId] ?? 0;
const capMin = (values: (number | undefined)[]): number | undefined => {
  const defined = values.filter((v): v is number => v !== undefined);
  return defined.length ? Math.max(0, Math.min(...defined)) : undefined;
};
const emptyDelta = (): UsageDelta => ({ coverageSpent: {}, franchiseUsed: {}, quotaUsed: {}, freeConsultationsUsed: {} });
const bump = (target: Record<string, number>, key: string, amount: number) => {
  if (amount !== 0) target[key] = (target[key] ?? 0) + amount;
};

/** Cumule les consommations d'une ligne (pour tarifer la ligne suivante dans le même épisode). */
export function applyUsage(usage: UsageState, delta: UsageDelta): UsageState {
  const merge = (a: Record<string, number>, b: Record<string, number>) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  return {
    coverageSpent: merge(usage.coverageSpent, delta.coverageSpent),
    franchiseUsed: merge(usage.franchiseUsed, delta.franchiseUsed),
    quotaUsed: merge(usage.quotaUsed, delta.quotaUsed),
    freeConsultationsUsed: merge(usage.freeConsultationsUsed, delta.freeConsultationsUsed),
  };
}

interface Computed {
  billable: Money;
  insurer: Money;
  franchise: Money;
  ticketModerator: Money;
  /** Ce que le patient aurait encore à payer DANS le contrat après la part principale (base de la couverture complémentaire). */
  complementBase: Money;
  outcome: CoverageOutcome;
  delta: UsageDelta;
  negotiatedUnit?: number;
  ceilingBefore: { episode?: number; known?: number; line?: number };
  notes: Reason[];
}

function computeInsurance(item: CatalogItem, quantity: number, bundle: CoverageBundle, rule: ContractRule, ctx: PricingContext): Computed {
  const cur = ctx.currency;
  const { coverage, contract } = bundle;
  const notes: Reason[] = [];
  const delta = emptyDelta();

  const key = quotaKey(coverage.id, rule);
  const remainingQuota = rule.quota === undefined ? quantity : Math.max(0, rule.quota - (ctx.usage.quotaUsed[key] ?? 0));
  const coveredQty = Math.min(quantity, remainingQuota);
  if (coveredQty < quantity) notes.push({ code: 'quota.exceeded', params: { covered: coveredQty, requested: quantity } });

  const unit = rule.negotiatedUnit !== undefined ? money(rule.negotiatedUnit, cur) : item.price;
  if (rule.negotiatedUnit !== undefined) notes.push({ code: 'tariff.negotiated', params: { unit: rule.negotiatedUnit } });
  const inContract = coveredQty > 0 ? times(unit, coveredQty) : zero(cur);
  const outOfContract = quantity - coveredQty > 0 ? times(item.price, quantity - coveredQty) : zero(cur);
  const billable = add(inContract, outOfContract);

  const franchiseLeft = Math.max(0, (contract.franchisePerEpisode ?? 0) - (ctx.usage.franchiseUsed[coverage.id] ?? 0));
  const franchise = money(Math.min(inContract.minor, franchiseLeft), cur);
  if (franchise.minor > 0) notes.push({ code: 'franchise.applied', params: { amount: franchise.minor } });
  const coverable = sub(inContract, franchise);

  const raw = percentOf(coverable, rule.coverageBp);
  notes.push({ code: 'coverage.rate', params: { bp: rule.coverageBp } });

  const ceilings = {
    line: rule.ceilingPerLine,
    episode: contract.ceilingPerEpisode === undefined ? undefined : Math.max(0, contract.ceilingPerEpisode - spent(ctx.usage, coverage.id)),
    known: coverage.ceilingRemaining === undefined ? undefined : Math.max(0, coverage.ceilingRemaining - spent(ctx.usage, coverage.id)),
  };
  const cap = capMin([ceilings.line, ceilings.episode, ceilings.known]);
  let insurer = raw;
  if (cap !== undefined && cap < raw.minor) {
    insurer = money(cap, cur);
    notes.push({ code: 'ceiling.reached', params: { cap, wanted: raw.minor } });
  }
  const ticketModerator = sub(coverable, raw);
  const complementBase = sub(sub(inContract, franchise), insurer); // ticket modérateur + excédent de plafond

  bump(delta.coverageSpent, coverage.id, insurer.minor);
  bump(delta.franchiseUsed, coverage.id, franchise.minor);
  if (rule.quota !== undefined) bump(delta.quotaUsed, key, coveredQty);

  const outcome: CoverageOutcome =
    insurer.minor === 0 ? 'none' : insurer.minor === billable.minor ? 'full' : 'partial';
  return { billable, insurer, franchise, ticketModerator, complementBase, outcome, delta, negotiatedUnit: rule.negotiatedUnit, ceilingBefore: ceilings, notes };
}

export function priceLine(item: CatalogItem, quantity: number, ctx: PricingContext): PricingResult {
  const cur = ctx.currency;
  if (item.price.currency !== cur) throw new Error(`Devise de la prestation (${item.price.currency}) différente de celle du contexte (${cur})`);
  if (!(quantity > 0)) throw new Error('Quantité invalide');

  const reference = times(item.price, quantity);
  const justification: Reason[] = [];
  const insurerShares: InsurerShare[] = [];
  const delta = emptyDelta();
  let billable = reference;
  let subscriptionShare = zero(cur);
  let franchise = zero(cur);
  let ticketModerator = zero(cur);
  let basis: PricingResult['basis'] = 'private';
  let outcome: CoverageOutcome = 'none';
  let needsAuthorization = false;
  let coordination = 'none';
  const rules: AppliedRulesSnapshot = { engineVersion: ENGINE_VERSION, date: ctx.date, basis: 'private', coordination };
  const describe = (b: CoverageBundle, rule: ContractRule) => ({
    coverageId: b.coverage.id, organizationId: b.organization.id, organizationName: b.organization.name,
    contractId: b.contract.id, contractLabel: b.contract.label, policyNumber: b.coverage.policyNumber, rule: { ...rule },
  });

  if (ctx.forcePrivate) {
    justification.push({ code: 'private.forced' });
  } else {
    // 1-2. Couverture principale.
    const sorted = [...ctx.coverages].sort((a, b) => a.coverage.priority - b.coverage.priority);
    const designated = ctx.primaryCoverageId ? sorted.filter((b) => b.coverage.id === ctx.primaryCoverageId) : sorted;
    let primary: CoverageBundle | undefined;
    for (const bundle of designated) {
      const reason = coverageIneligibility(bundle, ctx.patientId, ctx.date, cur);
      if (reason) justification.push(reason);
      else if (!primary) primary = bundle;
    }
    if (ctx.primaryCoverageId && designated.length === 0) justification.push({ code: 'coverage.designatedMissing', params: { coverage: ctx.primaryCoverageId } });

    if (primary) {
      const rule = matchRule(primary.contract, item);
      if (!rule) {
        justification.push({ code: 'rule.none', params: { organization: primary.organization.name } });
      } else if (rule.excluded) {
        outcome = 'none';
        justification.push({ code: 'rule.excluded', params: { organization: primary.organization.name } });
        rules.primary = describe(primary, rule);
      } else if (rule.requiresAuthorization && !ctx.grantedAuthorizations.includes(`${primary.coverage.id}|${item.code}`)) {
        needsAuthorization = true;
        outcome = 'authorizationRequired';
        justification.push({ code: 'authorization.required', params: { organization: primary.organization.name } });
        rules.primary = describe(primary, rule);
      } else {
        const c = computeInsurance(item, quantity, primary, rule, ctx);
        billable = c.billable;
        franchise = c.franchise;
        ticketModerator = c.ticketModerator;
        outcome = c.outcome;
        justification.push(...c.notes);
        if (c.insurer.minor > 0) {
          insurerShares.push({ coverageId: primary.coverage.id, organizationId: primary.organization.id, contractId: primary.contract.id, role: 'primary', rateBp: rule.coverageBp, amount: c.insurer });
          basis = 'insurance';
          coordination = 'primary';
        }
        Object.assign(rules, { primary: describe(primary, rule), negotiatedUnit: c.negotiatedUnit, franchiseApplied: c.franchise.minor, ceilingBefore: c.ceilingBefore });
        for (const [k, v] of Object.entries(c.delta.coverageSpent)) bump(delta.coverageSpent, k, v);
        for (const [k, v] of Object.entries(c.delta.franchiseUsed)) bump(delta.franchiseUsed, k, v);
        for (const [k, v] of Object.entries(c.delta.quotaUsed)) bump(delta.quotaUsed, k, v);

        // 5. Couverture complémentaire : seulement si EXPLICITEMENT permise des deux côtés.
        if (ctx.secondaryCoverageId && c.complementBase.minor > 0) {
          const secondary = sorted.find((b) => b.coverage.id === ctx.secondaryCoverageId);
          const reason = secondary ? coverageIneligibility(secondary, ctx.patientId, ctx.date, cur) : { code: 'coverage.designatedMissing', params: { coverage: ctx.secondaryCoverageId } };
          if (!secondary || reason) {
            if (reason) justification.push(reason);
          } else if (secondary.coverage.id === primary.coverage.id) {
            justification.push({ code: 'complement.sameCoverage' });
          } else if (!primary.contract.allowsComplementary || !secondary.contract.canBeComplementary) {
            justification.push({ code: 'complement.notAllowed', params: { primary: primary.organization.name, secondary: secondary.organization.name } });
          } else {
            const rule2 = matchRule(secondary.contract, item);
            const authorized2 = !rule2?.requiresAuthorization || ctx.grantedAuthorizations.includes(`${secondary.coverage.id}|${item.code}`);
            if (!rule2 || rule2.excluded || !authorized2) {
              justification.push({ code: rule2?.excluded ? 'rule.excluded' : !authorized2 ? 'authorization.required' : 'rule.none', params: { organization: secondary.organization.name } });
            } else {
              const raw2 = percentOf(c.complementBase, rule2.coverageBp);
              const cap2 = capMin([
                rule2.ceilingPerLine,
                secondary.contract.ceilingPerEpisode === undefined ? undefined : secondary.contract.ceilingPerEpisode - spent(ctx.usage, secondary.coverage.id),
                secondary.coverage.ceilingRemaining === undefined ? undefined : secondary.coverage.ceilingRemaining - spent(ctx.usage, secondary.coverage.id),
              ]);
              const insurer2 = cap2 !== undefined && cap2 < raw2.minor ? money(cap2, cur) : raw2;
              if (insurer2.minor > 0) {
                insurerShares.push({ coverageId: secondary.coverage.id, organizationId: secondary.organization.id, contractId: secondary.contract.id, role: 'complementary', rateBp: rule2.coverageBp, amount: insurer2 });
                bump(delta.coverageSpent, secondary.coverage.id, insurer2.minor);
                rules.secondary = describe(secondary, rule2);
                coordination = 'primary+complementary';
                justification.push({ code: 'complement.applied', params: { organization: secondary.organization.name, bp: rule2.coverageBp } });
                const totalInsurer = insurerShares.reduce((s, x) => s + x.amount.minor, 0);
                outcome = totalInsurer === billable.minor ? 'full' : 'partial';
              }
            }
          }
        }
      }
    } else if (ctx.coverages.length === 0) {
      justification.push({ code: 'private.noCoverage' });
    }

    // 6. Abonnement : seulement si aucune assurance n'a pris en charge cette ligne (pas de double avantage implicite).
    const insured = insurerShares.length > 0;
    if (ctx.subscription) {
      const sub0 = ctx.subscription;
      const reason = subscriptionIneligibility(sub0, ctx.patientId, ctx.date);
      if (reason) {
        justification.push(reason);
      } else if (insured) {
        justification.push({ code: 'subscription.notStacked', params: { subscription: sub0.id } });
      } else if (!needsAuthorization) {
        let remaining = billable;
        if (sub0.includedCategories.includes(item.category)) {
          subscriptionShare = remaining;
          remaining = zero(cur);
          justification.push({ code: 'subscription.included', params: { subscription: sub0.id } });
        } else if (item.category === 'consultation' && sub0.freeConsultations !== undefined) {
          const left = Math.max(0, sub0.freeConsultations - (ctx.usage.freeConsultationsUsed[sub0.id] ?? 0));
          const freeQty = Math.min(Math.floor(quantity), left);
          if (freeQty > 0) {
            // Plafonné au montant facturable : si un tarif négocié s'applique déjà, la gratuité ne peut pas dépasser la ligne.
            const wanted = times(item.price, freeQty);
            subscriptionShare = wanted.minor > billable.minor ? billable : wanted;
            remaining = sub(billable, subscriptionShare);
            bump(delta.freeConsultationsUsed, sub0.id, freeQty);
            justification.push({ code: 'subscription.free', params: { subscription: sub0.id, used: freeQty, left: left - freeQty } });
          } else {
            justification.push({ code: 'subscription.freeExhausted', params: { subscription: sub0.id } });
          }
        }
        const discountBp = sub0.discounts[item.category];
        if (discountBp && remaining.minor > 0) {
          const discount = percentOf(remaining, discountBp);
          billable = sub(billable, discount);
          justification.push({ code: 'subscription.discount', params: { subscription: sub0.id, bp: discountBp } });
        }
        if (subscriptionShare.minor > 0 || discountBp) {
          basis = 'subscription';
          rules.subscriptionId = sub0.id;
          coordination = 'subscription';
          outcome = subscriptionShare.minor === billable.minor && billable.minor > 0 ? 'full' : subscriptionShare.minor > 0 ? 'partial' : outcome;
        }
      }
    }
  }

  if (basis === 'private' && outcome === 'none' && !justification.some((j) => j.code.startsWith('private.') || j.code.startsWith('rule.') || j.code.startsWith('coverage.') || j.code.startsWith('subscription.'))) {
    justification.push({ code: 'private.noCoverage' });
  }

  const insurerTotal = insurerShares.reduce((s, x) => s + x.amount.minor, 0);
  const patientShare = money(billable.minor - insurerTotal - subscriptionShare.minor, cur);
  if (patientShare.minor < 0 || insurerTotal + subscriptionShare.minor > billable.minor) {
    throw new Error('Invariant violé : la somme des parts dépasse le montant facturable');
  }
  const discount = money(Math.max(0, reference.minor - billable.minor), cur);
  rules.basis = basis;
  rules.coordination = coordination;
  return {
    itemCode: item.code, quantity, currency: cur, reference, billable, discount, insurerShares, subscriptionShare, patientShare,
    franchise, ticketModerator, basis, outcome, needsAuthorization, justification, rules, usageDelta: delta,
  };
}

/** Tarifie plusieurs lignes d'un même épisode en cumulant franchise, plafonds, quotas et gratuités. */
export function priceLines(lines: readonly { item: CatalogItem; quantity: number }[], ctx: PricingContext): { results: PricingResult[]; usage: UsageState } {
  let usage = ctx.usage ?? emptyUsage();
  const results: PricingResult[] = [];
  for (const line of lines) {
    const result = priceLine(line.item, line.quantity, { ...ctx, usage });
    usage = applyUsage(usage, result.usageDelta);
    results.push(result);
  }
  return { results, usage };
}
