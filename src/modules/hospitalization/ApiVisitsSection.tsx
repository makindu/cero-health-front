import { useEffect, useRef, useState } from 'react';
import { Ban, CircleCheck, Clock, RotateCcw, Undo2, X, type LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { FormField } from '@/components/forms/form-field';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { DraftNotice } from '@/components/feedback/draft-notice';
import { usePersistentState } from '@/core/drafts/use-persistent-state';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can, usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { docToText } from '../consultations/richtext/doc';
import { ActionDialog } from '../finance/ActionDialog';
import { NewLabOrderDialog } from '../laboratory/NewLabOrderDialog';
import { useLabOrders } from '../laboratory/use-lab';
import { NewRxDialog } from '../prescriptions/NewRxDialog';
import { useRxList } from '../prescriptions/use-rx';
import { apiHospital, type ApiLedgerRow, type ApiRowStatus, type ApiVisit, type ConsumableHit } from './hospital-api';
import { isActive, type Admission } from './hospital-rules';
import { useApiVisits, useHospitalMutation } from './use-hospital';

const STATUS: Record<ApiRowStatus, { tone: StatusTone; icon: LucideIcon }> = {
  pending: { tone: 'warning', icon: Clock },
  billed: { tone: 'success', icon: CircleCheck },
  reversed: { tone: 'neutral', icon: Ban },
  reversal: { tone: 'info', icon: Undo2 },
};
const EVOLUTIONS = ['improved', 'stable', 'worsened', 'newFindings'] as const;
const TREATMENTS = ['continue', 'modify', 'stop'] as const;

interface Line { key: number; itemId: string; name: string; quantity: number }
const EMPTY = { type: 'round' as 'round' | 'care', cMode: '' as '' | 'none' | 'text', cText: '', evolution: '', exam: '', diagnosis: '', treatment: '', labs: false, discharge: false, planNote: '' };

/** Choix d'un produit ou d'une prestation du catalogue : le serveur cherche, 15 résultats au plus (fluide même avec des milliers d'articles). */
function ConsumablePicker({ onPick }: { onPick: (hit: ConsumableHit) => void }) {
  const { t } = useTranslation('hospitalization');
  const { activeFacilityId } = usePreferences();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(h);
  }, [text]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const hits = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'hospital', 'consumables', query), queryFn: () => apiHospital.searchConsumables(query), enabled: query.length >= 2 });
  const list = hits.data ?? [];
  return (
    <div ref={box} className="relative">
      <Input value={text} autoComplete="off" role="combobox" aria-expanded={open && query.length >= 2} aria-label={t('visits.addLine')}
        placeholder={t('visits.searchItem', { defaultValue: 'Rechercher un produit ou une prestation (nom)…' })}
        onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && query.length >= 2 && hits.data !== undefined && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg">
          {list.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t('visits.noItem', { defaultValue: 'Aucun produit ni prestation trouvé.' })}</li>}
          {list.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-border/40" onClick={() => { onPick(h); setText(''); setQuery(''); setOpen(false); }}>
                <span>{h.name}</span>
                <span className="text-xs text-muted-foreground">{h.nature === 'procedure' ? t('visits.procedure', { defaultValue: 'prestation' }) : t('visits.product')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Visites (tour de salle) et consommations d'un séjour, en mode API. Le prix n'est jamais saisi : il vient du catalogue et du moteur d'assurance.
 * La facturation des consommations se fait depuis le compte du séjour ; une erreur se corrige par une contre-écriture motivée.
 */
export function ApiVisitsSection({ admission }: { admission: Admission }) {
  const { t } = useTranslation('hospitalization');
  const f = useFormatters();
  const { can } = usePermissions();
  const ledger = useApiVisits(admission.id);
  const labs = useLabOrders();
  const rxs = useRxList();
  const [labFor, setLabFor] = useState<string | null>(null);
  const [rxFor, setRxFor] = useState<string | null>(null);
  const canClinical = can(P.hospitalization.visitClinical);
  const [open, setOpen] = useState(false);
  // Brouillon automatique (saisie + lignes de consommation) : survit à une coupure, un rechargement ou une fermeture involontaire.
  // Il n'est effacé qu'après un enregistrement réussi ou si le médecin l'abandonne : un échec réseau ne perd rien.
  const [vf, setVf, vDraft] = usePersistentState(`visit:api:${admission.id}`, EMPTY);
  const [lines, setLines, lDraft] = usePersistentState<Line[]>(`visit:api:${admission.id}:lines`, []);
  const [target, setTarget] = useState<ApiLedgerRow | null>(null);
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState('');
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]): void => setVf((s) => ({ ...s, [k]: v }));
  const closeAll = (): void => { setOpen(false); setTarget(null); setVf(EMPTY); setLines([]); vDraft.discard(); lDraft.discard(); setReason(''); setQty(''); };
  /** Suite demandée dans la fenêtre de visite : la visite est d'abord enregistrée, puis la fenêtre d'examens ou de prescription s'ouvre, liée à CETTE visite. */
  const afterSave = useRef<'lab' | 'rx' | null>(null);
  const mVisit = useHospitalMutation(apiHospital.recordVisit, { successTitle: t('visits.done.recorded'), onDone: (created) => {
    const next = afterSave.current; afterSave.current = null;
    closeAll();
    if (next === 'lab') setLabFor(created.id); else if (next === 'rx') setRxFor(created.id);
  } });
  const mReverse = useHospitalMutation(apiHospital.reverseConsumption, { successTitle: t('visits.done.reversed'), onDone: closeAll });

  if (ledger.isPending) return <DetailSection title={t('visits.title')}><p className="text-sm text-muted-foreground">{t('visits.loading')}</p></DetailSection>;
  const v = ledger.data;
  if (!v) return <DetailSection title={t('visits.title')}><p className="text-sm text-danger">{t('visits.loadFailed')}</p></DetailSection>;

  const active = isActive(admission);
  const visitOf = (id: string) => v.visits.find((x) => x.id === id);
  const rows = [...v.rows].reverse();

  // Même enchaînement que le serveur : pas de diagnostic sans examen, pas de plan sans diagnostic.
  const examPart = vf.evolution !== '' || vf.exam.trim() !== '';
  const planPart = vf.treatment !== '' || vf.labs || vf.discharge || vf.planNote.trim() !== '';
  const problem = ((): string | null => {
    if (vf.cMode === 'text' && vf.cText.trim() === '') return t('visits.api.complaintsRequired', { defaultValue: 'Notez les plaintes ou choisissez « Aucune plainte aujourd’hui ».' });
    if (!canClinical) return null;
    if (examPart && (vf.evolution === '' || vf.exam.trim() === '')) return t('visits.api.examIncomplete', { defaultValue: 'L’examen demande l’évolution ET les observations.' });
    if (vf.diagnosis.trim() !== '' && !examPart) return t('visits.api.diagNeedsExam', { defaultValue: 'Pas de diagnostic sans examen : renseignez d’abord l’examen.' });
    if (planPart && vf.diagnosis.trim() === '') return t('visits.api.planNeedsDiag', { defaultValue: 'Pas de plan sans diagnostic : renseignez d’abord le diagnostic.' });
    if (planPart && vf.treatment === '' && !vf.labs && !vf.discharge) return t('visits.api.planEmpty', { defaultValue: 'Le plan doit contenir une décision : traitement, examens ou sortie.' });
    return null;
  })();
  const clinical = ((): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    if (vf.cMode === 'none') c.complaints = { none: true };
    if (vf.cMode === 'text') c.complaints = { none: false, text: vf.cText };
    if (canClinical) {
      if (examPart) c.examination = { evolution: vf.evolution, text: vf.exam };
      if (vf.diagnosis.trim() !== '') c.diagnosis = vf.diagnosis;
      if (planPart && vf.diagnosis.trim() !== '') c.plan = { ...(vf.treatment ? { treatment: vf.treatment } : {}), labs: vf.labs, discharge: vf.discharge, note: vf.planNote };
    }
    return c;
  })();
  const addLine = (h: ConsumableHit): void => setLines((ls) => (ls.some((l) => l.itemId === h.id) ? ls.map((l) => (l.itemId === h.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { key: Date.now() + ls.length, itemId: h.id, name: h.name, quantity: 1 }]));
  const reverseQty = Number(qty);
  const reverseOk = target !== null && reason.trim() !== '' && Number.isInteger(reverseQty) && reverseQty >= 1 && reverseQty <= target.net;

  return (
    <DetailSection title={t('visits.title')}>
      <DescriptionList items={[
        { label: t('visits.summary.visits'), value: String(v.visits.length) },
        { label: t('visits.summary.pending'), value: String(v.pending) },
      ]} />
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('visits.empty')}</p> : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => {
            const s = STATUS[r.status];
            const visit = visitOf(r.visitId);
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">
                    {r.kind === 'reversal' ? '−' : ''}{r.quantity} × {r.name}
                    {r.kind === 'consumption' && r.net !== r.quantity ? ` (${t('visits.net', { count: r.net })})` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">{f.dateTime(r.at)} · {r.by}{visit ? ` · ${t(`visits.types.${visit.type}`)}` : ''}{r.reason ? ` — ${r.reason}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={s.tone} icon={s.icon}>{t(`visits.status.${r.status}`)}</StatusBadge>
                  {r.status === 'pending' && r.net > 0 && (
                    <Can permission={P.hospitalization.consumptionReverse}>
                      <Button size="sm" variant="outline" onClick={() => { setTarget(r); setQty(String(r.net)); setReason(''); }}><RotateCcw className="size-4" aria-hidden /> {t('visits.reverse')}</Button>
                    </Can>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {v.visits.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{t('visits.clinical.consumptions')}</h4>
          <ul className="space-y-2 text-sm">
            {[...v.visits].reverse().map((x: ApiVisit) => {
              const vl = (labs.data ?? []).filter((o) => o.order.admissionVisitId === x.id);
              const vr = (rxs.data ?? []).filter((r) => r.admissionVisitId === x.id);
              return (
                <li key={x.id} className="space-y-1 rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">{f.dateTime(x.at)} · {x.by} · {t(`visits.types.${x.type}`)}</p>
                  {vl.length === 0 && vr.length === 0 && <p className="text-xs text-muted-foreground">{t('visits.clinical.noOrders')}</p>}
                  {(vl.length > 0 || vr.length > 0) && (
                    <p className="text-xs text-muted-foreground">
                      {vl.length > 0 && t('visits.clinical.labsRequested', { count: vl.length, numbers: vl.map((o) => o.order.number).join(', ') })}
                      {vl.length > 0 && vr.length > 0 ? ' · ' : ''}
                      {vr.length > 0 && t('visits.clinical.rxIssued', { count: vr.length, numbers: vr.map((r) => r.number).join(', ') })}
                    </p>
                  )}
                  {active && (can(P.laboratory.order) || can(P.prescriptions.create)) && (
                    <div className="flex flex-wrap gap-2">
                      {can(P.laboratory.order) && <Button size="sm" variant="primary" onClick={() => setLabFor(x.id)}>{t('visits.clinical.orderLabs')}</Button>}
                      {can(P.prescriptions.create) && <Button size="sm" variant="primary" onClick={() => setRxFor(x.id)}>{t('visits.clinical.prescribe')}</Button>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {v.visits.some((x) => x.clinical) && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{t('visits.clinical.historyTitle')}</h4>
          <ul className="space-y-3 text-sm">
            {v.visits.filter((x) => x.clinical).map((x: ApiVisit) => {
              const c = x.clinical ?? {};
              return (
                <li key={x.id} className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">{f.dateTime(x.at)} · {x.by} · {t(`visits.types.${x.type}`)}</p>
                  {c.complaints && <p><strong>{t('visits.clinical.step1')} :</strong> {c.complaints.none ? t('visits.clinical.noComplaint') : docToText(c.complaints.text)}</p>}
                  {c.examination && <p><strong>{t('visits.clinical.step2')} :</strong> {t(`visits.clinical.evolutions.${c.examination.evolution}`, { defaultValue: c.examination.evolution })} — {docToText(c.examination.text)}</p>}
                  {c.diagnosis && <p><strong>{t('visits.clinical.step3')} :</strong> {c.diagnosis}</p>}
                  {c.plan && <p><strong>{t('visits.clinical.step4')} :</strong> {[c.plan.treatment ? t(`visits.clinical.treatments.${c.plan.treatment}`, { defaultValue: c.plan.treatment }) : null, c.plan.labs ? t('visits.clinical.planLabs') : null, c.plan.discharge ? t('visits.clinical.planDischarge') : null, docToText(c.plan.note) || null].filter(Boolean).join(' · ')}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {active && <Can permission={P.hospitalization.visitRecord}><Button onClick={() => setOpen(true)}>{t('visits.newVisit')}</Button></Can>}
      </div>
      <p className="text-xs text-muted-foreground">{t('visits.api.note', { defaultValue: 'Les consommations en attente se facturent depuis le compte du séjour (« Facturer les consommations »). Une contre-écriture ne remet pas le produit en stock.' })}</p>

      <ActionDialog open={open} onClose={closeAll} wide title={`${t('visits.recordTitle')} — ${admission.patientName}`} description={t('visits.api.recordBody', { defaultValue: 'Aucun prix n’est saisi ici : il vient du catalogue. Une visite sans consommation est valide.' })}
        submitLabel={t('visits.newVisit')} pending={mVisit.isPending} canSubmit={problem === null} dirty={JSON.stringify(vf) !== JSON.stringify(EMPTY) || lines.length > 0}
        onSubmit={() => mVisit.mutate({ admissionId: admission.id, type: vf.type, lines: lines.map((l) => ({ catalogItemId: l.itemId, quantity: l.quantity })), clinical })}>
        {(vDraft.restored || lDraft.restored) && <DraftNotice onDiscard={() => { vDraft.discard(); lDraft.discard(); setVf(EMPTY); setLines([]); }} />}
        <FormField label={t('visits.visitType')} required>
          {(c) => <Select {...c} value={vf.type} onChange={(e) => set('type', e.target.value as 'round' | 'care')}><option value="round">{t('visits.types.round')}</option><option value="care">{t('visits.types.care')}</option></Select>}
        </FormField>
        <FormField label={t('visits.clinical.complaints')}>
          {(c) => (
            <Select {...c} value={vf.cMode} onChange={(e) => set('cMode', e.target.value as '' | 'none' | 'text')}>
              <option value="">{t('visits.clinical.notRecorded')}</option>
              <option value="none">{t('visits.clinical.noComplaint')}</option>
              <option value="text">{t('visits.clinical.hasComplaints')}</option>
            </Select>
          )}
        </FormField>
        {vf.cMode === 'text' && <FormField label={t('visits.clinical.complaintsText')} hint={t('visits.clinical.complaintsHint')} required>{(c) => <Textarea {...c} rows={2} value={vf.cText} onChange={(e) => set('cText', e.target.value)} />}</FormField>}
        {!canClinical && <p className="text-xs text-muted-foreground">{t('visits.clinical.noClinicalRight')}</p>}
        {canClinical && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t('visits.clinical.evolution')}>
                {(c) => <Select {...c} value={vf.evolution} onChange={(e) => set('evolution', e.target.value)}><option value="">—</option>{EVOLUTIONS.map((x) => <option key={x} value={x}>{t(`visits.clinical.evolutions.${x}`)}</option>)}</Select>}
              </FormField>
              <FormField label={t('visits.clinical.diagnosis')} hint={t('visits.clinical.step3')}>{(c) => <Input {...c} value={vf.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} />}</FormField>
            </div>
            <FormField label={t('visits.clinical.examination')} hint={t('visits.clinical.examinationHint')}>{(c) => <Textarea {...c} rows={2} value={vf.exam} onChange={(e) => set('exam', e.target.value)} />}</FormField>
            <FormField label={t('visits.clinical.treatment')}>
              {(c) => <Select {...c} value={vf.treatment} onChange={(e) => set('treatment', e.target.value)}><option value="">—</option>{TREATMENTS.map((x) => <option key={x} value={x}>{t(`visits.clinical.treatments.${x}`)}</option>)}</Select>}
            </FormField>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={vf.labs} onChange={(e) => set('labs', e.target.checked)} /> {t('visits.clinical.planLabs')}</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={vf.discharge} onChange={(e) => set('discharge', e.target.checked)} /> {t('visits.clinical.planDischarge')}</label>
            </div>
            <FormField label={t('visits.clinical.planNote')}>{(c) => <Textarea {...c} rows={2} value={vf.planNote} onChange={(e) => set('planNote', e.target.value)} />}</FormField>
          </>
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('visits.clinical.consumptions')}</p>
          {lines.length === 0 && <p className="text-xs text-muted-foreground">{t('visits.emptyVisitHint')}</p>}
          {lines.map((l) => (
            <div key={l.key} className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm">{l.name}</span>
              <Input aria-label={t('visits.quantity')} className="w-20" inputMode="numeric" value={String(l.quantity)}
                onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: Math.min(Math.max(n, 1), 999) } : x))); }} />
              <button type="button" className="rounded-full p-1 hover:bg-border" aria-label={t('visits.removeLine')} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><X aria-hidden className="size-4" /></button>
            </div>
          ))}
          <ConsumablePicker onPick={addLine} />
        </div>
        {(can(P.laboratory.order) || can(P.prescriptions.create)) && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">{t('visits.clinical.orders', { defaultValue: 'Examens et prescriptions' })}</p>
          <p className="text-xs text-muted-foreground">{t('visits.clinical.saveThenHint', { defaultValue: "Ces demandes sont rattachées à cette visite (traçabilité) : la visite est enregistrée d'abord, puis la fenêtre s'ouvre." })}</p>
          <div className="flex flex-wrap gap-2">
            {can(P.laboratory.order) && <Button size="sm" variant="outline" disabled={problem !== null || mVisit.isPending}
              onClick={() => { afterSave.current = 'lab'; mVisit.mutate({ admissionId: admission.id, type: vf.type, lines: lines.map((l) => ({ catalogItemId: l.itemId, quantity: l.quantity })), clinical }); }}>{t('visits.clinical.orderLabs')}</Button>}
            {can(P.prescriptions.create) && <Button size="sm" variant="outline" disabled={problem !== null || mVisit.isPending}
              onClick={() => { afterSave.current = 'rx'; mVisit.mutate({ admissionId: admission.id, type: vf.type, lines: lines.map((l) => ({ catalogItemId: l.itemId, quantity: l.quantity })), clinical }); }}>{t('visits.clinical.prescribe')}</Button>}
          </div>
        </div>
        )}
        {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
      </ActionDialog>

      <ActionDialog open={target !== null} onClose={closeAll} tone="danger" title={`${t('visits.reverseTitle')} — ${admission.patientName}`} description={t('visits.reverseBody')} submitLabel={t('visits.reverse')} pending={mReverse.isPending} canSubmit={reverseOk}
        onSubmit={() => target && mReverse.mutate({ admissionId: admission.id, consumptionId: target.id, reason, quantity: reverseQty })}>
        {target && <p className="text-sm font-medium">{target.name} — {target.net}</p>}
        <FormField label={t('visits.reverseQty')} required>{(c) => <Input {...c} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />}</FormField>
        <FormField label={t('visits.reason')} required>{(c) => <Textarea {...c} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
      </ActionDialog>
      {labFor && <NewLabOrderDialog initialPatientId={admission.patientId} visitId={labFor} onClose={() => setLabFor(null)} onCreated={() => setLabFor(null)} />}
      {rxFor && <NewRxDialog initialPatientId={admission.patientId} visitId={rxFor} onClose={() => setRxFor(null)} onCreated={() => setRxFor(null)} />}
    </DetailSection>
  );
}
