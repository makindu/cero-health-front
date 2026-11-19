import { useMemo, useState } from 'react';
import { Ban, CircleCheck, Clock, RotateCcw, Undo2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { FormField } from '@/components/forms/form-field';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { DraftNotice } from '@/components/feedback/draft-notice';
import { usePersistentState } from '@/core/drafts/use-persistent-state';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can, usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ActionDialog } from '../finance/ActionDialog';
import { useFinanceSnapshot, useMoney } from '../finance/use-finance';
import { EMPTY_DOC, docToText, type RichDoc } from '../consultations/richtext/doc';
import { RichTextEditor } from '../consultations/richtext/RichTextEditor';
import { NewLabOrderDialog } from '../laboratory/NewLabOrderDialog';
import { useLabOrders } from '../laboratory/use-lab';
import { NewRxDialog } from '../prescriptions/NewRxDialog';
import { useRxList } from '../prescriptions/use-rx';
import { visits } from './hospital';
import { RichTextView } from './RichTextView';
import { isActive } from './hospital-rules';
import { useHospitalMutation, useVisitLedger } from './use-hospital';
import * as V from './visit-rules';
import type { Evolution, LedgerRow, RowStatus, TreatmentDecision, Visit, VisitClinicalInput, VisitType } from './visit-rules';

const EMPTY_VISIT = {
  type: 'round' as VisitType, cMode: '' as '' | 'none' | 'text', cText: EMPTY_DOC as RichDoc, evolution: '' as '' | Evolution,
  examText: EMPTY_DOC as RichDoc, diagnosis: '', treatment: '' as '' | TreatmentDecision, planLabs: false, planDischarge: false, planNote: EMPTY_DOC as RichDoc,
};

const STATUS: Record<RowStatus, { tone: StatusTone; icon: LucideIcon }> = {
  pending: { tone: 'warning', icon: Clock },
  billed: { tone: 'success', icon: CircleCheck },
  reversed: { tone: 'neutral', icon: Ban },
  reversal: { tone: 'info', icon: Undo2 },
};

/**
 * Visites (tour de salle) et consommations d'un patient hospitalisé. La saisie ne facture rien : la facturation est automatique
 * à la demande de sortie et à la sortie ; une erreur se corrige par une contre-écriture motivée (la ligne d'origine reste visible).
 */
export function VisitsSection({ admissionId }: { admissionId: string }) {
  const { t } = useTranslation('hospitalization');
  const f = useFormatters();
  const money = useMoney();
  const { can } = usePermissions();
  const ledger = useVisitLedger(admissionId);
  const snap = useFinanceSnapshot();
  const catalog = useMemo(() => (snap.data?.catalog ?? []).filter(V.isConsumable).sort((a, b) => a.label.localeCompare(b.label)), [snap.data]);

  const labs = useLabOrders();
  const rxs = useRxList();
  const canClinical = can(P.hospitalization.visitClinical);
  const [labFor, setLabFor] = useState<Visit | null>(null);
  const [rxFor, setRxFor] = useState<Visit | null>(null);
  // Volet clinique du formulaire de visite : 1 plaintes, 2 examen, 3 diagnostic, 4 plan.
  // Brouillon automatique de la visite en cours de saisie (survit à une fermeture involontaire, un rechargement ou une coupure).
  const [vf, setVf, vDraft] = usePersistentState(`visit:${admissionId}`, EMPTY_VISIT);
  const { type, cMode, cText, evolution, examText, diagnosis, treatment, planLabs, planDischarge, planNote } = vf;
  const setType = (type: VisitType): void => setVf((s) => ({ ...s, type }));
  const setCMode = (cMode: '' | 'none' | 'text'): void => setVf((s) => ({ ...s, cMode }));
  const setCText = (cText: RichDoc): void => setVf((s) => ({ ...s, cText }));
  const setEvolution = (evolution: '' | Evolution): void => setVf((s) => ({ ...s, evolution }));
  const setExamText = (examText: RichDoc): void => setVf((s) => ({ ...s, examText }));
  const setDiagnosis = (diagnosis: string): void => setVf((s) => ({ ...s, diagnosis }));
  const setTreatment = (treatment: '' | TreatmentDecision): void => setVf((s) => ({ ...s, treatment }));
  const setPlanLabs = (planLabs: boolean): void => setVf((s) => ({ ...s, planLabs }));
  const setPlanDischarge = (planDischarge: boolean): void => setVf((s) => ({ ...s, planDischarge }));
  const setPlanNote = (planNote: RichDoc): void => setVf((s) => ({ ...s, planNote }));
  const visitDirty = JSON.stringify(vf) !== JSON.stringify(EMPTY_VISIT);
  /** Change à chaque fermeture : remet les éditeurs à zéro (ils ne lisent leur valeur qu'à l'ouverture). */
  const [formKey, setFormKey] = useState(0);
  const [dialog, setDialog] = useState<'visit' | 'bill' | null>(null);
  const [target, setTarget] = useState<LedgerRow | null>(null);
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState('');
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  const closeAll = (): void => { setDialog(null); setTarget(null); setReason(''); setQty(''); setDiscount(''); setDiscountReason('');
    vDraft.discard(); setFormKey((k) => k + 1);
  };
  const mVisit = useHospitalMutation(visits.recordVisit, { successTitle: t('visits.done.recorded'), onDone: closeAll });
  const mReverse = useHospitalMutation(visits.reverse, { successTitle: t('visits.done.reversed'), onDone: closeAll });
  const mBill = useHospitalMutation(visits.bill, { successTitle: t('visits.done.billed'), onDone: closeAll });

  if (ledger.isPending) return <DetailSection title={t('visits.title')}><p className="text-sm text-muted-foreground">{t('visits.loading')}</p></DetailSection>;
  const v = ledger.data;
  if (!v) return <DetailSection title={t('visits.title')}><p className="text-sm text-danger">{t('visits.loadFailed')}</p></DetailSection>;

  const active = isActive(v.admission);
  const canBill = v.pending.length > 0 && (active || v.admission.status === 'discharged');
  const canDiscount = can(P.billing.discount);
  const pendingValue = v.pending.reduce((s, l) => s + (catalog.find((c) => c.id === l.itemId)?.price.minor ?? 0) * l.quantity, 0);
  const currency = catalog[0]?.price.currency ?? 'USD';
  const rows = [...v.rows].reverse();
  const visitOf = (id: string) => v.visits.find((x) => x.id === id);

  const clinicalInput = ((): VisitClinicalInput | undefined => {
    const c: VisitClinicalInput = {};
    if (cMode === 'none') c.complaints = { none: true, text: EMPTY_DOC };
    if (cMode === 'text') c.complaints = { none: false, text: cText };
    if (canClinical) {
      if (evolution !== '' || docToText(examText) !== '') c.examination = { evolution: evolution as Evolution, text: examText };
      if (diagnosis.trim() !== '') c.diagnosis = diagnosis;
      if (treatment !== '' || planLabs || planDischarge || docToText(planNote) !== '') c.plan = { treatment: treatment || undefined, labs: planLabs, discharge: planDischarge, note: planNote };
    }
    return Object.keys(c).length > 0 ? c : undefined;
  })();
  // Même contrôle que le service : le bouton reste grisé tant que le volet clinique est incohérent, avec la raison affichée.
  const clinicalProblem = ((): { code: string; params: Record<string, string | number> } | null => {
    try { V.checkClinical(clinicalInput, canClinical); return null; } catch (e) { if (e instanceof V.VisitError) return { code: e.code, params: e.params }; throw e; }
  })();
  const labsOf = (id: string) => (labs.data ?? []).filter((x) => x.order.consultationId === id);
  const rxOf = (id: string) => (rxs.data ?? []).filter((x) => x.consultationId === id);
  const allVisits = [...v.visits].reverse();

  const bp = discount.trim() === '' ? 0 : Math.round(Number(discount.replace(',', '.')) * 100);
  const discountOk = bp === 0 || (Number.isFinite(bp) && bp > 0 && bp <= v.maxDiscountBp && discountReason.trim() !== '' && canDiscount);

  return (
    <DetailSection title={t('visits.title')}>
      <DescriptionList items={[
        { label: t('visits.summary.visits'), value: String(v.visits.length) },
        { label: t('visits.summary.pending'), value: String(v.pending.length) },
        { label: t('visits.summary.pendingValue'), value: v.pending.length > 0 ? money(pendingValue, currency) : '' },
        { label: t('visits.summary.invoices'), value: String(v.invoiceIds.length) },
      ]} />
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('visits.empty')}</p> : (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {rows.map((r) => {
            const visit = visitOf(r.entry.visitId);
            const s = STATUS[r.status];
            const reversible = active && r.status === 'pending';
            return (
              <li key={r.entry.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                <span className="min-w-0">
                  <strong>{r.entry.kind === 'reversal' ? '−' : ''}{r.entry.quantity} × {r.entry.itemLabel}</strong>
                  {r.entry.kind === 'consumption' && r.net !== r.entry.quantity ? ` (${t('visits.net', { count: r.net })})` : ''}
                  <span className="block text-xs text-muted-foreground">
                    {f.dateTime(r.entry.at)} · {r.entry.by}{visit ? ` · ${t(`visits.types.${visit.type}`)}` : ''}{r.entry.reason ? ` — ${r.entry.reason}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge tone={s.tone} icon={s.icon}>{t(`visits.status.${r.status}`)}</StatusBadge>
                  {reversible && (
                    <Can permission={P.hospitalization.consumptionReverse}>
                      <Button size="sm" variant="outline" onClick={() => { setTarget(r); setQty(String(r.net)); setReason(''); }}><RotateCcw className="size-4" aria-hidden /> {t('visits.reverse')}</Button>
                    </Can>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {allVisits.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{t('visits.clinical.historyTitle')}</h4>
          <ul className="space-y-2">
            {allVisits.map((x) => {
              const c = x.clinical;
              const vl = labsOf(x.id);
              const vr = rxOf(x.id);
              return (
                <li key={x.id} className="space-y-1 rounded-md border border-border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">{f.dateTime(x.visitedAt)} · {x.by} · {t(`visits.types.${x.type}`)}</p>
                  {c?.complaints && (
                    <div>
                      <p className="font-medium">{t('visits.clinical.step1')}</p>
                      {c.complaints.none ? <p>{t('visits.clinical.noComplaint')}</p> : <RichTextView value={c.complaints.text} />}
                    </div>
                  )}
                  {c?.examination && (
                    <div>
                      <p className="font-medium">{t('visits.clinical.step2')}</p>
                      <RichTextView value={c.examination.text} />
                    </div>
                  )}
                  {(c?.examination || c?.diagnosis) && (
                    <p>
                      <strong>{t('visits.clinical.step3')} :</strong>{' '}
                      {[c.examination ? `${t('visits.clinical.evolution')} : ${t(`visits.clinical.evolutions.${c.examination.evolution}`)}` : null, c.diagnosis ?? null].filter(Boolean).join(' — ')}
                    </p>
                  )}
                  {c?.plan && (
                    <div>
                      <p className="font-medium">
                        {t('visits.clinical.step4')} : {[c.plan.treatment ? t(`visits.clinical.treatments.${c.plan.treatment}`) : null, c.plan.labs ? t('visits.clinical.planLabs') : null, c.plan.discharge ? t('visits.clinical.planDischarge') : null].filter(Boolean).join(' · ')}
                      </p>
                      {docToText(V.toDoc(c.plan.note)) !== '' && <RichTextView value={c.plan.note} />}
                    </div>
                  )}
                  <div className="space-y-1 border-t border-border pt-2">
                    <p className="font-medium">{t('visits.clinical.consumptions')}</p>
                    {vl.length === 0 && vr.length === 0 && <p className="text-xs text-muted-foreground">{t('visits.clinical.noOrders')}</p>}
                    {(vl.length > 0 || vr.length > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {vl.length > 0 && t('visits.clinical.labsRequested', { count: vl.length, numbers: vl.map((o) => o.order.number).join(', ') })}
                        {vl.length > 0 && vr.length > 0 ? ' · ' : ''}
                        {vr.length > 0 && t('visits.clinical.rxIssued', { count: vr.length, numbers: vr.map((r) => r.number).join(', ') })}
                      </p>
                    )}
                    {active && (
                      <div className="flex flex-wrap gap-2">
                        <Can permission={P.laboratory.order}><Button size="sm" variant="primary" onClick={() => setLabFor(x)}>{t('visits.clinical.orderLabs')}</Button></Can>
                        <Can permission={P.prescriptions.create}><Button size="sm" variant="primary" onClick={() => setRxFor(x)}>{t('visits.clinical.prescribe')}</Button></Can>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {labFor && <NewLabOrderDialog initialPatientId={v.admission.patientId} consultationId={labFor.id} onClose={() => setLabFor(null)} onCreated={() => setLabFor(null)} />}
      {rxFor && <NewRxDialog initialPatientId={v.admission.patientId} consultationId={rxFor.id} onClose={() => setRxFor(null)} onCreated={() => setRxFor(null)} />}
      <div className="flex flex-wrap gap-2 pt-1">
        {active && <Can permission={P.hospitalization.visitRecord}><Button onClick={() => setDialog('visit')}>{t('visits.newVisit')}</Button></Can>}
        {canBill && <Can permission={P.hospitalization.discharge}><Button variant="outline" onClick={() => setDialog('bill')}>{t('visits.billNow')}</Button></Can>}
      </div>
      <p className="text-xs text-muted-foreground">{t('visits.note')}</p>

      <ActionDialog open={dialog === 'visit'} onClose={closeAll} title={t('visits.recordTitle')} description={t('visits.recordBody')} submitLabel={t('visits.newVisit')} pending={mVisit.isPending} canSubmit={clinicalProblem === null} dirty={dialog === 'visit' && visitDirty}
        onSubmit={() => mVisit.mutate({ admissionId, type, clinical: clinicalInput, lines: [] })}>
        {vDraft.restored && <DraftNotice onDiscard={() => { vDraft.discard(); setFormKey((k) => k + 1); }} />}
        <FormField label={t('visits.visitType')} required>
          {(c) => <Select {...c} value={type} onChange={(e) => setType(e.target.value as VisitType)}>{V.VISIT_TYPES.map((x) => <option key={x} value={x}>{t(`visits.types.${x}`)}</option>)}</Select>}
        </FormField>
        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t('visits.clinical.step1')}</legend>
          <FormField label={t('visits.clinical.complaints')}>
            {(c) => (
              <Select {...c} value={cMode} onChange={(e) => setCMode(e.target.value as '' | 'none' | 'text')}>
                <option value="">{t('visits.clinical.notRecorded')}</option>
                <option value="none">{t('visits.clinical.noComplaint')}</option>
                <option value="text">{t('visits.clinical.hasComplaints')}</option>
              </Select>
            )}
          </FormField>
          {cMode === 'text' && <FormField label={t('visits.clinical.complaintsText')} hint={t('visits.clinical.complaintsHint')} required>{() => <RichTextEditor key={`c${formKey}`} label={t('visits.clinical.complaintsText')} value={cText} onChange={setCText} minHeight="7rem" />}</FormField>}
        </fieldset>
        {canClinical ? (
          <>
            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium">{t('visits.clinical.step2')}</legend>
              <FormField label={t('visits.clinical.examination')} hint={t('visits.clinical.examinationHint')}>{() => <RichTextEditor key={`e${formKey}`} label={t('visits.clinical.examination')} value={examText} onChange={setExamText} minHeight="9rem" />}</FormField>
            </fieldset>
            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium">{t('visits.clinical.step3')}</legend>
              <FormField label={t('visits.clinical.evolution')}>
                {(c) => (
                  <Select {...c} value={evolution} onChange={(e) => setEvolution(e.target.value as '' | Evolution)}>
                    <option value="">{t('visits.clinical.notRecorded')}</option>
                    {V.EVOLUTIONS.map((x) => <option key={x} value={x}>{t(`visits.clinical.evolutions.${x}`)}</option>)}
                  </Select>
                )}
              </FormField>
              <FormField label={t('visits.clinical.evolutionDetail')}>{(c) => <Input {...c} maxLength={V.MAX_DIAGNOSIS} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />}</FormField>
            </fieldset>
            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium">{t('visits.clinical.step4')}</legend>
              <FormField label={t('visits.clinical.treatment')}>
                {(c) => (
                  <Select {...c} value={treatment} onChange={(e) => setTreatment(e.target.value as '' | TreatmentDecision)}>
                    <option value="">{t('visits.clinical.notRecorded')}</option>
                    {V.TREATMENT_DECISIONS.map((x) => <option key={x} value={x}>{t(`visits.clinical.treatments.${x}`)}</option>)}
                  </Select>
                )}
              </FormField>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={planLabs} onChange={(e) => setPlanLabs(e.target.checked)} /> {t('visits.clinical.planLabs')}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={planDischarge} onChange={(e) => setPlanDischarge(e.target.checked)} /> {t('visits.clinical.planDischarge')}</label>
              <FormField label={t('visits.clinical.planNote')}>{() => <RichTextEditor key={`p${formKey}`} label={t('visits.clinical.planNote')} value={planNote} onChange={setPlanNote} minHeight="6rem" />}</FormField>
              <p className="text-xs text-muted-foreground">{t('visits.clinical.planHint')}</p>
            </fieldset>
          </>
        ) : <p className="text-xs text-muted-foreground">{t('visits.clinical.noClinicalRight')}</p>}
        {clinicalProblem && <p className="text-sm text-danger" role="alert">{t(`business.visit.${clinicalProblem.code}`, { ns: 'common', ...clinicalProblem.params })}</p>}
        <p className="text-xs text-muted-foreground">{t('visits.clinical.afterSaveHint')}</p>
      </ActionDialog>

      <ActionDialog open={target !== null} onClose={closeAll} tone="danger" title={t('visits.reverseTitle')} description={t('visits.reverseBody')} submitLabel={t('visits.reverse')} pending={mReverse.isPending}
        canSubmit={reason.trim() !== '' && Number.isInteger(Number(qty)) && Number(qty) >= 1 && Number(qty) <= (target?.net ?? 0)}
        onSubmit={() => target && mReverse.mutate({ admissionId, consumptionId: target.entry.id, reason, quantity: Number(qty) })}>
        <p className="text-sm">{target ? `${target.entry.itemLabel} — ${t('visits.net', { count: target.net })}` : ''}</p>
        <FormField label={t('visits.reverseQty')} required>{(c) => <Input {...c} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />}</FormField>
        <FormField label={t('visits.reason')} required>{(c) => <Textarea {...c} rows={2} maxLength={V.MAX_REASON} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
      </ActionDialog>

      <ActionDialog open={dialog === 'bill'} onClose={closeAll} title={t('visits.billTitle')} description={t('visits.billBody')} submitLabel={t('visits.billNow')} pending={mBill.isPending} canSubmit={discountOk}
        onSubmit={() => mBill.mutate({ admissionId, discountBp: bp || undefined, discountReason: bp ? discountReason : undefined })}>
        <ul className="space-y-1 text-sm">{v.pending.map((l) => <li key={l.itemId}>{l.quantity} × {l.itemLabel}</li>)}</ul>
        {canDiscount ? (
          <>
            <FormField label={t('visits.discount', { max: v.maxDiscountBp / 100 })}>{(c) => <Input {...c} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />}</FormField>
            {bp > 0 && <FormField label={t('visits.discountReason')} required>{(c) => <Textarea {...c} rows={2} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />}</FormField>}
            {bp > v.maxDiscountBp && <p className="text-sm text-danger">{t('visits.discountTooHigh', { max: v.maxDiscountBp / 100 })}</p>}
          </>
        ) : <p className="text-xs text-muted-foreground">{t('visits.noDiscountRight')}</p>}
      </ActionDialog>
    </DetailSection>
  );
}
