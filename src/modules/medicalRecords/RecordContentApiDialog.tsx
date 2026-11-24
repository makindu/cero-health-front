import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Lock, Printer } from 'lucide-react';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ApiError } from '@/core/api';
import { useAuth } from '@/core/auth/cero-id';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { isoDay } from '@/utils/dates';
import { useFormatters } from '@/core/i18n/useFormatters';
import { ActionDialog } from '../finance/ActionDialog';
import { XLSX_MIME, downloadBytes, safeFilename } from '../_shared/export/download';
import { buildXlsx } from '../_shared/export/xlsx';
import { buildReportHtml, printHtml } from '../consultations/print';
import { apiRecordContent, atCap, sizeLabel, type RecordContent } from './record-content-api';
import { buildApiRecordReport, buildApiRecordRows, collectApiEntries, type ApiExportContext, type ApiTranslate } from './record-api-export';
import type { ApiRecord } from './records-api';

/** Section que les droits de la personne ne couvrent pas : on le dit, on ne montre jamais « aucun élément » à la place. */
function Hidden() {
  const { t } = useTranslation('medicalRecords');
  return <p className="text-sm text-muted-foreground">{t('apiContent.hidden', { defaultValue: 'Section non accessible avec vos droits.' })}</p>;
}

function Section({ title, count, cap, children }: { title: string; count: number | null; cap: number; children: ReactNode }) {
  const { t } = useTranslation('medicalRecords');
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold">{title}{count !== null ? ` (${count})` : ''}</h3>
      {children}
      {atCap(count, cap) && <p className="text-xs text-muted-foreground">{t('apiContent.capped', { defaultValue: 'Seuls les {{cap}} plus récents sont affichés.', cap })}</p>}
    </section>
  );
}

const code = (t: (k: string, o: { defaultValue: string }) => string, group: string, v: string): string => (v === '' ? '—' : t(`apiContent.${group}.${v}`, { defaultValue: v }));

/**
 * Ouvrir le contenu d'un dossier : un accès nominatif enregistré par le serveur. La lecture ne part donc qu'après confirmation,
 * et une seule fois (pas de relecture automatique : chaque relecture serait un nouvel accès tracé).
 */
export function RecordContentApiDialog({ record, onClose }: { record: ApiRecord; onClose: () => void }) {
  const { t } = useTranslation(['medicalRecords', 'consultations', 'laboratory']);
  const f = useFormatters();
  const toast = useToast();
  const { user, activeFacility } = useAuth();
  const [content, setContent] = useState<RecordContent | null>(null);
  const [busy, setBusy] = useState<'print' | 'xlsx' | null>(null);
  const read = useMutation({
    mutationFn: () => apiRecordContent.open(record.id),
    onSuccess: setContent,
    onError: (e) => { toast({ tone: 'danger', title: e instanceof ApiError ? e.message : t('apiContent.failed', { defaultValue: 'Impossible d\'ouvrir le contenu' }) }); onClose(); },
  });
  /** Imprime ou exporte : le serveur relit le dossier pour cet usage, le trace à notre nom (droit d'export exigé), puis seulement on produit le document. */
  async function exportRecord(format: 'print' | 'xlsx'): Promise<void> {
    setBusy(format);
    try {
      const c = await apiRecordContent.open(record.id, format);
      const x: ApiExportContext = { t: t as unknown as ApiTranslate, date: f.date, dateTime: f.dateTime };
      const entries = collectApiEntries(c, x);
      if (format === 'print') {
        printHtml(buildReportHtml(buildApiRecordReport(record, entries, x, activeFacility?.name ?? '', user?.name ?? '', f.dateTime(new Date().toISOString()))));
      } else {
        downloadBytes(safeFilename(`dossier-${record.patientName}`, 'xlsx', isoDay(0, new Date())), buildXlsx(t('medicalRecords:export.sheet'), buildApiRecordRows(entries, x)), XLSX_MIME);
      }
    } catch (e) {
      toast({ tone: 'danger', title: e instanceof ApiError ? e.message : t('medicalRecords:export.failed') });
    } finally {
      setBusy(null);
    }
  }
  if (!content) {
    return (
      <ActionDialog open onClose={onClose} title={t('detail.confirmTitle')} description={t('detail.confirmBody')} submitLabel={t('detail.openContent')} pending={read.isPending} canSubmit onSubmit={() => read.mutate()}>
        <p className="text-sm">{record.patientName} — {record.number}</p>
      </ActionDialog>
    );
  }
  const cap = content.cap;
  return (
    <Dialog open onClose={onClose} variant="detail" title={t('apiContent.title', { defaultValue: 'Contenu du dossier — {{name}}', name: record.patientName })}
      headerActions={
        <Can permission={PERMISSIONS.medicalRecords.export}>
          <Button variant="ghost" size="icon" title={t('medicalRecords:export.print')} aria-label={t('medicalRecords:export.print')} loading={busy === 'print'} disabled={busy !== null} onClick={() => void exportRecord('print')}>
            {busy !== 'print' && <Printer aria-hidden className="size-5" />}
          </Button>
          <Button variant="ghost" size="icon" title={t('medicalRecords:export.xlsx')} aria-label={t('medicalRecords:export.xlsx')} loading={busy === 'xlsx'} disabled={busy !== null} onClick={() => void exportRecord('xlsx')}>
            {busy !== 'xlsx' && <FileSpreadsheet aria-hidden className="size-5" />}
          </Button>
        </Can>
      }>
      <div className="space-y-6">
        <p role="note" className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink"><Lock aria-hidden className="mt-0.5 size-4 shrink-0" />{t('sensitive')}</p>

        <Section title={t('detail.consultations')} count={content.consultations?.length ?? null} cap={cap}>
          {content.consultations === null ? <Hidden /> : content.consultations.length === 0 ? <p className="text-sm text-muted-foreground">{t('apiContent.none', { defaultValue: 'Aucun élément' })}</p> : (
            <ul className="space-y-2">{content.consultations.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-medium">{f.dateTime(c.at)}</span> — {c.reason || '—'} · {code(t, 'status', c.status)}
                {c.diagnoses.length > 0 && <ul className="ms-4 list-disc text-xs text-muted-foreground">{c.diagnoses.map((d, i) => <li key={i}>{d.label}{d.icd10 ? ` (${d.icd10})` : ''}</li>)}</ul>}
              </li>
            ))}</ul>
          )}
        </Section>

        <Section title={t('detail.prescriptions')} count={content.prescriptions?.length ?? null} cap={cap}>
          {content.prescriptions === null ? <Hidden /> : content.prescriptions.length === 0 ? <p className="text-sm text-muted-foreground">{t('apiContent.none', { defaultValue: 'Aucun élément' })}</p> : (
            <ul className="space-y-2">{content.prescriptions.map((p) => (
              <li key={p.id} className="text-sm">
                <span className="font-medium">{p.number}</span> — {f.dateTime(p.at)} · {code(t, 'status', p.status)}
                <ul className="ms-4 list-disc text-xs text-muted-foreground">{p.items.map((i, k) => <li key={k}>{[i.label, i.dosage, i.frequency, i.duration].filter(Boolean).join(' · ')}{i.quantity !== null ? ` × ${i.quantity}` : ''}</li>)}</ul>
              </li>
            ))}</ul>
          )}
        </Section>

        <Section title={t('detail.labOrders')} count={content.labOrders?.length ?? null} cap={cap}>
          {content.labOrders === null ? <Hidden /> : content.labOrders.length === 0 ? <p className="text-sm text-muted-foreground">{t('apiContent.none', { defaultValue: 'Aucun élément' })}</p> : (
            <ul className="space-y-2">{content.labOrders.map((o) => (
              <li key={o.id} className="text-sm">
                <span className="font-medium">{o.number}</span> — {f.dateTime(o.at)} · {code(t, 'status', o.status)}
                {o.tests.length > 0 && <ul className="ms-4 list-disc text-xs text-muted-foreground">{o.tests.map((x, k) => <li key={k}>{x.label}{x.value ? ` : ${x.value}${x.unit ? ` ${x.unit}` : ''}` : ''}{x.flag ? ` (${x.flag})` : ''}</li>)}</ul>}
              </li>
            ))}</ul>
          )}
        </Section>

        <Section title={t('apiContent.admissions', { defaultValue: 'Hospitalisations' })} count={content.admissions?.length ?? null} cap={cap}>
          {content.admissions === null ? <Hidden /> : content.admissions.length === 0 ? <p className="text-sm text-muted-foreground">{t('apiContent.none', { defaultValue: 'Aucun élément' })}</p> : (
            <ul className="space-y-2">{content.admissions.map((a) => (
              <li key={a.id} className="text-sm">
                <span className="font-medium">{a.number}</span> — {f.dateTime(a.at)} · {code(t, 'status', a.status)}{a.reason ? ` · ${a.reason}` : ''}{a.outcome ? ` · ${code(t, 'outcome', a.outcome)}` : ''}
                {a.visits === null ? <p className="ms-4 text-xs text-muted-foreground">{t('apiContent.visitsHidden', { defaultValue: 'Visites non accessibles avec vos droits.' })}</p>
                  : a.visits.length > 0 && <ul className="ms-4 list-disc text-xs text-muted-foreground">{a.visits.map((v) => <li key={v.id}>{f.dateTime(v.at)}{v.diagnosis ? ` — ${v.diagnosis}` : ''}</li>)}</ul>}
              </li>
            ))}</ul>
          )}
        </Section>

        <Section title={t('detail.documents')} count={content.documents?.length ?? null} cap={cap}>
          {content.documents === null ? <Hidden /> : content.documents.length === 0 ? <p className="text-sm text-muted-foreground">{t('apiContent.none', { defaultValue: 'Aucun élément' })}</p> : (
            <ul className="space-y-1">{content.documents.map((d) => <li key={d.id} className="text-sm">{d.type || '—'} · {d.mime || '—'} · {sizeLabel(d.sizeBytes)} · {f.dateTime(d.at)}</li>)}</ul>
          )}
        </Section>
      </div>
    </Dialog>
  );
}
