import { describe, expect, it } from 'vitest';
import { money } from '@/core/money/money';
import type { CatalogItem } from '@/core/pricing/types';
import { EMPTY_DOC, docOf, docToText, para } from '../consultations/richtext/doc';
import * as V from './visit-rules';
import type { ConsumptionBilling, ConsumptionEntry } from './visit-rules';

const item = (id: string, category: CatalogItem['category'], over: Partial<CatalogItem> = {}): CatalogItem => ({ id, code: id.toUpperCase(), label: id, category, price: money(500, 'USD'), active: true, ...over });
const catalog = [item('drug', 'pharmacy'), item('dress', 'nursing'), item('room', 'room'), item('cons', 'consultation'), item('off', 'nursing', { active: false })];
const entry = (id: string, itemId: string, quantity: number, over: Partial<ConsumptionEntry> = {}): ConsumptionEntry => ({
  id, admissionId: 'a', visitId: 'v', kind: 'consumption', itemId, itemLabel: itemId, category: itemId === 'drug' ? 'pharmacy' : 'nursing', quantity, at: `2026-11-14T10:00:0${id.length}.000Z`, by: 'x', ...over,
});
const reversal = (id: string, of: string, quantity: number): ConsumptionEntry => entry(id, 'drug', quantity, { kind: 'reversal', reversesId: of, reason: 'erreur', at: '2026-11-14T11:00:00.000Z' });
const billing = (consumptionId: string, invoiceId: string): ConsumptionBilling => ({ id: `b-${consumptionId}`, admissionId: 'a', consumptionId, invoiceId, quantity: 1, discountBp: 0, stockWithdrawn: true, at: '2026-11-14T12:00:00.000Z' });
const code = (fn: () => unknown): string | undefined => { try { fn(); return undefined; } catch (e) { return (e as V.VisitError).code; } };

describe('lignes de visite', () => {
  it('accepte produits et services, une visite vide est valide', () => {
    expect(V.checkLines([{ itemId: 'drug', quantity: 3 }, { itemId: 'dress', quantity: 1 }], catalog).map((i) => i.id)).toEqual(['drug', 'dress']);
    expect(V.checkLines([], catalog)).toEqual([]);
  });
  it('refuse quantité hors bornes, doublon, prestation inconnue, inactive, chambre ou consultation', () => {
    expect(code(() => V.checkLines([{ itemId: 'drug', quantity: 0 }], catalog))).toBe('quantityInvalid');
    expect(code(() => V.checkLines([{ itemId: 'drug', quantity: 1000 }], catalog))).toBe('quantityInvalid');
    expect(code(() => V.checkLines([{ itemId: 'drug', quantity: 1.5 }], catalog))).toBe('quantityInvalid');
    expect(code(() => V.checkLines([{ itemId: 'drug', quantity: 1 }, { itemId: 'drug', quantity: 2 }], catalog))).toBe('lineDuplicate');
    for (const id of ['nope', 'off', 'room', 'cons']) expect(code(() => V.checkLines([{ itemId: id, quantity: 1 }], catalog))).toBe('itemInvalid');
    expect(code(() => V.checkLines(Array.from({ length: 31 }, (_, i) => ({ itemId: `x${i}`, quantity: 1 })), catalog))).toBe('tooManyLines');
  });
  it('un produit sort du stock, un acte non', () => {
    expect(V.isProduct('pharmacy')).toBe(true);
    expect(V.isProduct('consumable')).toBe(true);
    expect(V.isProduct('nursing')).toBe(false);
    expect(V.isProduct('procedure')).toBe(false);
  });
});

describe('registre et contre-écritures', () => {
  const none = new Set<string>();
  it('une contre-écriture réduit la quantité nette sans toucher la ligne d’origine', () => {
    const rows = V.buildLedger([entry('c1', 'drug', 5), reversal('r1', 'c1', 2)], [], none);
    const c1 = rows.find((r) => r.entry.id === 'c1')!;
    expect(c1.net).toBe(3);
    expect(c1.status).toBe('pending');
    expect(c1.entry.quantity).toBe(5);
    expect(rows.find((r) => r.entry.id === 'r1')!.status).toBe('reversal');
    expect(V.pendingLines(rows)).toEqual([{ itemId: 'drug', itemLabel: 'drug', category: 'pharmacy', quantity: 3, consumptionIds: ['c1'] }]);
  });
  it('entièrement contre-passée = non facturable', () => {
    const rows = V.buildLedger([entry('c1', 'drug', 2), reversal('r1', 'c1', 2)], [], none);
    expect(rows[0]!.status).toBe('reversed');
    expect(V.pendingLines(rows)).toEqual([]);
    expect(V.hasNetConsumption(rows)).toBe(false);
  });
  it('regroupe par prestation', () => {
    const rows = V.buildLedger([entry('c1', 'drug', 2), entry('c22', 'dress', 1), entry('c333', 'drug', 4)], [], none);
    expect(V.pendingLines(rows).map((l) => [l.itemId, l.quantity])).toEqual([['drug', 6], ['dress', 1]]);
  });
  it('facturé tant que la facture n’est pas annulée, puis libéré', () => {
    const e = [entry('c1', 'drug', 2)];
    expect(V.buildLedger(e, [billing('c1', 'inv1')], new Set(['inv1']))[0]!.status).toBe('billed');
    expect(V.buildLedger(e, [billing('c1', 'inv1')], none)[0]!.status).toBe('pending');
  });
  it('règles de contre-écriture', () => {
    const rows = V.buildLedger([entry('c1', 'drug', 5)], [], none);
    const row = rows[0];
    expect(code(() => V.checkReverse(row, { reason: '  ' }))).toBe('reasonRequired');
    expect(code(() => V.checkReverse(row, { reason: 'x'.repeat(256) }))).toBe('reasonTooLong');
    expect(code(() => V.checkReverse(row, { reason: 'x', quantity: 6 }))).toBe('overReversal');
    expect(code(() => V.checkReverse(row, { reason: 'x', quantity: 0 }))).toBe('quantityInvalid');
    expect(code(() => V.checkReverse(undefined, { reason: 'x' }))).toBe('consumptionNotFound');
    expect(V.checkReverse(row, { reason: 'x' })).toBe(5);
    expect(V.checkReverse(row, { reason: 'x', quantity: 2 })).toBe(2);
    const billed = V.buildLedger([entry('c1', 'drug', 5)], [billing('c1', 'inv1')], new Set(['inv1']))[0];
    expect(code(() => V.checkReverse(billed, { reason: 'x' }))).toBe('alreadyBilled');
    const done = V.buildLedger([entry('c1', 'drug', 2), reversal('r1', 'c1', 2)], [], none)[0];
    expect(code(() => V.checkReverse(done, { reason: 'x' }))).toBe('alreadyReversed');
  });
});

describe('réduction', () => {
  it('droit, motif, plafond', () => {
    expect(V.checkDiscount({}, false)).toBe(0);
    expect(V.checkDiscount({ bp: 0 }, false)).toBe(0);
    expect(code(() => V.checkDiscount({ bp: 1000, reason: 'geste' }, false))).toBe('discountForbidden');
    expect(code(() => V.checkDiscount({ bp: 1000 }, true))).toBe('discountReasonRequired');
    expect(code(() => V.checkDiscount({ bp: 6000, reason: 'trop' }, true))).toBe('discountTooHigh');
    expect(code(() => V.checkDiscount({ bp: -1, reason: 'x' }, true))).toBe('discountInvalid');
    expect(code(() => V.checkDiscount({ bp: 10001, reason: 'x' }, true))).toBe('discountInvalid');
    expect(V.checkDiscount({ bp: 2000, reason: 'démuni' }, true)).toBe(2000);
    expect(V.checkDiscount({ bp: 8000, reason: 'ok' }, true, 10000)).toBe(8000);
  });
  it('prix unitaire réduit, demi vers le haut', () => {
    expect(V.discountedUnit(500, 2000)).toBe(400);
    expect(V.discountedUnit(700, 2000)).toBe(560);
    expect(V.discountedUnit(333, 5000)).toBe(167);
    expect(V.discountedUnit(500, 0)).toBe(500);
    expect(V.discountedUnit(500, 10000)).toBe(0);
  });
});

describe('volet clinique de la visite', () => {
  const D = (text: string) => docOf(para(text));
  const full: V.VisitClinicalInput = {
    complaints: { none: false, text: D('Toux depuis hier') },
    examination: { evolution: 'improved', text: D('Auscultation plus claire') },
    diagnosis: ' Bronchite en amélioration ',
    plan: { treatment: 'continue', labs: true, discharge: false, note: D('Contrôle CRP') },
  };
  const code = (fn: () => unknown): string | undefined => { try { fn(); } catch (e) { return e instanceof V.VisitError ? e.code : 'other'; } return undefined; };

  it('conserve les quatre étapes (documents riches filtrés, diagnostic nettoyé)', () => {
    const c = V.checkClinical(full, true)!;
    expect(c.complaints).toEqual({ none: false, text: D('Toux depuis hier') });
    expect(c.examination).toEqual({ evolution: 'improved', text: D('Auscultation plus claire') });
    expect(c.diagnosis).toBe('Bronchite en amélioration');
    expect(c.plan).toEqual({ treatment: 'continue', labs: true, discharge: false, note: D('Contrôle CRP') });
  });
  it('texte riche : mise en forme conservée, balises ou nœuds inconnus supprimés', () => {
    const doc = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Fièvre', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
      { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
    ] };
    const c = V.checkClinical({ complaints: { none: false, text: doc as unknown as V.RichInput } }, false)!;
    expect(JSON.stringify(c.complaints!.text)).toBe(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fièvre', marks: [{ type: 'bold' }] }] }] }));
  });
  it('un ancien texte simple reste accepté et converti en document', () => {
    expect(V.checkClinical({ complaints: { none: false, text: 'Toux\nFièvre' } }, false)!.complaints!.text).toEqual(docOf(para('Toux'), para('Fièvre')));
    expect(docToText(V.toDoc('abc'))).toBe('abc');
  });
  it('rien de saisi : pas de volet clinique', () => {
    expect(V.checkClinical(undefined, true)).toBeUndefined();
    expect(V.checkClinical({}, true)).toBeUndefined();
  });
  it('« aucune plainte » est une réponse valide, un texte vide ne l’est pas', () => {
    expect(V.checkClinical({ complaints: { none: true, text: D('ignoré') } }, false)!.complaints).toEqual({ none: true, text: EMPTY_DOC });
    expect(code(() => V.checkClinical({ complaints: { none: false, text: EMPTY_DOC } }, false))).toBe('complaintsRequired');
    expect(code(() => V.checkClinical({ complaints: { none: false, text: '  ' } }, false))).toBe('complaintsRequired');
  });
  it('examen, diagnostic et plan exigent le droit clinique ; les plaintes non', () => {
    expect(V.checkClinical({ complaints: { none: true, text: '' } }, false)).toBeDefined();
    expect(code(() => V.checkClinical({ examination: full.examination }, false))).toBe('clinicalForbidden');
    expect(code(() => V.checkClinical({ diagnosis: 'x' }, false))).toBe('clinicalForbidden');
  });
  it('enchaînement : pas de diagnostic sans examen, pas de plan sans diagnostic', () => {
    expect(code(() => V.checkClinical({ diagnosis: 'Paludisme' }, true))).toBe('diagnosisNeedsExamination');
    expect(code(() => V.checkClinical({ examination: full.examination, plan: full.plan }, true))).toBe('planNeedsDiagnosis');
  });
  it('champs obligatoires et bornes', () => {
    expect(code(() => V.checkClinical({ examination: { evolution: 'stable', text: EMPTY_DOC } }, true))).toBe('examinationRequired');
    expect(code(() => V.checkClinical({ examination: { evolution: 'nope' as V.Evolution, text: D('x') } }, true))).toBe('evolutionInvalid');
    expect(code(() => V.checkClinical({ examination: full.examination, diagnosis: '  ' }, true))).toBe('diagnosisRequired');
    expect(code(() => V.checkClinical({ examination: full.examination, diagnosis: 'x'.repeat(V.MAX_DIAGNOSIS + 1) }, true))).toBe('textTooLong');
    expect(code(() => V.checkClinical({ complaints: { none: false, text: D('x'.repeat(V.MAX_CLINICAL_TEXT + 1)) } }, true))).toBe('textTooLong');
  });
  it('plan : au moins une décision, traitement dans la liste', () => {
    const base = { examination: full.examination, diagnosis: 'Paludisme' };
    expect(code(() => V.checkClinical({ ...base, plan: { labs: false, discharge: false, note: D('seule note') } }, true))).toBe('planEmpty');
    expect(code(() => V.checkClinical({ ...base, plan: { treatment: 'x' as V.TreatmentDecision, labs: false, discharge: false, note: EMPTY_DOC } }, true))).toBe('treatmentInvalid');
    expect(V.checkClinical({ ...base, plan: { treatment: 'stop', labs: false, discharge: true, note: EMPTY_DOC } }, true)!.plan).toEqual({ treatment: 'stop', labs: false, discharge: true, note: EMPTY_DOC });
    expect(V.checkClinical({ ...base, plan: { labs: true, discharge: false, note: EMPTY_DOC } }, true)!.plan!.treatment).toBeUndefined();
  });
});
