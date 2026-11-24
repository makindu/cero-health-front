import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import type { CatalogItem } from '@/core/pricing/types';
import { XLSX_MIME, downloadBytes } from '../_shared/export/download';
import { buildXlsx } from '../_shared/export/xlsx';
import { readXlsx, XlsxReadError } from '../_shared/export/xlsx-read';
import { FileDropzone } from '../_shared/file-dropzone';
import { planCatalogImport, type CatalogImportPlan } from '../catalog/catalog-sheet';
import { ActionDialog } from '../finance/ActionDialog';
import { importServicesCatalog, useServicesMutation } from './services-catalog-api';

const fmt = (n: number): string => n.toFixed(2).replace('.', ',');

/** Importation des prestations et de leurs tarifs depuis un classeur Excel : tout est vérifié et prévisualisé AVANT d'écrire ; le serveur revérifie. */
export function ServicesCatalogImportDialog({ existing, onClose }: { existing: readonly CatalogItem[]; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [plan, setPlan] = useState<CatalogImportPlan | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const run = useServicesMutation(importServicesCatalog, { successTitle: t('servicesCatalog.import.done'), onDone: onClose });

  async function pick(file: File | undefined): Promise<void> {
    setPlan(null);
    setReadError(null);
    setFileName(file?.name ?? '');
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setReadError(t('catalogImport.read.notXlsx')); return; }
    try {
      setPlan(planCatalogImport(await readXlsx(new Uint8Array(await file.arrayBuffer())), existing, 'procedure'));
    } catch (e) {
      setReadError(t(`catalogImport.read.${e instanceof XlsxReadError ? e.code : 'notXlsx'}`));
    }
  }

  const template = (): void => {
    const header = [t('insurance.catalog.code'), t('servicesCatalog.label'), t('catalogManager.price'), t('insurance.catalog.active')];
    const example = ['CONS-GEN', t('servicesCatalog.import.example'), 10, t('pharmacyImport.yes')];
    downloadBytes(`${t('servicesCatalog.import.templateFile')}.xlsx`, buildXlsx(t('servicesCatalog.import.templateSheet'), [header, example]), XLSX_MIME);
  };

  const rows = plan?.rows ?? [];
  const errors = plan?.errors ?? [];
  const changes = rows.filter((r) => r.action !== 'unchanged');
  const ready = plan !== null && !plan.fatal && errors.length === 0 && changes.length > 0;
  return (
    <ActionDialog open wide onClose={onClose} title={t('servicesCatalog.import.title')} description={t('servicesCatalog.import.help')}
      submitLabel={t('catalogImport.submit', { count: changes.length })} pending={run.isPending} canSubmit={ready}
      onSubmit={() => run.mutate({ items: changes.map((r) => ({ code: r.code, label: r.label, price: r.price, active: r.active })) })}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <span className="mb-1 block text-sm font-medium">{t('catalogImport.file')}</span>
          <FileDropzone accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" fileName={fileName} title={t('catalogImport.drop.title')} hint={t('catalogImport.drop.hint')}
            browseLabel={t('catalogImport.drop.browse')} changeLabel={t('catalogImport.drop.change')} onFile={(f) => void pick(f)} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={template}>{t('catalogImport.template')}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('servicesCatalog.import.columns')}</p>
      {readError && <p role="alert" className="text-sm font-medium text-danger-ink">{readError}</p>}
      {plan?.fatal && <p role="alert" className="text-sm font-medium text-danger-ink">{t(`catalogImport.fatal.${plan.fatal}`, { max: 500 })}</p>}
      {plan && !plan.fatal && (
        <>
          <p className="text-sm" role="status">{t('catalogImport.summary', {
            file: fileName, created: rows.filter((r) => r.action === 'create').length, updated: rows.filter((r) => r.action === 'update').length,
            unchanged: rows.filter((r) => r.action === 'unchanged').length, errors: errors.length,
          })}</p>
          {errors.length > 0 && (
            <div role="alert" className="rounded-card border border-border p-3 text-sm">
              <p className="mb-1 font-medium text-danger-ink">{t('catalogImport.errorsTitle')}</p>
              <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto ps-5">
                {errors.map((e, i) => <li key={`${e.row}-${i}`}>{t(`catalogImport.problem.${e.problem}`, { row: e.row, value: e.value ?? '' })}</li>)}
              </ul>
            </div>
          )}
          {rows.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <caption className="mb-1 text-start font-medium">{t('catalogImport.preview')}</caption>
                <thead className="sticky top-0 bg-surface"><tr><th className="text-start">{t('insurance.catalog.code')}</th><th className="text-start">{t('servicesCatalog.label')}</th><th className="text-end">{t('catalogManager.price')}</th><th className="text-start ps-3">{t('columns.status')}</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row}>
                      <td><code>{r.code}</code></td>
                      <td>{r.label}</td>
                      <td className="text-end tabular-nums">{r.previous && r.previous.price !== r.price ? `${fmt(r.previous.price)} → ${fmt(r.price)}` : fmt(r.price)}</td>
                      <td className="ps-3"><StatusBadge tone={r.action === 'create' ? 'success' : r.action === 'update' ? 'info' : 'neutral'}>{t(`catalogImport.action.${r.action}`)}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {errors.length > 0 && <p className="text-xs text-muted-foreground">{t('catalogImport.fixFirst')}</p>}
        </>
      )}
    </ActionDialog>
  );
}
