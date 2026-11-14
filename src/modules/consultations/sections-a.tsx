import { History, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/core/i18n/useFormatters';
import { DescriptionList } from '../_shared/detail-view';
import { AreaField, Panel, RichField, SelectField, TextField } from './clinical/fields';
import { activeAllergies, addAntecedent, antecedentHistory, currentAntecedents, recordVerification, reviseAntecedent, type ActionContext } from './clinical/logic';
import { ANTECEDENT_CATEGORIES, type Antecedent, type AntecedentCategory, type AntecedentState, type ConsultationDraft, type InfoSource, type Origin } from './clinical/model';
import type { Consultation } from './data';
import type { Patient } from '../patients/data';
import { ageFromBirthDate } from '@/utils/dates';

type Update = (fn: (d: ConsultationDraft) => ConsultationDraft) => void;
export const newCtx = (by: string): ActionContext => ({ by, at: new Date().toISOString(), id: crypto.randomUUID() });

// ───────────── A. Informations générales (administratives, récupérées du dossier patient) ─────────────
export function GeneralSection({ consultation, patient }: { consultation: Consultation; patient: Patient | null }) {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  const age = patient ? ageFromBirthDate(patient.birthDate) : null;
  return (
    <Panel title={t('clinical.general.title')}>
      <p className="text-sm text-muted-foreground">{t('clinical.general.hint')}</p>
      <DescriptionList
        items={[
          { label: t('columns.patient'), value: `${consultation.patientName} (${consultation.patientId})` },
          { label: t('clinical.general.fileNumber'), value: patient?.fileNumber },
          { label: t('clinical.general.age'), value: age === null ? '—' : t('clinical.ageYears', { count: age }) },
          { label: t('clinical.general.sex'), value: patient ? t(`clinical.sex.${patient.sex}`) : '—' },
          { label: t('columns.date'), value: f.dateTime(consultation.date) },
          { label: t('columns.practitioner'), value: consultation.practitioner },
          { label: t('columns.service'), value: t(`services.${consultation.service}`) },
          { label: t('clinical.general.origin'), value: consultation.appointmentId ? t('clinical.general.fromAppointment', { id: consultation.appointmentId }) : consultation.origin === 'walkIn' ? t('clinical.general.walkIn') : '—' },
          { label: t('columns.reason'), value: t(`reason.${consultation.reason}`) },
        ]}
      />
    </Panel>
  );
}

// ───────────── B. Motif et anamnèse ─────────────
export function AnamnesisSection({ draft, update, readOnly }: { draft: ConsultationDraft; update: Update; readOnly: boolean }) {
  const { t } = useTranslation('consultations');
  const a = draft.anamnesis;
  const set = <K extends keyof typeof a>(key: K, value: (typeof a)[K]) => update((d) => ({ ...d, anamnesis: { ...d.anamnesis, [key]: value } }));
  const sources: InfoSource[] = ['patient', 'companion', 'other'];
  return (
    <div className="space-y-4">
      <Panel title={t('clinical.anamnesis.title')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <AreaField className="sm:col-span-2" rows={2} label={t('clinical.anamnesis.chiefComplaint')} value={a.chiefComplaint} onChange={(v) => set('chiefComplaint', v)} disabled={readOnly} />
          <SelectField label={t('clinical.anamnesis.source')} value={a.source} onChange={(v) => set('source', v as InfoSource)} disabled={readOnly} options={sources.map((s) => ({ value: s, label: t(`clinical.anamnesis.sources.${s}`) }))} />
          <TextField type="date" label={t('clinical.anamnesis.onset')} value={a.onset} onChange={(v) => set('onset', v)} disabled={readOnly} />
          <TextField label={t('clinical.anamnesis.duration')} hint={t('clinical.anamnesis.durationHint')} value={a.duration} onChange={(v) => set('duration', v)} disabled={readOnly} />
          <TextField label={t('clinical.anamnesis.location')} value={a.location} onChange={(v) => set('location', v)} disabled={readOnly} />
          <SelectField label={t('clinical.anamnesis.intensity')} value={a.intensity} onChange={(v) => set('intensity', v)} disabled={readOnly}
            options={[{ value: '', label: t('clinical.notAssessed') }, ...Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: `${i} / 10` }))]} />
          <AreaField label={t('clinical.anamnesis.associated')} value={a.associated} onChange={(v) => set('associated', v)} disabled={readOnly} />
          <AreaField label={t('clinical.anamnesis.aggravating')} value={a.aggravating} onChange={(v) => set('aggravating', v)} disabled={readOnly} />
          <AreaField label={t('clinical.anamnesis.relieving')} value={a.relieving} onChange={(v) => set('relieving', v)} disabled={readOnly} />
          <AreaField label={t('clinical.anamnesis.priorTreatments')} value={a.priorTreatments} onChange={(v) => set('priorTreatments', v)} disabled={readOnly} />
        </div>
      </Panel>
      <RichField label={t('clinical.anamnesis.history')} target="anamnesis" value={a.history} onChange={(v) => set('history', v)} disabled={readOnly} />
      <RichField label={t('clinical.anamnesis.notes')} target="anamnesis" value={a.notes} onChange={(v) => set('notes', v)} disabled={readOnly} />
    </div>
  );
}

// ───────────── C. Antécédents (rattachés au patient, jamais écrasés) ─────────────
export function AllergyAlert({ antecedents }: { antecedents: readonly Antecedent[] }) {
  const { t } = useTranslation('consultations');
  const allergies = activeAllergies(antecedents);
  const none = currentAntecedents(antecedents).some((a) => a.category === 'allergy' && a.state === 'none');
  if (allergies.length === 0) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
        <ShieldCheck aria-hidden className="size-4" />
        {none ? t('clinical.allergy.noneKnown') : t('clinical.allergy.unknown')}
      </p>
    );
  }
  return (
    <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger-ink">
      <ShieldAlert aria-hidden className="size-4" />
      {t('clinical.allergy.title')} :
      {allergies.map((a) => (
        <span key={a.id} className="rounded bg-surface px-2 py-0.5">{a.label}{a.severity ? ` · ${t(`clinical.severity.${a.severity}`)}` : ''}</span>
      ))}
    </p>
  );
}

export function HistorySection({ draft, update, readOnly, author, since }: { draft: ConsultationDraft; update: Update; readOnly: boolean; author: string; since: string }) {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ category: 'medical' as AntecedentCategory, label: '', detail: '', severity: '', origin: 'declared' as Origin, state: 'active' as AntecedentState });
  const current = currentAntecedents(draft.antecedents);
  const states: AntecedentState[] = ['active', 'resolved', 'unknown', 'none'];

  const add = () => {
    if (form.label.trim() === '') return;
    update((d) => ({ ...d, antecedents: addAntecedent(d.antecedents, { category: form.category, label: form.label.trim(), detail: form.detail.trim() || undefined, severity: form.category === 'allergy' && form.severity ? (form.severity as 'mild' | 'moderate' | 'severe') : undefined, origin: form.origin, state: form.state }, newCtx(author)) }));
    setForm({ ...form, label: '', detail: '', severity: '' });
  };
  const markAbsent = (category: AntecedentCategory, state: 'none' | 'unknown') =>
    update((d) => ({ ...d, antecedents: addAntecedent(d.antecedents, { category, label: t(`clinical.history.${state}Label`), origin: 'declared', state }, newCtx(author)) }));
  const revise = (id: string, change: Parameters<typeof reviseAntecedent>[2]) =>
    update((d) => ({ ...d, antecedents: reviseAntecedent(d.antecedents, id, change, newCtx(author)) }));
  const verify = () => update((d) => ({ ...d, verifications: recordVerification(d, newCtx(author), since) }));

  const last = draft.verifications[draft.verifications.length - 1];
  return (
    <div className="space-y-4">
      <AllergyAlert antecedents={draft.antecedents} />
      <Panel
        title={t('clinical.history.verifyTitle')}
        actions={!readOnly && <Button size="sm" leftIcon={<ShieldCheck className="size-4" />} onClick={verify}>{t('clinical.history.verify')}</Button>}
      >
        <p className="text-sm text-muted-foreground">
          {last
            ? t('clinical.history.verifiedAt', { when: f.dateTime(last.at), by: last.by }) + ' ' + (last.unchanged ? t('clinical.history.noChange') : t('clinical.history.changed', { count: last.changedIds.length }))
            : t('clinical.history.notVerified')}
        </p>
        <p className="text-xs text-muted-foreground">{t('clinical.history.patientLevel')}</p>
      </Panel>

      {ANTECEDENT_CATEGORIES.map((category) => {
        const rows = current.filter((a) => a.category === category);
        return (
          <Panel key={category} title={t(`clinical.history.categories.${category}`)}
            actions={!readOnly && rows.length === 0 && (
              <span className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => markAbsent(category, 'none')}>{t('clinical.history.markNone')}</Button>
                <Button size="sm" variant="outline" onClick={() => markAbsent(category, 'unknown')}>{t('clinical.history.markUnknown')}</Button>
              </span>
            )}>
            {rows.length === 0 && <p className="text-sm text-muted-foreground">{t('clinical.history.empty')}</p>}
            <ul className="space-y-2">
              {rows.map((a) => (
                <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{a.label}{a.detail ? ` — ${a.detail}` : ''}</p>
                    <span className="flex flex-wrap gap-1.5">
                      <StatusBadge tone={a.origin === 'observed' ? 'success' : 'info'}>{t(`clinical.history.origin.${a.origin}`)}</StatusBadge>
                      <StatusBadge tone={a.state === 'active' ? 'warning' : 'neutral'}>{t(`clinical.history.state.${a.state}`)}</StatusBadge>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t('clinical.history.recordedBy', { by: a.author, when: f.dateTime(a.recordedAt) })}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {!readOnly && a.origin !== 'observed' && <Button size="sm" variant="outline" onClick={() => revise(a.id, { origin: 'observed' })}>{t('clinical.history.confirm')}</Button>}
                    {!readOnly && a.state === 'active' && <Button size="sm" variant="outline" onClick={() => revise(a.id, { state: 'resolved' })}>{t('clinical.history.resolve')}</Button>}
                    {!readOnly && a.state !== 'unknown' && <Button size="sm" variant="outline" onClick={() => revise(a.id, { state: 'unknown' })}>{t('clinical.history.markUnknown')}</Button>}
                    {antecedentHistory(draft.antecedents, a.id).length > 1 && (
                      <Button size="sm" variant="ghost" leftIcon={<History className="size-4" />} onClick={() => setOpen(open === a.id ? null : a.id)}>{t('clinical.history.versions')}</Button>
                    )}
                  </div>
                  {open === a.id && (
                    <ol className="mt-2 space-y-1 border-s-2 border-border ps-3 text-xs">
                      {antecedentHistory(draft.antecedents, a.id).map((v) => (
                        <li key={v.id}>{f.dateTime(v.recordedAt)} · {v.author} · {t(`clinical.history.state.${v.state}`)} · {t(`clinical.history.origin.${v.origin}`)}</li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}

      {!readOnly && (
        <Panel title={t('clinical.history.addTitle')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label={t('clinical.history.category')} value={form.category} onChange={(v) => setForm({ ...form, category: v as AntecedentCategory })} options={ANTECEDENT_CATEGORIES.map((c) => ({ value: c, label: t(`clinical.history.categories.${c}`) }))} />
            <TextField label={t('clinical.history.label')} value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
            <TextField label={t('clinical.history.detail')} value={form.detail} onChange={(v) => setForm({ ...form, detail: v })} />
            {form.category === 'allergy' && (
              <SelectField label={t('clinical.history.severity')} value={form.severity} onChange={(v) => setForm({ ...form, severity: v })}
                options={[{ value: '', label: t('clinical.notAssessed') }, ...(['mild', 'moderate', 'severe'] as const).map((s) => ({ value: s, label: t(`clinical.severity.${s}`) }))]} />
            )}
            <SelectField label={t('clinical.history.originLabel')} value={form.origin} onChange={(v) => setForm({ ...form, origin: v as Origin })} options={(['declared', 'observed'] as const).map((o) => ({ value: o, label: t(`clinical.history.origin.${o}`) }))} />
            <SelectField label={t('clinical.history.stateLabel')} value={form.state} onChange={(v) => setForm({ ...form, state: v as AntecedentState })} options={states.map((s) => ({ value: s, label: t(`clinical.history.state.${s}`) }))} />
          </div>
          <Button onClick={add} disabled={form.label.trim() === ''}>{t('clinical.history.add')}</Button>
        </Panel>
      )}
      <RichField label={t('clinical.history.notes')} target="history" value={draft.antecedentNotes} onChange={(v) => update((d) => ({ ...d, antecedentNotes: v }))} disabled={readOnly} />
    </div>
  );
}
