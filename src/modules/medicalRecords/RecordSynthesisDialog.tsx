import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { useToast } from '@/components/feedback/toast';
import { ApiError } from '@/core/api';
import { useAuth } from '@/core/auth/cero-id';
import { useFormatters } from '@/core/i18n/useFormatters';
import { ActionDialog } from '../finance/ActionDialog';
import { PDF_MIME, downloadBytes, safeFilename } from '../_shared/export/download';
import { DOCX_MIME, buildDocx } from '../_shared/export/docx';
import { buildDocumentPdf } from '../_shared/export/document-pdf';
import { fetchEnterpriseLogo } from './enterprise-logo';
import { apiRecordContent } from './record-content-api';
import { WHOLE_RECORD, periodInvalid, synthesize, type Period } from './record-synthesis';
import { buildSynthesisBlocks, letterheadFrom, type Translate } from './record-synthesis-doc';
import type { ApiRecord } from './records-api';

type Format = 'pdf' | 'docx';

/**
 * Synthèse du dossier en PDF (à remettre) ou en Word (à retoucher). Elle regroupe les consultations au lieu de les recopier.
 * Chaque génération est un export : le serveur l'enregistre dans le journal d'audit, et exige le droit d'export.
 */
export function RecordSynthesisDialog({ record, onClose }: { record: ApiRecord; onClose: () => void }) {
  const { t } = useTranslation('medicalRecords');
  const f = useFormatters();
  const toast = useToast();
  const { user, activeFacility } = useAuth();
  const [format, setFormat] = useState<Format>('pdf');
  const [period, setPeriod] = useState<Period>(WHOLE_RECORD);
  const bad = periodInvalid(period);
  const run = useMutation({
    mutationFn: async (): Promise<'done' | 'empty'> => {
      const content = await apiRecordContent.open(record.id, format === 'pdf' ? 'summary_pdf' : 'summary_docx');
      const s = synthesize(content, period);
      if (s.empty) return 'empty';
      const today = new Date().toISOString();
      const tr = t as unknown as Translate;
      const blocks = buildSynthesisBlocks(s, {
        t: tr, date: f.date, patientName: record.patientName, patientNumber: record.patientNumber,
        recordNumber: record.number, generatedOn: f.date(today), period,
        sex: content.identity?.sex, birthDate: content.identity?.birthDate, today: today.slice(0, 10), author: user?.name,
      });
      // L'en-tête vient du serveur (établissement actif) ; à défaut, au moins le nom de l'établissement choisi à la connexion.
      const lh = letterheadFrom(content.enterprise, activeFacility?.name ?? '', tr);
      // Logo de l'établissement (CERO ID) : facultatif, jamais bloquant.
      const logo = await fetchEnterpriseLogo(activeFacility?.id);
      const meta = {
        title: t('synthesis.title', { defaultValue: 'Synthèse du dossier médical' }),
        footer: `${t('synthesis.footerLabel', { defaultValue: 'Synthèse' })} ${record.number}`,
        letterhead: lh.name !== '' || lh.lines.length > 0 || logo ? { ...lh, logo: logo ?? undefined } : undefined,
        confidential: t('synthesis.confidential', { defaultValue: 'Document médical confidentiel : réservé au patient et aux professionnels de santé qui le prennent en charge.' }),
        pageLabel: t('synthesis.page', { defaultValue: 'Page' }),
      };
      const base = `synthese-${record.number}`;
      if (format === 'pdf') downloadBytes(safeFilename(base, 'pdf', today.slice(0, 10)), buildDocumentPdf(blocks, meta), PDF_MIME);
      else downloadBytes(safeFilename(base, 'docx', today.slice(0, 10)), buildDocx(blocks, meta), DOCX_MIME);
      return 'done';
    },
    onSuccess: (r) => toast(r === 'done'
      ? { tone: 'success', title: t('synthesis.downloaded', { defaultValue: 'Synthèse téléchargée' }) }
      : { tone: 'info', title: t('synthesis.nothing', { defaultValue: 'Rien à résumer dans cette période' }), description: t('synthesis.nothingHint', { defaultValue: 'Aucun fichier n’a été créé. Élargissez la période.' }) }),
    onError: (e) => toast({ tone: 'danger', title: e instanceof ApiError ? e.message : t('synthesis.failed', { defaultValue: 'Impossible de générer la synthèse' }) }),
  });
  return (
    <ActionDialog open onClose={onClose} title={t('synthesis.dialogTitle', { defaultValue: 'Synthèse du dossier' })}
      description={t('synthesis.dialogBody', { defaultValue: 'Résumé de toutes les consultations, ordonnances et analyses : motifs, diagnostics et traitements récurrents, sans recopier chaque consultation. Chaque génération est enregistrée dans le journal d’audit à votre nom.' })}
      submitLabel={format === 'pdf' ? t('synthesis.makePdf', { defaultValue: 'Générer le PDF' }) : t('synthesis.makeDocx', { defaultValue: 'Générer le fichier Word' })}
      pending={run.isPending} canSubmit={!bad} onSubmit={() => run.mutate()}>
      <FormField label={t('synthesis.format', { defaultValue: 'Format' })} hint={format === 'docx' ? t('synthesis.docxHint', { defaultValue: 'Modifiable : corrigez ou complétez le texte avant de le remettre.' }) : t('synthesis.pdfHint', { defaultValue: 'Prêt à remettre ou à imprimer.' })}>
        {(c) => <Select {...c} value={format} onChange={(e) => setFormat(e.target.value as Format)}>
          <option value="pdf">{t('synthesis.pdf', { defaultValue: 'PDF' })}</option>
          <option value="docx">{t('synthesis.docx', { defaultValue: 'Word (modifiable)' })}</option>
        </Select>}
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('synthesis.from', { defaultValue: 'Du (facultatif)' })}>{(c) => <Input {...c} type="date" value={period.from} max={period.to || undefined} onChange={(e) => setPeriod({ ...period, from: e.target.value })} />}</FormField>
        <FormField label={t('synthesis.to', { defaultValue: 'Au (facultatif)' })}>{(c) => <Input {...c} type="date" value={period.to} min={period.from || undefined} onChange={(e) => setPeriod({ ...period, to: e.target.value })} />}</FormField>
      </div>
      {bad && <p role="alert" className="text-sm text-danger-ink">{t('synthesis.badPeriod', { defaultValue: 'La date de fin doit suivre la date de début.' })}</p>}
    </ActionDialog>
  );
}
