import { describe, expect, it } from 'vitest';
import * as R from './lab-rules';
import type { LabOrder, LabResultValue } from './lab-rules';

const tests = [
  { code: 'LAB-NFS', label: 'NFS', catalogItemId: 'c1' },
  { code: 'LAB-GLY', label: 'Glycémie', catalogItemId: 'c2' },
];
const make = (): LabOrder => R.buildOrder({ id: 'l1', number: 'LAB-2026-00001', patientId: 'p', patientName: 'P', tests, priority: 'routine', clinicalNote: ' fièvre ', by: 'doc', now: '2026-11-14T08:00:00Z', invoiceId: 'inv' });
const unpaid: R.PaymentGate = { patientBalance: 1000, creditAuthorized: false, cancelledInvoice: false };
const paid: R.PaymentGate = { ...unpaid, patientBalance: 0 };
const val = (code: string, value: string): LabResultValue => ({ code, value, unit: ' g/L ', referenceRange: '', flag: 'unspecified', comment: '' });
const code = (fn: () => unknown): string | undefined => { try { fn(); } catch (e) { return (e as R.LabError).code; } };
const inProgress = (): LabOrder => R.start(R.collect(make(), { by: 't', now: 'n', sampleNote: '' }, paid), { by: 't', now: 'n' });

describe('règles du laboratoire', () => {
  it('refuse une demande vide ou avec doublon', () => {
    expect(code(() => R.buildOrder({ ...{ id: 'x', number: 'n', patientId: 'p', patientName: 'P', priority: 'routine', clinicalNote: '', by: 'a', now: 'n', invoiceId: 'i' }, tests: [] }))).toBe('testsRequired');
    expect(code(() => R.buildOrder({ id: 'x', number: 'n', patientId: 'p', patientName: 'P', priority: 'routine', clinicalNote: '', by: 'a', now: 'n', invoiceId: 'i', tests: [tests[0]!, tests[0]!] }))).toBe('duplicateTest');
  });
  it('numérote par année', () => {
    expect(R.nextLabNumber([], 2026)).toBe('LAB-2026-00001');
    expect(R.nextLabNumber([{ number: 'LAB-2026-00007' }, { number: 'LAB-2025-00099' }], 2026)).toBe('LAB-2026-00008');
  });
  it('bloque le prélèvement tant que la part patient est due', () => {
    expect(code(() => R.collect(make(), { by: 't', now: 'n', sampleNote: '' }, unpaid))).toBe('paymentRequired');
  });
  it('autorise le prélèvement payé, à crédit autorisé ou avec exception tracée', () => {
    expect(R.collect(make(), { by: 't', now: 'n', sampleNote: '' }, paid).status).toBe('collected');
    expect(R.collect(make(), { by: 't', now: 'n', sampleNote: '' }, { ...unpaid, creditAuthorized: true }).status).toBe('collected');
    const ex = R.grantException(make(), { by: 'adm', now: 'n', reason: ' urgence vitale ' });
    expect(ex.paymentException?.reason).toBe('urgence vitale');
    expect(R.collect(ex, { by: 't', now: 'n', sampleNote: '' }, unpaid).status).toBe('collected');
  });
  it('une facture annulée ne débloque jamais le prélèvement, même avec exception', () => {
    const ex = R.grantException(make(), { by: 'adm', now: 'n', reason: 'x' });
    expect(code(() => R.collect(ex, { by: 't', now: 'n', sampleNote: '' }, { ...paid, cancelledInvoice: true }))).toBe('paymentRequired');
  });
  it('l\'exception exige un motif et ne se double pas', () => {
    expect(code(() => R.grantException(make(), { by: 'a', now: 'n', reason: '  ' }))).toBe('reasonRequired');
    expect(code(() => R.grantException(R.grantException(make(), { by: 'a', now: 'n', reason: 'x' }), { by: 'a', now: 'n', reason: 'y' }))).toBe('exceptionExists');
  });
  it('impose l\'ordre des étapes', () => {
    expect(code(() => R.start(make(), { by: 't', now: 'n' }))).toBe('wrongStatus');
    expect(code(() => R.validate(inProgress(), { by: 'v', now: 'n' }))).toBe('wrongStatus');
    expect(code(() => R.enterResults(make(), [val('LAB-NFS', '1')], { by: 't', now: 'n' }))).toBe('wrongStatus');
  });
  it('un résultat partiel reste en cours ; complet → saisi ; valeurs nettoyées, rien d\'inventé', () => {
    const part = R.enterResults(inProgress(), [val('LAB-NFS', ' 12 ')], { by: 't', now: 'n' });
    expect(part.status).toBe('inProgress');
    expect(part.results[0]!.value).toBe('12');
    expect(part.results[0]!.unit).toBe('g/L');
    const full = R.enterResults(part, [val('LAB-NFS', '12'), val('LAB-GLY', '5')], { by: 't', now: 'n2' });
    expect(full.status).toBe('resultEntered');
    expect(full.resultsEnteredBy?.by).toBe('t');
    expect(R.enterResults(inProgress(), [], { by: 't', now: 'n' }).results).toEqual([]);
  });
  it('refuse un examen inconnu de la demande', () => {
    expect(code(() => R.enterResults(inProgress(), [val('LAB-XXX', '1')], { by: 't', now: 'n' }))).toBe('unknownTest');
  });
  it('valide, puis rectifie en conservant l\'ancien résultat', () => {
    const entered = R.enterResults(inProgress(), [val('LAB-NFS', '12'), val('LAB-GLY', '5')], { by: 't', now: 'n' });
    const ok = R.validate(entered, { by: 'v', now: 'n' });
    expect(ok.status).toBe('validated');
    expect(code(() => R.amend(ok, [val('LAB-NFS', '13'), val('LAB-GLY', '5')], { by: 'v', now: 'n', reason: ' ' }))).toBe('reasonRequired');
    expect(code(() => R.amend(ok, [val('LAB-NFS', '13')], { by: 'v', now: 'n', reason: 'erreur' }))).toBe('incompleteResults');
    const am = R.amend(ok, [val('LAB-NFS', '13'), val('LAB-GLY', '5')], { by: 'v', now: 'n', reason: 'erreur de saisie' });
    expect(am.results[0]!.value).toBe('13');
    expect(am.amendments).toHaveLength(1);
    expect(am.amendments[0]!.previous[0]!.value).toBe('12');
    expect(code(() => R.amend(entered, [], { by: 'v', now: 'n', reason: 'x' }))).toBe('wrongStatus');
  });
  it('permet de rouvrir la saisie avant validation seulement', () => {
    const entered = R.enterResults(inProgress(), [val('LAB-NFS', '12'), val('LAB-GLY', '5')], { by: 't', now: 'n' });
    expect(R.reopenResults(entered).status).toBe('inProgress');
    expect(code(() => R.reopenResults(R.validate(entered, { by: 'v', now: 'n' })))).toBe('wrongStatus');
  });
  it('n\'annule qu\'avant le prélèvement, avec motif', () => {
    expect(code(() => R.cancel(make(), { by: 'a', now: 'n', reason: '', refundPending: false }))).toBe('reasonRequired');
    const c = R.cancel(make(), { by: 'a', now: 'n', reason: 'doublon', refundPending: true });
    expect(c.status).toBe('cancelled');
    expect(c.cancellation?.refundPending).toBe(true);
    expect(code(() => R.cancel(c, { by: 'a', now: 'n', reason: 'x', refundPending: false }))).toBe('alreadyCancelled');
    expect(code(() => R.cancel(R.collect(make(), { by: 't', now: 'n', sampleNote: '' }, paid), { by: 'a', now: 'n', reason: 'x', refundPending: false }))).toBe('cannotCancelAfterCollect');
  });
});
