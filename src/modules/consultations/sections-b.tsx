import { Download, Link2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { NewLabOrderDialog } from '../laboratory/NewLabOrderDialog';
import { LabStatusBadge } from '../laboratory/LabStatusBadge';
import { LAB_AVAILABLE, useLabOrders } from '../laboratory/use-lab';
import { NewRxDialog } from '../prescriptions/NewRxDialog';
import { RxStatusBadge } from '../prescriptions/RxStatusBadge';
import { RX_AVAILABLE, useRxList } from '../prescriptions/use-rx';
import { SuggestInput } from '@/components/forms/suggest-input';
import { FormField } from '@/components/forms/form-field';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { AreaField, Panel, RichField, SelectField, TextField } from './clinical/fields';
import { addDiagnosis, computeBmi, principalDiagnosis, updateDiagnosis, vitalsOutOfRange, type DiagnosisError } from './clinical/logic';
import { EMPTY_VITALS, type ConsultationDraft, type DiagnosisStatus, type DiagnosisType, type Vitals } from './clinical/model';
import { ICD10_SUGGESTIONS } from './clinical/icd10';
import { newCtx } from './sections-a';
import { buildClinicalSummary, summaryToDoc } from './summary';
import { isEmptyDoc } from './richtext/doc';
import { latestReadingOn, useApiPatientVitals, useLocalTriageVitals, type TriageReading } from './triage-vitals';
import { env } from '@/core/config/env';

type Update = (fn: (d: ConsultationDraft) => ConsultationDraft) => void;
const VITAL_KEYS = ['systolic', 'diastolic', 'pulse', 'temperature', 'respiratoryRate', 'spo2', 'weight', 'height', 'brachialPerimeter', 'headCircumference'] as const;

// ───────────── D. Examen clinique ─────────────
/** Prises de constantes du patient (triage), les plus récentes d'abord, avec reprise manuelle. */
function LocalTriageList({ readings, onImport, readOnly }: { readings: readonly TriageReading[]; onImport: (v: Partial<Vitals>) => void; readOnly: boolean }) {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  if (readings.length === 0) return <p className="text-sm text-muted-foreground">{t('clinical.exam.noTriageVitals')}</p>;
  return (
    <ul className="space-y-2">
      {[...readings].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 5).map((r) => (
        <li key={r.id} className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium">{f.dateTime(r.recordedAt)} · {r.author}</p>
          <p className="text-muted-foreground">{VITAL_KEYS.filter((k) => r.values[k]).map((k) => `${t(`clinical.exam.vitals.${k}`)}: ${r.values[k]}`).join(' · ')}</p>
          {!readOnly && <Button size="sm" variant="outline" leftIcon={<Download className="size-4" />} onClick={() => onImport(r.values)}>{t('clinical.exam.importTriage')}</Button>}
        </li>
      ))}
    </ul>
  );
}

export function ExamSection({ draft, update, readOnly, triageEntryId, patientId, day }: { draft: ConsultationDraft; update: Update; readOnly: boolean; triageEntryId?: string; patientId: string; day: string }) {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  const e = draft.exam;
  const local = useLocalTriageVitals(patientId, triageEntryId);
  const remote = useApiPatientVitals(patientId);
  const readings = (env.localMode ? local.data : remote.data) ?? [];
  const latest = latestReadingOn(readings, day);
  const untouched = VITAL_KEYS.every((k) => !e.vitals[k]);
  // Les constantes déjà prises au triage ce jour-là sont reprises UNE fois, sans écraser une saisie ; le médecin peut les corriger.
  useEffect(() => {
    if (readOnly || e.notDone || !latest || e.triageImportedId || !untouched) return;
    update((d) => ({ ...d, exam: { ...d.exam, vitals: { ...EMPTY_VITALS, ...d.exam.vitals, ...latest.values }, triageImportedId: latest.id } }));
  }, [readOnly, e.notDone, latest, e.triageImportedId, untouched, update]);
  const prefilled = e.triageImportedId ? readings.find((r) => r.id === e.triageImportedId) : undefined;
  const set = <K extends keyof typeof e>(key: K, value: (typeof e)[K]) => update((d) => ({ ...d, exam: { ...d.exam, [key]: value } }));
  const setVital = (key: keyof Vitals, value: string) => set('vitals', { ...e.vitals, [key]: value });
  const bmi = computeBmi(e.vitals.weight, e.vitals.height);
  const odd = vitalsOutOfRange(e.vitals);
  const units: Record<keyof Vitals, string> = { systolic: 'mmHg', diastolic: 'mmHg', pulse: '/min', temperature: '°C', respiratoryRate: '/min', spo2: '%', weight: 'kg', height: 'cm', brachialPerimeter: 'cm', headCircumference: 'cm' };
  const importTriage = (v: Partial<Vitals>) => set('vitals', { ...EMPTY_VITALS, ...e.vitals, ...Object.fromEntries(VITAL_KEYS.filter((k) => v[k]).map((k) => [k, String(v[k])])) });
  return (
    <div className="space-y-4">
      <Panel title={t('clinical.exam.notDoneTitle')}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={e.notDone} disabled={readOnly} onChange={(ev) => set('notDone', ev.target.checked)} />
          {t('clinical.exam.notDone')}
        </label>
        {e.notDone && <AreaField label={t('clinical.exam.notDoneReason')} rows={2} value={e.notDoneReason} onChange={(v) => set('notDoneReason', v)} disabled={readOnly} />}
      </Panel>
      {!e.notDone && (
        <>
          <Panel title={t('clinical.exam.triageTitle')}>
            <LocalTriageList readings={readings} onImport={importTriage} readOnly={readOnly} />
          </Panel>
          <Panel title={t('clinical.exam.vitalsTitle')}>
            <p className="text-xs text-muted-foreground">{t('clinical.exam.vitalsHint')}</p>
            {prefilled && <p className="rounded-md bg-info-soft px-3 py-2 text-sm">{t('clinical.exam.prefilled', { when: f.dateTime(prefilled.recordedAt), author: prefilled.author })}</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {VITAL_KEYS.map((k) => (
                <TextField key={k} type="number" label={`${t(`clinical.exam.vitals.${k}`)} (${units[k]})`} value={e.vitals[k]} onChange={(v) => setVital(k, v)} disabled={readOnly} />
              ))}
            </div>
            <p className="text-sm"><span className="font-medium">{t('clinical.exam.bmi')} :</span> {bmi === null ? t('clinical.exam.bmiNone') : `${bmi} kg/m²`}</p>
            {odd.length > 0 && (
              <p role="alert" className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">
                <TriangleAlert aria-hidden className="size-4" />
                {t('clinical.exam.outOfRange', { fields: odd.map((k) => t(`clinical.exam.vitals.${k}`)).join(', ') })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t('clinical.exam.vitalsSource')}</p>
          </Panel>
          <SelectField label={t('clinical.exam.generalState')} value={e.generalState} onChange={(v) => set('generalState', v)} disabled={readOnly}
            options={['', 'good', 'altered', 'severe'].map((s) => ({ value: s, label: s ? t(`clinical.exam.states.${s}`) : t('clinical.notAssessed') }))} />
          <RichField label={t('clinical.exam.physical')} target="exam" value={e.physical} onChange={(v) => set('physical', v)} disabled={readOnly} />
        </>
      )}
    </div>
  );
}

// ───────────── E. Évaluation et diagnostics ─────────────
const STATUS_TONE: Record<DiagnosisStatus, StatusTone> = { presumptive: 'warning', confirmed: 'success', ruledOut: 'neutral', investigating: 'info' };
const TYPES: DiagnosisType[] = ['principal', 'secondary', 'differential'];
const STATUSES: DiagnosisStatus[] = ['presumptive', 'investigating', 'confirmed', 'ruledOut'];

export function AssessmentSection({ draft, update, readOnly, author }: { draft: ConsultationDraft; update: Update; readOnly: boolean; author: string }) {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  const [form, setForm] = useState({ label: '', icd10: '', type: 'principal' as DiagnosisType, status: 'presumptive' as DiagnosisStatus, comment: '' });
  const [error, setError] = useState<DiagnosisError | null>(null);
  const [evolving, setEvolving] = useState<{ id: string; status: DiagnosisStatus; type: DiagnosisType; comment: string } | null>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);

  function add() {
    const res = addDiagnosis(draft.diagnoses, form, newCtx(author));
    if (!res.ok) return setError(res.error);
    update((d) => ({ ...d, diagnoses: res.list }));
    setError(null);
    setForm({ ...form, label: '', icd10: '', comment: '', type: 'secondary' });
  }
  function evolve() {
    if (!evolving) return;
    const res = updateDiagnosis(draft.diagnoses, evolving.id, { status: evolving.status, type: evolving.type, comment: evolving.comment }, newCtx(author));
    if (!res.ok) return setError(res.error);
    update((d) => ({ ...d, diagnoses: res.list }));
    setError(null);
    setEvolving(null);
  }
  const principal = principalDiagnosis(draft.diagnoses);
  return (
    <div className="space-y-4">
      <p role="note" className="rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink">{t('clinical.assessment.noAi')}</p>
      <datalist id="icd10-list">
        {ICD10_SUGGESTIONS.map((c) => <option key={c.code} value={c.code}>{c.title}</option>)}
      </datalist>
      <Panel title={t('clinical.assessment.title')}>
        {draft.diagnoses.length === 0 && <p className="text-sm text-muted-foreground">{t('clinical.assessment.empty')}</p>}
        <ul className="space-y-2">
          {draft.diagnoses.map((d) => (
            <li key={d.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{d.label}{d.icd10 ? ` · ${d.icd10}` : ''}</p>
                <span className="flex flex-wrap gap-1.5">
                  <StatusBadge tone={d.type === 'principal' ? 'info' : 'neutral'}>{t(`clinical.assessment.types.${d.type}`)}</StatusBadge>
                  <StatusBadge tone={STATUS_TONE[d.status]}>{t(`clinical.assessment.statuses.${d.status}`)}</StatusBadge>
                </span>
              </div>
              {d.comment && <p className="mt-1 text-muted-foreground">{d.comment}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{t('clinical.history.recordedBy', { by: d.author, when: f.dateTime(d.createdAt) })}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!readOnly && <Button size="sm" variant="outline" onClick={() => setEvolving({ id: d.id, status: d.status, type: d.type, comment: '' })}>{t('clinical.assessment.evolve')}</Button>}
                {d.history.length > 1 && <Button size="sm" variant="ghost" onClick={() => setShowHistory(showHistory === d.id ? null : d.id)}>{t('clinical.history.versions')}</Button>}
              </div>
              {showHistory === d.id && (
                <ol className="mt-2 space-y-1 border-s-2 border-border ps-3 text-xs">
                  {d.history.map((h, i) => (
                    <li key={i}>{f.dateTime(h.at)} · {h.by} · {t(`clinical.assessment.types.${h.type}`)} / {t(`clinical.assessment.statuses.${h.status}`)}{h.comment ? ` — ${h.comment}` : ''}</li>
                  ))}
                </ol>
              )}
              {evolving?.id === d.id && (
                <div className="mt-3 grid gap-3 rounded-md bg-surface-muted p-3 sm:grid-cols-2">
                  <SelectField label={t('clinical.assessment.status')} value={evolving.status} onChange={(v) => setEvolving({ ...evolving, status: v as DiagnosisStatus })} options={STATUSES.map((s) => ({ value: s, label: t(`clinical.assessment.statuses.${s}`) }))} />
                  <SelectField label={t('clinical.assessment.type')} value={evolving.type} onChange={(v) => setEvolving({ ...evolving, type: v as DiagnosisType })} options={TYPES.map((s) => ({ value: s, label: t(`clinical.assessment.types.${s}`) }))} />
                  <AreaField className="sm:col-span-2" rows={2} label={t('clinical.assessment.reason')} hint={t('clinical.assessment.reasonHint')} value={evolving.comment} onChange={(v) => setEvolving({ ...evolving, comment: v })} />
                  <div className="flex gap-2 sm:col-span-2"><Button onClick={evolve}>{t('clinical.assessment.recordChange')}</Button><Button variant="ghost" onClick={() => setEvolving(null)}>{t('clinical.cancel')}</Button></div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-sm text-danger-ink">{t(`clinical.assessment.errors.${error}`)}</p>}
      </Panel>
      {!readOnly && (
        <Panel title={t('clinical.assessment.addTitle')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField className="sm:col-span-2" label={t('clinical.assessment.label')} value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
            <TextField label={t('clinical.assessment.icd10')} hint={t('clinical.assessment.icd10Hint')} list="icd10-list" value={form.icd10} onChange={(v) => setForm({ ...form, icd10: v })} />
            <SelectField label={t('clinical.assessment.type')} value={form.type} onChange={(v) => setForm({ ...form, type: v as DiagnosisType })} options={TYPES.map((s) => ({ value: s, label: t(`clinical.assessment.types.${s}`) }))} />
            <SelectField label={t('clinical.assessment.status')} value={form.status} onChange={(v) => setForm({ ...form, status: v as DiagnosisStatus })} options={STATUSES.map((s) => ({ value: s, label: t(`clinical.assessment.statuses.${s}`) }))} />
            <AreaField label={t('clinical.assessment.comment')} rows={2} value={form.comment} onChange={(v) => setForm({ ...form, comment: v })} />
          </div>
          <Button onClick={add} disabled={form.label.trim() === ''}>{t('clinical.assessment.add')}</Button>
        </Panel>
      )}
      <p className="text-sm">{principal ? t('clinical.assessment.principalIs', { label: principal.label, status: t(`clinical.assessment.statuses.${principal.status}`) }) : t('clinical.assessment.noPrincipal')}</p>
      <RichField label={t('clinical.assessment.evaluation')} target="assessment" value={draft.evaluation} onChange={(v) => update((d) => ({ ...d, evaluation: v }))} disabled={readOnly} />
    </div>
  );
}

/** Examens et ordonnances créés depuis CETTE consultation (lien `consultationId`) : preuve que la demande est rattachée à la fiche. */
function LinkedOrders({ consultationId }: { consultationId?: string }) {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  const labs = useLabOrders();
  const rxs = useRxList();
  if (!consultationId) return null;
  const myLabs = (labs.data ?? []).filter((v) => v.order.consultationId === consultationId);
  const myRx = (rxs.data ?? []).filter((r) => r.consultationId === consultationId);
  return (
    <Panel title={t('clinical.plan.linked.title')}>
      <p className="text-xs text-muted-foreground">{t('clinical.plan.linked.hint')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-sm font-medium">{t('clinical.plan.linked.labs')}</h4>
          {myLabs.length === 0 ? <p className="text-sm text-muted-foreground">{t('clinical.plan.linked.noLabs')}</p> : (
            <ul className="space-y-2">
              {myLabs.map((v) => (
                <li key={v.order.id} className="rounded-md border border-border p-2 text-sm">
                  <p className="flex flex-wrap items-center gap-2"><code className="text-xs">{v.order.number}</code><LabStatusBadge status={v.order.status} /><span className="text-xs text-muted-foreground">{f.dateTime(v.order.requestedAt)}</span></p>
                  <p className="text-muted-foreground">{v.order.tests.map((x) => x.label).join(', ')}</p>
                  {v.order.status === 'validated' && (
                    <Can permission={PERMISSIONS.laboratory.view}>
                      <p className="mt-1 text-xs font-medium text-success-ink">{t('clinical.plan.linked.resultReady')}{v.order.validation ? ` · ${t('clinical.plan.linked.validatedBy', { by: v.order.validation.by, at: f.dateTime(v.order.validation.at) })}` : ''}</p>
                      <table className="mt-1 w-full text-sm">
                        <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start">{t('clinical.plan.linked.test')}</th><th className="text-start">{t('clinical.plan.linked.value')}</th><th className="text-start">{t('clinical.plan.linked.range')}</th><th className="text-start">{t('clinical.plan.linked.flag')}</th></tr></thead>
                        <tbody>
                          {v.order.results.map((r) => (
                            <tr key={r.code} className="border-t border-border align-top">
                              <td className="py-1">{v.order.tests.find((x) => x.code === r.code)?.label ?? r.code}</td>
                              <td className="tabular-nums">{r.value} {r.unit}</td>
                              <td>{r.referenceRange || '—'}</td>
                              <td className={r.flag === 'abnormal' ? 'font-medium text-danger-ink' : ''}>{r.flag === 'unspecified' ? '—' : t(`clinical.plan.linked.flags.${r.flag}`)}{r.comment ? ` · ${r.comment}` : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Can>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-sm font-medium">{t('clinical.plan.linked.rx')}</h4>
          {myRx.length === 0 ? <p className="text-sm text-muted-foreground">{t('clinical.plan.linked.noRx')}</p> : (
            <ul className="space-y-2">
              {myRx.map((r) => (
                <li key={r.id} className="rounded-md border border-border p-2 text-sm">
                  <p className="flex flex-wrap items-center gap-2"><code className="text-xs">{r.number}</code><RxStatusBadge status={r.status} /><span className="text-xs text-muted-foreground">{f.dateTime(r.prescribedAt)}</span></p>
                  <p className="text-muted-foreground">{r.items.map((x) => `${x.label} (${x.quantity})`).join(', ')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ───────────── F. Conduite à tenir ─────────────
export function PlanSection({ draft, update, readOnly, patientId, consultationId }: { draft: ConsultationDraft; update: Update; readOnly: boolean; patientId?: string; consultationId?: string }) {
  const { t } = useTranslation('consultations');
  const [ordering, setOrdering] = useState<'lab' | 'rx' | null>(null);
  const p = draft.plan;
  const set = <K extends keyof typeof p>(key: K, value: (typeof p)[K]) => update((d) => ({ ...d, plan: { ...d.plan, [key]: value } }));
  // L'éditeur ne relit pas sa valeur après son montage : on le remonte (clé) quand la synthèse est (re)générée.
  const [rev, setRev] = useState(0);
  const rows = buildClinicalSummary(draft, t);
  const regenerate = (): void => {
    if (rows.length === 0) return;
    update((d) => ({ ...d, plan: { ...d.plan, synthesis: summaryToDoc(buildClinicalSummary(d, t)), synthesisSeeded: true } }));
    setRev((r) => r + 1);
  };
  // À la première ouverture, la synthèse reprend ce qui a été saisi plus haut ; le médecin la complète ou la corrige dans le même champ.
  useEffect(() => {
    if (readOnly || p.synthesisSeeded || !isEmptyDoc(p.synthesis) || rows.length === 0) return;
    regenerate();
  }, [readOnly, p.synthesisSeeded, rows.length]);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('clinical.plan.autoHint')}</p>
      <RichField key={rev} label={t('clinical.plan.synthesis')} target="plan" value={p.synthesis} onChange={(v) => set('synthesis', v)} disabled={readOnly} />
      {!readOnly && <div><Button size="sm" variant="outline" onClick={() => regenerate()}>{t('clinical.plan.regenerate')}</Button></div>}
      <Panel title={t('clinical.plan.ordersTitle')}>
        <p className="text-sm text-muted-foreground">{t('clinical.plan.ordersHint')}</p>
        <div className="flex flex-wrap gap-2">
          {LAB_AVAILABLE && patientId && !readOnly && (
            <Can permission={PERMISSIONS.laboratory.order}><Button variant="primary" onClick={() => setOrdering('lab')}>{t('clinical.plan.labOrder')}</Button></Can>
          )}
          {RX_AVAILABLE && patientId && !readOnly && (
            <Can permission={PERMISSIONS.prescriptions.create}><Button variant="primary" onClick={() => setOrdering('rx')}>{t('clinical.plan.rxOrder')}</Button></Can>
          )}
          <Link to="/laboratory" className={buttonVariants('outline')}><Link2 aria-hidden className="size-4" />{t('clinical.plan.labLink')}</Link>
          <Link to="/prescriptions" className={buttonVariants('outline')}><Link2 aria-hidden className="size-4" />{t('clinical.plan.rxLink')}</Link>
          <Link to="/hospitalization" className={buttonVariants('outline')}><Link2 aria-hidden className="size-4" />{t('clinical.plan.admissionLink')}</Link>
        </div>
      </Panel>
      <LinkedOrders consultationId={consultationId} />
      {ordering === 'lab' && patientId && <NewLabOrderDialog initialPatientId={patientId} consultationId={consultationId} onClose={() => setOrdering(null)} onCreated={() => setOrdering(null)} />}
      {ordering === 'rx' && patientId && <NewRxDialog initialPatientId={patientId} consultationId={consultationId} onClose={() => setOrdering(null)} onCreated={() => setOrdering(null)} />}
      <RichField label={t('clinical.plan.actions')} target="plan" value={p.actions} onChange={(v) => set('actions', v)} disabled={readOnly} />
      <Panel title={t('clinical.plan.orientationTitle')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={t('clinical.plan.orientation')} value={p.orientation} onChange={(v) => set('orientation', v as typeof p.orientation)} disabled={readOnly}
            options={(['none', 'ambulatory', 'service', 'hospitalization', 'referral'] as const).map((o) => ({ value: o, label: t(`clinical.plan.orientations.${o}`) }))} />
          {p.orientation !== 'none' && p.orientation !== 'ambulatory' && (
            <FormField label={t(`clinical.plan.target.${p.orientation}`)} hint={t(`clinical.plan.targetHint.${p.orientation}`)}>
              {(c) => <SuggestInput {...c} value={p.orientationTarget} disabled={readOnly} onChange={(v) => set('orientationTarget', v)}
                suggestions={p.orientation === 'referral' ? [] : SERVICE_KEYS.map((k) => ({ value: t(`services.${k}`) }))} />}
            </FormField>
          )}
        </div>
        {p.orientation === 'ambulatory' && <p role="note" className="rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink">{t('clinical.plan.ambulatoryNote')}</p>}
        {p.orientation === 'hospitalization' && <p role="note" className="rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink">{t('clinical.plan.admissionNote')}</p>}
      </Panel>
    </div>
  );
}
