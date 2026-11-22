import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/core/api', async (original) => ({ ...(await original<Record<string, unknown>>()), healthClient: client }));

import { resetReference, setReferenceForTests } from '../_shared/reference-data';
import { emptyDraft } from './clinical/logic';
import { docOf, docToText, para } from './richtext/doc';
import { addAntecedent, reviseAntecedent } from './clinical/logic';
import { antecedentFrom, contentPatch, draftFromApi, fetchDraft, vitalsBody, resetSynced, saveDraft } from './record-api';

const STAFF = [{ id: '3', userId: '12', name: 'Dr Mwamba', type: 'doctor' }];
const detail = (over: Record<string, unknown> = {}) => ({
  id: 4, patient_id: 9, status: 'inProgress', content_version: 5, signed_at: null, signed_by_user_id: null,
  content: {
    anamnesis: { chief_complaint: 'Toux', source: 'companion', history: docOf(para('3 jours')), notes: docOf() },
    exam: { not_done: false, not_done_reason: '', general_state: 'Bon' },
    plan: { orientation: 'service', orientation_target: 'Pédiatrie', follow_up_date: '2026-12-01' },
    conclusion: { text: docOf(para('Bronchite')), decision: 'Bronchite', next_appointment: '2026-12-01' },
  },
  verifications: [{ id: 1, unchanged: true, changed_ids: [], verified_by_user_id: 12, verified_at: '2026-11-21T09:00:00Z' }],
  diagnoses: [{ id: 21, label: 'Bronchite', icd10: 'J20', type: 'principal', status: 'confirmed', comment: '', author_user_id: 12, history: [{ type: 'principal', status: 'confirmed', comment: '', actor_user_id: 12, occurred_at: '2026-11-21T09:05:00Z' }] }],
  addenda: [], ...over,
});

describe('dossier clinique : correspondance avec l’API réelle', () => {
  beforeEach(() => { setReferenceForTests([], STAFF); client.get.mockReset(); client.post.mockReset(); client.patch.mockReset(); });
  afterEach(() => { resetReference(); resetSynced(); });

  it('lit le détail du serveur en brouillon', () => {
    const d = draftFromApi(detail(), [{ sections: ['anamnesis'], occurred_at: '2026-11-21T09:01:00Z', actor_user_id: 12 }]);
    expect(d).toMatchObject({ status: 'inProgress', anamnesis: { chiefComplaint: 'Toux', source: 'companion' }, exam: { generalState: 'Bon' }, plan: { orientation: 'service', followUpDate: '2026-12-01' } });
    expect(d.conclusion.decision).toBe('Bronchite');
    expect(d.diagnoses[0]).toMatchObject({ id: '21', icd10: 'J20', type: 'principal', author: 'Dr Mwamba' });
    expect(d.verifications).toHaveLength(1);
    expect(d.revisions[0]).toMatchObject({ by: 'Dr Mwamba', sections: ['anamnesis'] });
  });

  it('traduit le brouillon en contenu serveur (la décision complète reste dans le texte)', () => {
    const d = emptyDraft('4');
    d.anamnesis.chiefComplaint = ' Toux ';
    d.plan.orientation = 'ambulatory';
    d.conclusion.decision = 'x'.repeat(300);
    const patch = contentPatch(d) as { anamnesis: { chief_complaint: string }; plan: { orientation: string }; conclusion: { decision: string; text: unknown } };
    expect(patch.anamnesis.chief_complaint).toBe('Toux');
    expect(patch.plan.orientation).toBe('none');
    expect(patch.conclusion.decision).toHaveLength(255);
    expect(docToText(patch.conclusion.text)).toBe('x'.repeat(300));
  });

  it('refuse un champ trop long plutôt que de le tronquer', () => {
    const d = emptyDraft('4');
    d.anamnesis.chiefComplaint = 'y'.repeat(256);
    expect(() => contentPatch(d)).toThrow(/255/);
  });

  it('n’envoie que ce qui est nouveau ou modifié', async () => {
    client.get.mockImplementation(async (url: string) => ({ data: url.endsWith('/revisions') ? [] : detail() }));
    const d = await fetchDraft('4');
    await saveDraft('4', d);
    expect(client.patch).not.toHaveBeenCalled();
    expect(client.post).not.toHaveBeenCalled();

    client.patch.mockResolvedValue({ data: { content_version: 6 } });
    client.post.mockResolvedValue({ data: { id: 22 } });
    const next = { ...d, anamnesis: { ...d.anamnesis, chiefComplaint: 'Toux grasse' },
      diagnoses: [...d.diagnoses.map((x) => ({ ...x, status: 'ruledOut' as const })), { ...d.diagnoses[0]!, id: 'local-1', label: 'Asthme', icd10: undefined, type: 'secondary' as const }],
      verifications: [...d.verifications, { at: '', by: '', unchanged: true, changedIds: [] }] };
    await saveDraft('4', next);
    expect(client.patch).toHaveBeenCalledWith('/consultations/4/content', expect.objectContaining({ expected_version: 5 }));
    expect(client.patch).toHaveBeenCalledWith('/diagnoses/21', { type: 'principal', status: 'ruledOut', comment: null });
    expect(client.post).toHaveBeenCalledWith('/consultations/4/diagnoses', expect.objectContaining({ label: 'Asthme', type: 'secondary' }));
    expect(client.post).toHaveBeenCalledWith('/consultations/4/antecedents-verification', {});

    client.patch.mockClear(); client.post.mockClear();
    await saveDraft('4', next);
    expect(client.patch).not.toHaveBeenCalled();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('consultation signée : seul un addendum est envoyé', async () => {
    client.get.mockImplementation(async (url: string) => ({ data: url.endsWith('/revisions') ? [] : detail({ status: 'signed' }) }));
    const d = await fetchDraft('4');
    client.post.mockResolvedValue({ data: { id: 1 } });
    await saveDraft('4', { ...d, anamnesis: { ...d.anamnesis, chiefComplaint: 'Modifié' }, addenda: [{ id: 'a1', at: '', by: '', text: 'Précision' }] });
    expect(client.patch).not.toHaveBeenCalled();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith('/consultations/4/addenda', { content: docOf(para('Précision')) });
  });

  it('antecedents : lus sur le dossier du patient, ajoutés ou révisés sans jamais écraser', async () => {
    const stored = [
      { id: 31, category: 'allergy', label: 'Pénicilline', detail: null, severity: 'severe', origin: 'declared', origin_detail: null, state: 'active', supersedes_id: null, author_user_id: 12, recorded_at: '2026-11-10T08:00:00Z' },
    ];
    client.get.mockImplementation(async (url: string) => ({ data: url.includes('/antecedents') ? stored : url.endsWith('/revisions') ? [] : detail() }));
    const d = await fetchDraft('4');
    expect(client.get).toHaveBeenCalledWith('/patients/9/antecedents?history=1');
    expect(d.antecedents).toHaveLength(1);
    expect(d.antecedents[0]).toMatchObject({ id: '31', category: 'allergy', severity: 'severe', author: 'Dr Mwamba' });
    await saveDraft('4', d);
    expect(client.post).not.toHaveBeenCalled(); // rien de nouveau : rien d'envoyé

    client.post.mockResolvedValueOnce({ data: { id: 40 } }).mockResolvedValueOnce({ data: { id: 41 } });
    let list = addAntecedent(d.antecedents, { category: 'medical', label: 'Asthme', origin: 'other', originDetail: ' voisin ', state: 'active' }, { by: 'Dr', at: '2026-11-21T09:00:00Z', id: 'loc-1' });
    list = reviseAntecedent(list, 'loc-1', { state: 'resolved' }, { by: 'Dr', at: '2026-11-21T09:05:00Z', id: 'loc-2' });
    await saveDraft('4', { ...d, antecedents: list });
    expect(client.post).toHaveBeenNthCalledWith(1, '/patients/9/antecedents', expect.objectContaining({ category: 'medical', label: 'Asthme', origin: 'other', origin_detail: 'voisin', severity: null, consultation_id: 4 }));
    expect(client.post).toHaveBeenNthCalledWith(2, '/patients/9/antecedents/40/revise', expect.objectContaining({ state: 'resolved' }));

    client.post.mockClear();
    await saveDraft('4', { ...d, antecedents: list });
    expect(client.post).not.toHaveBeenCalled();
  });

  it('antecedent du serveur : source inconnue ramenée à « déclaré »', () => {
    expect(antecedentFrom({ id: 1, category: 'vaccination', label: 'BCG', origin: 'zzz', state: 'none' })).toMatchObject({ origin: 'declared', category: 'vaccination' });
  });
});

describe('vitalsBody', () => {
  it('ne garde que les mesures remplies, en nombres (virgule acceptée)', () => {
    const v = { ...emptyDraft('x').exam.vitals, temperature: '38,5', pulse: ' 90 ', spo2: 'abc' };
    expect(vitalsBody(v)).toEqual({ temperature_c: 38.5, pulse_bpm: 90 });
    expect(vitalsBody(emptyDraft('x').exam.vitals)).toEqual({});
  });
});
