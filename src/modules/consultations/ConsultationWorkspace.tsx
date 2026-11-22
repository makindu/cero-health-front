import { Check, ChevronRight, CircleDot, FilePen, Lock, PenLine, Printer, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useDirtySource } from '@/core/unsaved/use-dirty-source';
import { ApiError } from '@/core/api';
import { useAuth } from '@/core/auth/cero-id';
import { clearDraft, loadDraft, saveDraft as saveLocalDraft } from '@/core/drafts/draft-store';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { useToast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can, usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { DemoNotice } from '../_shared/demo-notice';
import { useResourceItem } from '../_shared/use-resource';
import { usePreviousHistory } from './previous-history';
import { recordService } from './record-service';
import { patientService, type Patient } from '../patients/data';
import { AreaField, Panel, RichField } from './clinical/fields';
import { addAddendum, canTransition, emptyDraft, isLocked, logRevision, nextStatuses, progress, signatureIssues } from './clinical/logic';
import { SECTIONS, type ClinicalStatus, type ConsultationDraft, type SectionId } from './clinical/model';
import { consultationService, type Consultation } from './data';
import { buildConsultationReport } from './report';
import { buildReportHtml, printHtml } from './print';
import { openConsultationPdf } from './consultation-pdf';
import { referenceFromApi } from '../_shared/reference-data';
import { FollowUpScheduler } from './FollowUpScheduler';
import { AllergyAlert, AnamnesisSection, GeneralSection, HistorySection, newCtx } from './sections-a';
import { AssessmentSection, ExamSection, PlanSection } from './sections-b';
import { sanitizeDoc } from './richtext/doc';
import { Avatar } from '@/components/ui/avatar';

/** Copie locale presque immédiate ; envoi au serveur seulement après 3 minutes sans saisie (ou sur action explicite). */
const LOCAL_SAVE_DELAY_MS = 800;
const SERVER_SYNC_IDLE_MS = 3 * 60 * 1000;

const STATUS_TONE: Record<ClinicalStatus, StatusTone> = { draft: 'neutral', inProgress: 'info', awaitingResults: 'warning', toValidate: 'warning', signed: 'success', closed: 'success' };
const STATUS_ACTION: Partial<Record<ClinicalStatus, string>> = { inProgress: 'start', awaitingResults: 'await-results', toValidate: 'submit', signed: 'sign', closed: 'close' };

/** Restaure un brouillon reçu de l'API en le validant (jamais de HTML ni de structure inattendue). */
function restoreDraft(raw: ConsultationDraft | undefined, id: string, status: ClinicalStatus): ConsultationDraft {
  if (!raw) return emptyDraft(id, status);
  const base = emptyDraft(id, raw.status ?? status);
  return {
    ...base, ...raw,
    anamnesis: { ...base.anamnesis, ...raw.anamnesis, history: sanitizeDoc(raw.anamnesis?.history), notes: sanitizeDoc(raw.anamnesis?.notes) },
    antecedentNotes: sanitizeDoc(raw.antecedentNotes),
    exam: { ...base.exam, ...raw.exam, vitals: { ...base.exam.vitals, ...raw.exam?.vitals }, physical: sanitizeDoc(raw.exam?.physical) },
    evaluation: sanitizeDoc(raw.evaluation),
    plan: { ...base.plan, ...raw.plan, synthesis: sanitizeDoc(raw.plan?.synthesis), actions: sanitizeDoc(raw.plan?.actions) },
    conclusion: { ...base.conclusion, ...raw.conclusion, recommendations: sanitizeDoc(raw.conclusion?.recommendations) },
    // Le statut de la consultation fait foi (il change sans réenregistrer le brouillon) ; le brouillon ne peut pas le contredire.
    status,
  };
}

export default function ConsultationWorkspace() {
  const { id } = useParams();
  const consultation = useResourceItem('consultations', consultationService, id);
  const patient = useResourceItem('patients', patientService, consultation.data?.item.patientId);
  const record = useResourceItem('consultation-records', recordService, id, { fresh: true });
  // Nouvelle consultation d'un patient déjà suivi : on reprend ses antécédents connus (à revérifier par le médecin).
  const carried = usePreviousHistory(consultation.data?.item.patientId, id, consultation.data?.item.date);

  if (consultation.isPending) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;
  if (consultation.error || !consultation.data) return <ErrorState error={consultation.error} onRetry={() => void consultation.refetch()} />;
  // Tant que le dossier est relu (et qu'on n'en a pas), on n'affiche pas un formulaire vide : il ne se mettrait pas à jour ensuite.
  if (record.isPending || (record.fetchStatus === 'fetching' && !record.data)) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;
  const kind = (record.error as { kind?: string } | null)?.kind;
  if (record.error && kind !== 'not_found' && kind !== 'config') return <ErrorState error={record.error} onRetry={() => void record.refetch()} />;
  if (!record.data && carried.pending) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;
  const restored = restoreDraft(record.data?.item.draft, consultation.data.item.id, consultation.data.item.status);
  const initial = !record.data && carried.antecedents.length > 0 ? { ...restored, antecedents: carried.antecedents, antecedentNotes: carried.notes } : restored;

  return (
    <Workspace
      key={consultation.data.item.id}
      consultation={consultation.data.item}
      isDemo={consultation.data.isDemo}
      patient={patient.data?.item ?? null}
      initial={initial}
      hasRecord={Boolean(record.data)}
      carriedFrom={!record.data && carried.antecedents.length > 0 ? carried.from : undefined}
    />
  );
}

function Workspace({ consultation, isDemo, patient, initial, hasRecord, carriedFrom }: {
  consultation: Consultation; isDemo: boolean; patient: Patient | null; initial: ConsultationDraft; hasRecord: boolean; carriedFrom?: string;
}) {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  const toast = useToast();
  const [pdfBusy, setPdfBusy] = useState(false);
  const printPdf = (): void => {
    setPdfBusy(true);
    openConsultationPdf(consultation.id)
      .catch((error: unknown) => toast({ tone: 'danger', title: t('clinical.summary.pdfFailed', { defaultValue: 'Impossible de générer la fiche PDF.' }), description: error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined }))
      .finally(() => setPdfBusy(false));
  };
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  // Copie de sécurité sur l'appareil (sans réseau) : reprise si la page a été fermée avant l'envoi au serveur.
  const { user } = useAuth();
  const localKey = `consultation.${activeFacilityId}.${user?.id ?? 'anon'}.${consultation.id}`;
  const [localCopy] = useState<ConsultationDraft | null>(() => (isLocked(initial.status) || isDemo ? null : loadDraft<ConsultationDraft>(localKey)));
  const [draft, setDraft] = useState<ConsultationDraft>(() => (localCopy ? restoreDraft(localCopy, consultation.id, consultation.status) : initial));
  const [baseline, setBaseline] = useState<ConsultationDraft>(initial);
  const [dirty, setDirty] = useState(localCopy !== null);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<SectionId>('general');
  const [confirm, setConfirm] = useState<ClinicalStatus | null>(null);
  const [addendumText, setAddendumText] = useState('');
  const [recordExists, setRecordExists] = useState(hasRecord);
  const queryClient = useQueryClient();
  // Quitter l'écran avec des modifications non enregistrées : confirmation par la garde globale.

  const author = t('clinical.you');
  const locked = isLocked(draft.status);
  const canEditClinical = can(PERMISSIONS.consultations.update) && can(PERMISSIONS.medicalRecords.view);
  const readOnly = locked || !canEditClinical;
  const { done, percent } = progress(draft);
  const issues = signatureIssues(draft);

  const update = (fn: (d: ConsultationDraft) => ConsultationDraft) => {
    setDraft((d) => fn(d));
    setDirty(true);
  };

  /** Enregistre le dossier ET met à jour les copies en mémoire (sinon, en revenant sur l'écran, on relirait l'ancienne version). */
  async function persist(next: ConsultationDraft): Promise<{ isDemo: boolean; logged: ConsultationDraft }> {
    const logged = logRevision(baseline, next, newCtx(author));
    const result = recordExists
      ? await recordService.update(consultation.id, { draft: JSON.stringify(logged) })
      : await recordService.create({ id: consultation.id, draft: JSON.stringify(logged) });
    if (!result.isDemo) {
      setRecordExists(true);
      queryClient.setQueryData(queryKeys.scoped(activeFacilityId, 'consultation-records', 'item', consultation.id), { item: { id: consultation.id, draft: logged }, isDemo: false });
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'consultations') });
    }
    return { isDemo: result.isDemo, logged };
  }

  // Copie sur l'appareil : quasi immédiate, sans aucun appel au serveur (coupure de courant, onglet fermé…).
  useEffect(() => {
    if (!dirty || readOnly || isDemo) return;
    const id = setTimeout(() => saveLocalDraft(localKey, draft), LOCAL_SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [draft, dirty, readOnly, isDemo, localKey]);
  // Envoi au serveur : bouton « Enregistrer », changement d'état, sortie de l'écran, ou longue inactivité (le serveur est partagé par des milliers de médecins).
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const autoBusy = useRef(false);
  const [autoFailed, setAutoFailed] = useState(false);
  const [autoError, setAutoError] = useState('');
  const failures = useRef(0);
  const [lastAuto, setLastAuto] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const autoCapable = !readOnly && !isDemo;
  const autoSaveRef = useRef<() => Promise<void>>(async () => undefined);
  autoSaveRef.current = async () => {
    if (autoBusy.current || !dirtyRef.current || !autoCapable) return;
    autoBusy.current = true;
    const snapshot = draftRef.current;
    let again = true;
    try {
      const { isDemo: demo, logged } = await persist(snapshot);
      if (!demo) {
        failures.current = 0;
        setAutoFailed(false);
        setAutoError('');
        setLastAuto(new Date());
        // Si l'utilisateur a continué à écrire pendant l'enregistrement, on ne touche pas à sa saisie : la suite sera enregistrée au tour suivant.
        if (draftRef.current === snapshot) {
          setDraft(logged);
          setBaseline(logged);
          setDirty(false);
          clearDraft(localKey);
        }
      }
    } catch (error) {
      failures.current += 1;
      setAutoFailed(true);
      setAutoError(error instanceof Error ? error.message : '');
      // Refus du serveur (4xx) : réessayer à l'identique ne sert à rien, on attend la prochaine modification de l'utilisateur.
      // Panne passagère (réseau, serveur) : nouvel essai de plus en plus espacé (3 s, 6 s… 60 s max), jamais en rafale.
      const status = error instanceof ApiError ? error.status : undefined;
      if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
        again = false;
      } else {
        again = false;
        window.setTimeout(() => setTick((n) => n + 1), Math.min(60000, 3000 * 2 ** (failures.current - 1)));
      }
    } finally {
      autoBusy.current = false;
      if (again) setTick((n) => n + 1);
    }
  };
  useEffect(() => {
    if (!dirty || !autoCapable) return;
    const id = setTimeout(() => void autoSaveRef.current(), SERVER_SYNC_IDLE_MS);
    return () => clearTimeout(id);
  }, [draft, dirty, autoCapable, tick]);
  useEffect(() => {
    const flush = () => void autoSaveRef.current();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush(); // en quittant l'écran, on enregistre ce qui reste
    };
  }, []);
  // On n'interrompt l'utilisateur que si l'enregistrement automatique ne peut pas protéger sa saisie.
  useDirtySource(dirty && (!autoCapable || autoFailed));

  async function saveDraft() {
    setSaving(true);
    try {
      const { isDemo: demo, logged } = await persist(draft);
      if (demo) {
        toast({ tone: 'warning', title: t('clinical.save.demoTitle'), description: t('clinical.save.demoBody') });
      } else {
        setDraft(logged);
        setBaseline(logged);
        setDirty(false);
        clearDraft(localKey);
        toast({ tone: 'success', title: t('clinical.save.ok') });
      }
    } catch {
      toast({ tone: 'danger', title: t('clinical.save.failed'), description: t('clinical.save.failedBody') });
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(to: ClinicalStatus) {
    setConfirm(null);
    if (!canTransition(draft.status, to)) return;
    try {
      // Le serveur vérifie les éléments obligatoires à partir de ce qui est enregistré : on enregistre d'abord la saisie en cours.
      if (dirtyRef.current && !isDemo) await persist(draftRef.current);
      const result = await consultationService.command(consultation.id, STATUS_ACTION[to] ?? to, {});
      const patch: Partial<ConsultationDraft> = to === 'signed' ? { signedAt: new Date().toISOString(), signedBy: author } : {};
      if (result.isDemo) {
        // Aperçu local explicite : rien n'est enregistré, la bannière le rappelle.
        setDraft((d) => ({ ...d, ...patch, status: to }));
        toast({ tone: 'warning', title: t('clinical.status.previewTitle'), description: t('clinical.status.previewBody') });
      } else {
        // Le changement d'état et la signature doivent survivre à un rechargement : on enregistre aussi le dossier (avec ce qui a été saisi).
        const next = { ...draft, ...patch, status: to };
        const { logged } = await persist(next);
        setDraft(logged);
        setBaseline(logged);
        setDirty(false);
        toast({ tone: 'success', title: t('clinical.status.changed', { status: t(`status.${to}`) }) });
      }
    } catch {
      toast({ tone: 'danger', title: t('clinical.save.failed') });
    }
  }

  /** Le rendez-vous vient d'être créé au calendrier : on garde le lien dans le dossier tout de suite (sinon il serait perdu si l'écran est quitté). */
  async function scheduleFollowUp(next: { startsAt: string; appointmentId: string }) {
    const nextDraft = { ...draft, conclusion: { ...draft.conclusion, nextAppointment: next.startsAt, nextAppointmentId: next.appointmentId } };
    setDraft(nextDraft);
    try {
      const { isDemo: demo, logged } = await persist(nextDraft);
      if (!demo) {
        setDraft(logged);
        setBaseline(logged);
        setDirty(false);
      }
    } catch {
      setDirty(true);
      toast({ tone: 'danger', title: t('clinical.save.failed'), description: t('clinical.save.failedBody') });
    }
  }

  function addendum() {
    const next = addAddendum(draft, addendumText, newCtx(author));
    if (!next) return;
    setDraft(next);
    setDirty(true);
    setAddendumText('');
  }

  const reportCtx = useMemo(() => ({
    t, facility: t('clinical.report.facility'), isDemo, dateTime: f.dateTime,
    patientLines: [`${t('columns.patient')} : ${consultation.patientName} (${consultation.patientId})`, `${t('clinical.general.fileNumber')} : ${patient?.fileNumber ?? '—'}`],
    practitionerLines: [`${t('columns.practitioner')} : ${consultation.practitioner}`, `${t('columns.date')} : ${f.dateTime(consultation.date)}`, `${t('columns.service')} : ${t(`services.${consultation.service}`)}`],
  }), [t, f, isDemo, consultation, patient]);
  const reportHtml = useMemo(() => buildReportHtml(buildConsultationReport(draft, reportCtx)), [draft, reportCtx]);

  const sectionIcon = (s: SectionId) => (done.includes(s) ? <Check aria-hidden className="size-4 text-success" /> : <CircleDot aria-hidden className="size-4 text-muted-foreground" />);

  const clinicalGate = (node: ReactNode) => (
    <Can permission={PERMISSIONS.medicalRecords.view} fallback={<p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock aria-hidden className="size-4" />{t('clinical.noMedicalAccess')}</p>}>
      {node}
    </Can>
  );

  const content = {
    general: <GeneralSection consultation={consultation} patient={patient} />,
    anamnesis: clinicalGate(<AnamnesisSection draft={draft} update={update} readOnly={readOnly} />),
    history: clinicalGate(<HistorySection draft={draft} update={update} readOnly={readOnly} author={author} since={consultation.date} carriedFrom={carriedFrom} />),
    exam: clinicalGate(<ExamSection draft={draft} update={update} readOnly={readOnly} triageEntryId={consultation.triageEntryId} patientId={consultation.patientId} day={consultation.date} />),
    assessment: clinicalGate(<AssessmentSection draft={draft} update={update} readOnly={readOnly} author={author} />),
    plan: clinicalGate(<PlanSection draft={draft} update={update} readOnly={readOnly} patientId={consultation.patientId} consultationId={consultation.id} />),
    conclusion: clinicalGate(
      <div className="space-y-4">
        <AreaField label={t('clinical.conclusion.decision')} rows={2} value={draft.conclusion.decision} onChange={(v) => update((d) => ({ ...d, conclusion: { ...d.conclusion, decision: v } }))} disabled={readOnly} />
        <RichField label={t('clinical.conclusion.recommendations')} target="conclusion" value={draft.conclusion.recommendations} onChange={(v) => update((d) => ({ ...d, conclusion: { ...d.conclusion, recommendations: v } }))} disabled={readOnly} />
        <FollowUpScheduler consultation={consultation} readOnly={readOnly} value={{ startsAt: draft.conclusion.nextAppointment, appointmentId: draft.conclusion.nextAppointmentId ?? '' }} onScheduled={scheduleFollowUp} />

        <Panel title={t('clinical.validation.title')}>
          {issues.length > 0 && !locked ? (
            <ul className="list-disc space-y-1 ps-5 text-sm text-warning-ink">
              {issues.map((i) => <li key={i}>{t(`clinical.validation.issues.${i}`)}</li>)}
            </ul>
          ) : <p className="text-sm text-success-ink">{t('clinical.validation.ready')}</p>}
          <div className="flex flex-wrap gap-2">
            {nextStatuses(draft.status).map((to) => {
              const permission = to === 'signed' ? PERMISSIONS.consultations.sign : to === 'closed' ? PERMISSIONS.consultations.close : PERMISSIONS.consultations.update;
              const blocked = to === 'toValidate' && issues.length > 0;
              return (
                <Can key={to} permission={permission}>
                  <Button variant={to === 'signed' ? 'primary' : 'outline'} disabled={blocked} leftIcon={to === 'signed' ? <PenLine className="size-4" /> : undefined} onClick={() => setConfirm(to)}>
                    {t(`clinical.status.actions.${to}`)}
                  </Button>
                </Can>
              );
            })}
          </div>
          {draft.signedAt && <p className="text-sm text-muted-foreground">{t('clinical.report.signedBy', { by: draft.signedBy ?? '', when: f.dateTime(draft.signedAt) })}</p>}
        </Panel>

        <Panel title={t('clinical.summary.title')} actions={<div className="flex gap-2">{referenceFromApi() && !isDemo && <Button size="sm" loading={pdfBusy} leftIcon={<Printer className="size-4" />} onClick={printPdf}>{t('clinical.summary.printPdf', { defaultValue: 'Imprimer la fiche (PDF)' })}</Button>}{!(referenceFromApi() && !isDemo) && <Button size="sm" variant="outline" leftIcon={<Printer className="size-4" />} onClick={() => printHtml(reportHtml)}>{t('clinical.summary.print')}</Button>}</div>}>
          <p className="text-xs text-muted-foreground">{t('clinical.summary.hint')}</p>
          <iframe title={t('clinical.summary.title')} sandbox="" srcDoc={reportHtml} className="h-[28rem] w-full rounded-md border border-border bg-white" />
        </Panel>

        {locked && (
          <Panel title={t('clinical.addendum.title')}>
            <p className="text-sm text-muted-foreground">{t('clinical.addendum.hint')}</p>
            <ul className="space-y-1 text-sm">
              {draft.addenda.map((a) => <li key={a.id} className="rounded-md border border-border p-2"><span className="text-xs text-muted-foreground">{f.dateTime(a.at)} · {a.by}</span><br />{a.text}</li>)}
            </ul>
            <Can permission={PERMISSIONS.consultations.update}>
              <AreaField label={t('clinical.addendum.text')} value={addendumText} onChange={setAddendumText} />
              <Button onClick={addendum} disabled={addendumText.trim() === ''}>{t('clinical.addendum.add')}</Button>
            </Can>
          </Panel>
        )}

        <Panel title={t('clinical.revisions.title')}>
          {draft.revisions.length === 0 ? <p className="text-sm text-muted-foreground">{t('clinical.revisions.none')}</p> : (
            <ol className="space-y-1 text-sm">
              {draft.revisions.map((r, i) => <li key={i}>{f.dateTime(r.at)} · {r.by} · {r.sections.map((s) => t(`clinical.sections.${s}`)).join(', ')}</li>)}
            </ol>
          )}
          <p className="text-xs text-muted-foreground">{t('clinical.revisions.serverNote')}</p>
        </Panel>
      </div>,
    ),
  } satisfies Record<SectionId, ReactNode>;

  const index = SECTIONS.indexOf(section);
  const previewing = isDemo && draft.status !== initial.status;

  return (
    <>
      <PageHeader
        title={consultation.patientName}
        leading={<Avatar name={consultation.patientName} size="lg" />}
        description={`${consultation.id} · ${t(`services.${consultation.service}`)} · ${f.dateTime(consultation.date)}`}
        breadcrumbs={[{ label: t('title'), to: '/consultations' }, { label: consultation.patientName }]}
        actions={
          <>
            <StatusBadge tone={STATUS_TONE[draft.status]} icon={locked ? Lock : FilePen}>{t(`status.${draft.status}`)}</StatusBadge>
            {!locked && canEditClinical && (
              <Button leftIcon={<Save className="size-4" />} loading={saving} onClick={() => void saveDraft()}>{t('clinical.save.button')}</Button>
            )}
          </>
        }
      />
      {isDemo && <DemoNotice endpoint="/health/consultations" />}
      {localCopy && dirty && !autoFailed && <p role="status" className="mb-3 rounded-md bg-info-soft px-3 py-2 text-sm">{t('clinical.save.restored')}</p>}
      {previewing && <p role="status" className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">{t('clinical.status.previewBanner')}</p>}
      <div className="mb-3 space-y-2">
        <AllergyAlert antecedents={draft.antecedents} />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={dirty ? 'font-medium text-warning-ink' : 'text-muted-foreground'} role="status">
            {locked ? t('clinical.save.locked') : dirty ? (isDemo ? t('clinical.save.dirtyDemo') : autoCapable && !autoFailed ? t('clinical.save.localPending') : t('clinical.save.dirty')) : lastAuto ? t('clinical.save.autoDone', { when: f.dateTime(lastAuto.toISOString()) }) : t('clinical.save.clean')}
          </span>
          {autoFailed && autoError && !locked && <span role="alert" className="text-danger-ink">{autoError}</span>}
          <div className="flex min-w-40 flex-1 items-center gap-2" aria-label={t('clinical.progress', { percent })}>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"><div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div>
            <span className="tabular-nums text-muted-foreground">{percent}%</span>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <nav aria-label={t('clinical.navigation')} className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible lg:sticky lg:top-4 lg:self-start">
          {SECTIONS.map((s) => (
            <button key={s} type="button" aria-current={s === section ? 'step' : undefined} onClick={() => setSection(s)}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-surface-muted ${s === section ? 'bg-primary-soft font-medium text-primary-ink' : 'text-foreground'}`}>
              {sectionIcon(s)}{t(`clinical.sections.${s}`)}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          {locked && <p role="note" className="flex items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink"><Lock aria-hidden className="size-4" />{t('clinical.lockedNote')}</p>}
          {!canEditClinical && !locked && <p role="note" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">{t('clinical.readOnlyNote')}</p>}
          {content[section]}
          <div className="flex justify-between gap-2">
            <Button variant="outline" disabled={index === 0} onClick={() => setSection(SECTIONS[index - 1] ?? section)}>{t('clinical.previous')}</Button>
            <Button variant="outline" disabled={index === SECTIONS.length - 1} onClick={() => setSection(SECTIONS[index + 1] ?? section)}>{t('clinical.next')}<ChevronRight aria-hidden className="size-4" /></Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        title={confirm ? t(`clinical.status.actions.${confirm}`) : ''}
        description={confirm === 'signed' ? t('clinical.status.signBody') : confirm ? t('clinical.status.confirmBody') : ''}
        confirmLabel={t('clinical.confirm')}
        onConfirm={() => { if (confirm) void changeStatus(confirm); }}
      />
    </>
  );
}
