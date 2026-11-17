import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileSpreadsheet, Printer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/feedback/toast';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { getLocalContext } from '@/core/local/context';
import { isoDay } from '@/utils/dates';
import { describeBusinessError } from '../_shared/business-error';
import { XLSX_MIME, downloadBytes, safeFilename } from '../_shared/export/download';
import { buildXlsx } from '../_shared/export/xlsx';
import { buildReportHtml, printHtml } from '../consultations/print';
import { Dialog } from '@/components/ui/dialog';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePreferences } from '@/core/preferences/preferences-store';
import { recordService, type MedicalRecord } from './data';
import { loadConsultationDraft, loadRecordContent } from './record-content';
import { buildRecordReport, buildRecordRows, collectEntries, type ExportContext, type Translate } from './record-export';
import { AdmissionRecordDetail, ConsultationDetail, LabDetail, RxDetail } from './RecordItemDetail';

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className="text-sm font-semibold">{title}{count !== undefined ? ` (${count})` : ''}</h4>
      {children}
    </section>
  );
}

/**
 * Contenu d'un dossier, relevé en direct dans les autres modules au moment de l'ouverture : consultations, prescriptions, examens
 * et hospitalisations du patient. L'ouverture a déjà été tracée (commande « access ») ; chaque section respecte les droits de l'utilisateur.
 */
type Selected = { kind: 'consultation' | 'rx' | 'lab' | 'admission'; id: string } | null;

/** Ligne cliquable : ouvre le détail de l'élément dans la même fenêtre. */
function Row({ onOpen, label, children }: { onOpen: () => void; label: string; children: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onOpen} aria-label={label} className="flex w-full items-center justify-between gap-2 p-2 text-start hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring">
        <span className="min-w-0">{children}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

export function RecordContentDialog({ record, onClose }: { record: MedicalRecord; onClose: () => void }) {
  const [selected, setSelected] = useState<Selected>(null);
  const [busy, setBusy] = useState<'print' | 'xlsx' | null>(null);
  const toast = useToast();
  const { t } = useTranslation(['medicalRecords', 'consultations', 'prescriptions', 'laboratory', 'hospitalization']);
  const f = useFormatters();
  const { activeFacilityId } = usePreferences();
  const content = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'medicalRecords', 'content', record.patientId),
    queryFn: () => loadRecordContent(record.patientId),
    gcTime: 0,
  });
  const c = content.data;

  /** Imprime ou exporte le dossier. L'opération est d'abord TRACÉE (journal d'audit) : sans trace, rien n'est produit. */
  async function exportRecord(format: 'print' | 'xlsx'): Promise<void> {
    if (!c) return;
    setBusy(format);
    try {
      await recordService.command(record.id, 'export', { format });
      const drafts: Record<string, Awaited<ReturnType<typeof loadConsultationDraft>>> = {};
      await Promise.all((c.consultations ?? []).map(async (x) => { try { drafts[x.id] = await loadConsultationDraft(x.id); } catch { drafts[x.id] = null; } }));
      const ctx: ExportContext = { t: t as unknown as Translate, date: f.date, dateTime: f.dateTime, drafts };
      const entries = collectEntries(c, ctx);
      if (format === 'print') {
        printHtml(buildReportHtml(buildRecordReport(record, entries, ctx, getLocalContext().actor.name, f.dateTime(new Date().toISOString()))));
      } else {
        downloadBytes(safeFilename(`dossier-${record.patientName}`, 'xlsx', isoDay(0, new Date())), buildXlsx(t('medicalRecords:export.sheet'), buildRecordRows(entries, ctx)), XLSX_MIME);
      }
    } catch (error) {
      toast({ tone: 'danger', title: t('medicalRecords:export.failed'), description: describeBusinessError(t as never, error) ?? undefined });
    } finally {
      setBusy(null);
    }
  }
  const none = <p className="text-sm text-muted-foreground">{t('medicalRecords:content.none')}</p>;
  const denied = <p className="text-sm text-muted-foreground">{t('medicalRecords:content.denied')}</p>;
  const list = (rows: ReactNode[]) => <ul className="divide-y divide-border rounded-md border border-border text-sm">{rows}</ul>;

  return (
    <Dialog open onClose={onClose} variant="detail" title={t('medicalRecords:content.title', { name: record.patientName })} description={t('medicalRecords:content.note')}
      headerActions={
        <Can permission={PERMISSIONS.medicalRecords.export}>
          <Button variant="ghost" size="icon" title={t('medicalRecords:export.print')} aria-label={t('medicalRecords:export.print')} loading={busy === 'print'} disabled={!c || busy !== null} onClick={() => void exportRecord('print')}>
            {busy !== 'print' && <Printer aria-hidden className="size-5" />}
          </Button>
          <Button variant="ghost" size="icon" title={t('medicalRecords:export.xlsx')} aria-label={t('medicalRecords:export.xlsx')} loading={busy === 'xlsx'} disabled={!c || busy !== null} onClick={() => void exportRecord('xlsx')}>
            {busy !== 'xlsx' && <FileSpreadsheet aria-hidden className="size-5" />}
          </Button>
        </Can>
      }
      footer={
        // Petit écran : deux boutons par ligne, pleine largeur ; grand écran : alignés à droite.
        <div className={`grid w-full gap-2 sm:flex sm:justify-end [&>button]:w-full sm:[&>button]:w-auto ${selected ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {selected && <Button variant="outline" onClick={() => setSelected(null)}>{t('medicalRecords:content.back')}</Button>}
          <Button variant="outline" onClick={onClose}>{t('medicalRecords:content.close')}</Button>
        </div>
      }>
      {content.isPending && <p className="text-sm text-muted-foreground">{t('medicalRecords:content.loading')}</p>}
      {content.isError && <p className="text-sm text-danger">{t('medicalRecords:content.failed')}</p>}
      {c && selected && (
        <div className="space-y-3">
          {selected.kind === 'consultation' && c.consultations?.find((x) => x.id === selected.id) && <ConsultationDetail item={c.consultations.find((x) => x.id === selected.id)!} />}
          {selected.kind === 'rx' && c.prescriptions?.find((x) => x.id === selected.id) && <RxDetail item={c.prescriptions.find((x) => x.id === selected.id)!} />}
          {selected.kind === 'lab' && c.labOrders?.find((x) => x.order.id === selected.id) && <LabDetail item={c.labOrders.find((x) => x.order.id === selected.id)!.order} />}
          {selected.kind === 'admission' && c.admissions?.find((x) => x.admission.id === selected.id) && <AdmissionRecordDetail item={c.admissions.find((x) => x.admission.id === selected.id)!} />}
        </div>
      )}
      {c && !selected && (
        <div className="space-y-5">
          <Section title={t('medicalRecords:detail.consultations')} count={c.consultations?.length}>
            {c.consultations === null ? denied : c.consultations.length === 0 ? none : list(c.consultations.map((x) => (
              <Row key={x.id} label={t('medicalRecords:content.open')} onOpen={() => setSelected({ kind: 'consultation', id: x.id })}>
                <strong>{f.date(x.date)}</strong> · {t(`consultations:reason.${x.reason}`)} · {t(`consultations:status.${x.status}`)}
                <span className="block text-xs text-muted-foreground">{x.practitioner}</span>
              </Row>
            )))}
          </Section>
          <Section title={t('medicalRecords:detail.prescriptions')} count={c.prescriptions?.length}>
            {c.prescriptions === null ? denied : c.prescriptions.length === 0 ? none : list(c.prescriptions.map((x) => (
              <Row key={x.id} label={t('medicalRecords:content.open')} onOpen={() => setSelected({ kind: 'rx', id: x.id })}>
                <strong>{x.number}</strong> · {f.date(x.prescribedAt)} · {t(`prescriptions:status.${x.status}`)}
                <span className="block text-xs text-muted-foreground">{x.items.map((i) => i.label).join(', ')} — {x.prescriber}</span>
              </Row>
            )))}
          </Section>
          <Section title={t('medicalRecords:detail.labOrders')} count={c.labOrders?.length}>
            {c.labOrders === null ? denied : c.labOrders.length === 0 ? none : list(c.labOrders.map(({ order }) => (
              <Row key={order.id} label={t('medicalRecords:content.open')} onOpen={() => setSelected({ kind: 'lab', id: order.id })}>
                <strong>{order.number}</strong> · {f.date(order.requestedAt)} · {t(`laboratory:status.${order.status}`)}
                <span className="block text-xs text-muted-foreground">{order.tests.map((x) => x.label).join(', ')}</span>
              </Row>
            )))}
          </Section>
          <Section title={t('medicalRecords:content.hospitalizations')} count={c.admissions?.length}>
            {c.admissions === null ? denied : c.admissions.length === 0 ? none : list(c.admissions.map(({ admission, diagnosis }) => (
              <Row key={admission.id} label={t('medicalRecords:content.open')} onOpen={() => setSelected({ kind: 'admission', id: admission.id })}>
                <strong>{admission.number}</strong> · {f.date(admission.admittedAt)} · {t(`hospitalization:admissionStatus.${admission.status}`)}
                {diagnosis && <span className="block text-xs text-muted-foreground">{t('medicalRecords:content.lastDiagnosis')} : {diagnosis}</span>}
              </Row>
            )))}
          </Section>
          {record.lastAccess && <p className="text-xs text-muted-foreground">{t('medicalRecords:content.lastAccess', { by: record.lastAccess.by, at: f.dateTime(record.lastAccess.at) })}</p>}
        </div>
      )}
    </Dialog>
  );
}

/**
 * Nombre d'éléments du dossier, calculé en direct sur les données locales (et non plus lu dans le jeu de démonstration).
 * Une section illisible avec les droits de l'utilisateur affiche « — » ; les documents n'ont pas encore de module : valeur du dossier.
 */
export function RecordCounts({ record }: { record: MedicalRecord }) {
  const { t } = useTranslation('medicalRecords');
  const { activeFacilityId } = usePreferences();
  const content = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'medicalRecords', 'counts', record.patientId),
    queryFn: () => loadRecordContent(record.patientId),
    gcTime: 0,
  });
  const c = content.data;
  const n = (rows: unknown[] | null | undefined, fallback: number): string => (content.isPending ? '…' : rows ? String(rows.length) : c ? '—' : String(fallback));
  return (
    <DetailSection title={t('detail.contents')}>
      <DescriptionList items={[
        { label: t('detail.consultations'), value: n(c?.consultations, record.counts.consultations) },
        { label: t('detail.prescriptions'), value: n(c?.prescriptions, record.counts.prescriptions) },
        { label: t('detail.labOrders'), value: n(c?.labOrders, record.counts.labOrders) },
        { label: t('detail.documents'), value: String(record.counts.documents) },
      ]} />
    </DetailSection>
  );
}
