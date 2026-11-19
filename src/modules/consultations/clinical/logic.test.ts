import { describe, expect, it } from 'vitest';
import {
  activeAllergies, addAddendum, addAntecedent, addDiagnosis, antecedentHistory, canTransition, changedSections,
  computeBmi, currentAntecedents, emptyDraft, isLocked, logRevision, progress, recordVerification, reviseAntecedent,
  signatureIssues, updateDiagnosis, vitalsOutOfRange,
} from './logic';

const ctx = (id: string, at = '2026-01-01T10:00:00.000Z', by = 'Dr Test') => ({ id, at, by });

describe('création et statuts', () => {
  it('crée un brouillon vide sans aucune donnée clinique préremplie', () => {
    const d = emptyDraft('C1');
    expect(d.status).toBe('draft');
    expect(d.diagnoses).toEqual([]);
    expect(d.antecedents).toEqual([]);
    expect(d.anamnesis.chiefComplaint).toBe('');
    expect(d.exam.vitals.weight).toBe('');
  });
  it('respecte le cycle de vie et verrouille après signature', () => {
    expect(canTransition('draft', 'inProgress')).toBe(true);
    expect(canTransition('draft', 'signed')).toBe(false);
    expect(canTransition('toValidate', 'signed')).toBe(true);
    expect(canTransition('signed', 'inProgress')).toBe(false);
    expect(isLocked('signed')).toBe(true);
    expect(isLocked('closed')).toBe(true);
    expect(isLocked('toValidate')).toBe(false);
  });
});

describe('constantes', () => {
  it('calcule l’IMC et refuse les valeurs invraisemblables', () => {
    expect(computeBmi('70', '175')).toBe(22.9);
    expect(computeBmi('70,5', '175')).toBe(23);
    expect(computeBmi('', '175')).toBeNull();
    expect(computeBmi('70', '17')).toBeNull();
    expect(computeBmi('abc', '170')).toBeNull();
  });
  it('signale les valeurs hors plage sans les modifier', () => {
    const v = { ...emptyDraft('x').exam.vitals, spo2: '250', pulse: '80' };
    expect(vitalsOutOfRange(v)).toEqual(['spo2']);
  });
});

describe('antécédents', () => {
  const base = addAntecedent([], { category: 'allergy', label: 'Pénicilline', severity: 'severe', origin: 'declared', state: 'active' }, ctx('A1'));
  it('charge les antécédents et signale les allergies actives', () => {
    expect(activeAllergies(base).map((a) => a.label)).toEqual(['Pénicilline']);
  });
  it('ne remplace jamais silencieusement : la révision conserve l’ancienne entrée, l’auteur et la date', () => {
    const revised = reviseAntecedent(base, 'A1', { state: 'resolved', origin: 'observed' }, ctx('A2', '2026-02-01T10:00:00.000Z', 'Dr Autre'));
    expect(revised).toHaveLength(2);
    expect(revised[0]?.state).toBe('active');
    expect(currentAntecedents(revised).map((a) => a.id)).toEqual(['A2']);
    expect(activeAllergies(revised)).toHaveLength(0);
    expect(antecedentHistory(revised, 'A2').map((a) => a.author)).toEqual(['Dr Test', 'Dr Autre']);
  });
  it('enregistre la vérification et les changements depuis le début de la consultation', () => {
    const draft = { ...emptyDraft('C'), antecedents: reviseAntecedent(base, 'A1', { state: 'resolved' }, ctx('A2', '2026-02-01T10:00:00.000Z')) };
    const v = recordVerification(draft, ctx('v', '2026-02-01T11:00:00.000Z'), '2026-02-01T00:00:00.000Z');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ unchanged: false, changedIds: ['A2'], by: 'Dr Test' });
    expect(recordVerification(draft, ctx('v'), '2027-01-01T00:00:00.000Z')[0]?.unchanged).toBe(true);
  });
});

describe('diagnostics', () => {
  const must = (r: ReturnType<typeof addDiagnosis>) => {
    if (!r.ok) throw new Error(r.error);
    return r.list;
  };
  it('permet plusieurs diagnostics et distingue présomptif, différentiel et confirmé', () => {
    let list = must(addDiagnosis([], { label: 'Paludisme', icd10: 'b54', type: 'principal', status: 'presumptive', comment: '' }, ctx('D1')));
    list = must(addDiagnosis(list, { label: 'Fièvre typhoïde', type: 'differential', status: 'investigating', comment: '' }, ctx('D2')));
    expect(list).toHaveLength(2);
    expect(list[0]?.icd10).toBe('B54');
    expect(addDiagnosis(list, { label: 'X', type: 'differential', status: 'confirmed', comment: '' }, ctx('D3'))).toEqual({ ok: false, error: 'differentialCannotBeConfirmed' });
  });
  it('refuse un code CIM-10 invalide, un libellé vide et un second principal', () => {
    expect(addDiagnosis([], { label: 'X', icd10: 'ZZZ9', type: 'secondary', status: 'presumptive', comment: '' }, ctx('D'))).toEqual({ ok: false, error: 'invalidIcd10' });
    expect(addDiagnosis([], { label: '  ', type: 'secondary', status: 'presumptive', comment: '' }, ctx('D'))).toEqual({ ok: false, error: 'labelRequired' });
    const one = must(addDiagnosis([], { label: 'A', type: 'principal', status: 'presumptive', comment: '' }, ctx('D1')));
    expect(addDiagnosis(one, { label: 'B', type: 'principal', status: 'presumptive', comment: '' }, ctx('D2'))).toEqual({ ok: false, error: 'principalExists' });
  });
  it('fait évoluer présomptif → confirmé en conservant l’historique, sans suppression', () => {
    const one = must(addDiagnosis([], { label: 'A', type: 'principal', status: 'presumptive', comment: 'à confirmer' }, ctx('D1')));
    const res = updateDiagnosis(one, 'D1', { status: 'confirmed', comment: 'goutte épaisse positive' }, ctx('h', '2026-01-02T10:00:00.000Z', 'Dr B'));
    if (!res.ok) throw new Error(res.error);
    expect(res.list).toHaveLength(1);
    expect(res.list[0]?.status).toBe('confirmed');
    expect(res.list[0]?.history.map((h) => h.status)).toEqual(['presumptive', 'confirmed']);
    expect(res.list[0]?.history[1]?.by).toBe('Dr B');
    expect(updateDiagnosis(res.list, 'D1', { comment: '' }, ctx('z'))).toEqual({ ok: false, error: 'noChange' });
  });
  it('écarter un diagnostic le conserve et libère le rôle de principal', () => {
    const one = must(addDiagnosis([], { label: 'A', type: 'principal', status: 'presumptive', comment: '' }, ctx('D1')));
    const res = updateDiagnosis(one, 'D1', { status: 'ruledOut', comment: 'infirmé' }, ctx('h'));
    if (!res.ok) throw new Error(res.error);
    expect(res.list).toHaveLength(1);
    expect(addDiagnosis(res.list, { label: 'B', type: 'principal', status: 'presumptive', comment: '' }, ctx('D2')).ok).toBe(true);
  });
});

describe('validation, signature, addendum et traçabilité', () => {
  const complete = () => {
    let d = emptyDraft('C', 'toValidate');
    d = { ...d, anamnesis: { ...d.anamnesis, chiefComplaint: 'Fièvre' }, conclusion: { ...d.conclusion, decision: 'Traitement ambulatoire' } };
    d = { ...d, verifications: recordVerification(d, ctx('v'), '2026-01-01T00:00:00.000Z') };
    const r = addDiagnosis([], { label: 'A', type: 'principal', status: 'presumptive', comment: '' }, ctx('D1'));
    return { ...d, diagnoses: r.ok ? r.list : [] };
  };
  it('liste ce qui manque avant la signature', () => {
    expect(signatureIssues(emptyDraft('C'))).toEqual(['chiefComplaint', 'antecedentsNotVerified', 'principalDiagnosis', 'decision']);
    expect(signatureIssues(complete())).toEqual([]);
  });
  it('calcule la progression à partir des seules données saisies', () => {
    expect(progress(emptyDraft('C')).percent).toBe(14);
    expect(progress(complete()).done).toContain('assessment');
  });
  it('n’autorise l’addendum qu’après signature et n’altère pas le contenu signé', () => {
    const open = complete();
    expect(addAddendum(open, 'note', ctx('ad'))).toBeNull();
    const signed = { ...open, status: 'signed' as const };
    const next = addAddendum(signed, ' complément ', ctx('ad'));
    expect(next?.addenda).toEqual([{ id: 'ad', at: '2026-01-01T10:00:00.000Z', by: 'Dr Test', text: 'complément' }]);
    expect(next?.conclusion).toEqual(signed.conclusion);
    expect(addAddendum(signed, '   ', ctx('ad'))).toBeNull();
  });
  it('trace les sections modifiées avec auteur et date', () => {
    const a = emptyDraft('C');
    const b = { ...a, anamnesis: { ...a.anamnesis, chiefComplaint: 'Toux' } };
    expect(changedSections(a, b)).toEqual(['anamnesis']);
    const logged = logRevision(a, b, ctx('r', '2026-03-01T08:00:00.000Z', 'Dr C'));
    expect(logged.revisions).toEqual([{ at: '2026-03-01T08:00:00.000Z', by: 'Dr C', sections: ['anamnesis'] }]);
    expect(logRevision(a, a, ctx('r')).revisions).toEqual([]);
  });
});
