import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import type { CatalogItem } from '@/core/pricing/types';
import { XLSX_MIME, downloadBytes } from '../_shared/export/download';
import { buildXlsx } from '../_shared/export/xlsx';
import { readXlsx, XlsxReadError } from '../_shared/export/xlsx-read';
import { FileDropzone } from '../_shared/file-dropzone';
import { ActionDialog } from '../finance/ActionDialog';
import { importPharmacyCatalog } from './catalog-api';
import { planPharmacyImport, unitsText, MAX_IMPORT_EXTRAS, MAX_PHARMACY_IMPORT_ROWS, type PharmacyImportPlan } from './pharmacy-catalog-sheet';
import { usePharmacyMutation } from './use-pharmacy';

const fmt = (n: number): string => n.toFixed(2).replace('.', ',');

/**
 * Importation des médicaments, de leurs prix et de leurs unités de vente (boîte, plaquette, comprimé…) depuis un classeur Excel.
 * Tout est vérifié et prévisualisé AVANT d'écrire ; le serveur revérifie. Les lots ne sont pas concernés.
 */
export function PharmacyCatalogImportDialog({ existing, onClose }: { existing: readonly CatalogItem[]; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [plan, setPlan] = useState<PharmacyImportPlan | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const run = usePharmacyMutation(importPharmacyCatalog, { successTitle: t('pharmacyImport.done'), onDone: onClose });

  async function pick(file: File | undefined): Promise<void> {
    setPlan(null);
    setReadError(null);
    setFileName(file?.name ?? '');
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setReadError(t('catalogImport.read.notXlsx')); return; }
    try {
      setPlan(planPharmacyImport(await readXlsx(new Uint8Array(await file.arrayBuffer())), existing));
    } catch (e) {
      setReadError(t(`catalogImport.read.${e instanceof XlsxReadError ? e.code : 'notXlsx'}`));
    }
  }

  const template = (): void => {
    const h = (k: string): string => t(`pharmacyImport.header.${k}`);
    const extraHeader = Array.from({ length: 3 }, (_, i) => [`${h('extraUnit')} ${i + 1}`, `${h('extraContent')} ${i + 1}`, `${h('extraPrice')} ${i + 1}`]).flat();
    const header = [h('code'), h('label'), h('price'), h('active'), h('unit'), h('baseUnit'), h('perPack'), ...extraHeader];
    const multi = ['AMX-500', 'Amoxicilline 500 mg', 25, t('pharmacyImport.yes'), h('exBox'), h('exTablet'), 100, h('exStrip'), 10, 3, h('exTablet'), 1, 0.3, '', '', ''];
    const simple = ['', 'Paracétamol 500 mg', 2.5, t('pharmacyImport.yes'), '', '', '', '', '', '', '', '', '', '', '', ''];
    downloadBytes(`${t('pharmacyImport.templateFile')}.xlsx`, buildXlsx(t('pharmacyImport.templateSheet'), [header, multi, simple]), XLSX_MIME);
  };

  const rows = plan?.rows ?? [];
  const errors = plan?.errors ?? [];
  const changes = rows.filter((r) => r.action !== 'unchanged');
  const ready = plan !== null && !plan.fatal && errors.length === 0 && changes.length > 0;
  return (
    <ActionDialog open wide onClose={onClose} title={t('pharmacyImport.title')} description={t('pharmacyImport.help')}
      submitLabel={t('catalogImport.submit', { count: changes.length })} pending={run.isPending} canSubmit={ready}
      onSubmit={() => run.mutate({ items: changes.map((r) => ({ code: r.code, label: r.label, price: r.price, active: r.active, perPack: r.perPack, unit: r.unit, baseUnit: r.baseUnit, extras: r.extras })) })}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <span className="mb-1 block text-sm font-medium">{t('catalogImport.file')}</span>
          <FileDropzone accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" fileName={fileName} title={t('catalogImport.drop.title')} hint={t('catalogImport.drop.hint')}
            browseLabel={t('catalogImport.drop.browse')} changeLabel={t('catalogImport.drop.change')} onFile={(f) => void pick(f)} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={template}>{t('catalogImport.template')}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('pharmacyImport.columns', { max: MAX_IMPORT_EXTRAS })}</p>
      {readError && <p role="alert" className="text-sm font-medium text-danger-ink">{readError}</p>}
      {plan?.fatal && <p role="alert" className="text-sm font-medium text-danger-ink">{t(plan.fatal === 'missingColumns' ? 'pharmacyImport.fatal.missingColumns' : `catalogImport.fatal.${plan.fatal}`, { max: MAX_PHARMACY_IMPORT_ROWS })}</p>}
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
                {errors.map((e, i) => <li key={`${e.row}-${i}`}>{t(`pharmacyImport.problem.${e.problem}`, { row: e.row, value: e.value ?? '' })}</li>)}
              </ul>
            </div>
          )}
          {rows.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <caption className="mb-1 text-start font-medium">{t('catalogImport.preview')}</caption>
              <thead className="sticky top-0 bg-card"><tr><th className="text-start">{t('insurance.catalog.code')}</th><th className="text-start">{t('catalogManager.pharmacy.label')}</th><th className="text-start">{t('catalogManager.packaging.column')}</th><th className="text-end">{t('catalogManager.price')}</th><th className="text-start ps-3">{t('columns.status')}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row}>
                    <td><code>{r.code}</code></td>
                    <td>{r.label}</td>
                    <td>{unitsText(r)}</td>
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
