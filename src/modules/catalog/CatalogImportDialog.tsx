import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import type { CatalogItem } from '@/core/pricing/types';
import { XLSX_MIME, downloadBytes } from '../_shared/export/download';
import { buildXlsx } from '../_shared/export/xlsx';
import { readXlsx, XlsxReadError } from '../_shared/export/xlsx-read';
import { ActionDialog } from '../finance/ActionDialog';
import { finance } from '../finance/finance';
import { useFinanceMutation } from '../finance/use-finance';
import { planCatalogImport, type CatalogImportPlan } from './catalog-sheet';

const SHOWN_ERRORS = 15;
const SHOWN_ROWS = 12;
const fmt = (n: number): string => n.toFixed(2).replace('.', ',');

/** Importation des examens de laboratoire et de leurs prix depuis un classeur Excel : tout est vérifié et prévisualisé AVANT d'écrire. */
export function CatalogImportDialog({ existing, onClose }: { existing: readonly CatalogItem[]; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [plan, setPlan] = useState<CatalogImportPlan | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const run = useFinanceMutation(finance.importLabCatalog, { successTitle: t('catalogImport.done'), onDone: onClose });

  async function pick(file: File | undefined): Promise<void> {
    setPlan(null);
    setReadError(null);
    setFileName(file?.name ?? '');
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setReadError(t('catalogImport.read.notXlsx')); return; }
    try {
      setPlan(planCatalogImport(await readXlsx(new Uint8Array(await file.arrayBuffer())), existing, 'laboratory'));
    } catch (e) {
      setReadError(t(`catalogImport.read.${e instanceof XlsxReadError ? e.code : 'notXlsx'}`));
    }
  }

  const template = (): void => {
    const header = [t('insurance.catalog.code'), t('catalogManager.laboratory.label'), t('catalogManager.price'), t('insurance.catalog.active')];
    downloadBytes(`${t('catalogImport.templateFile')}.xlsx`, buildXlsx(t('catalogImport.templateSheet'), [header]), XLSX_MIME);
  };

  const rows = plan?.rows ?? [];
  const errors = plan?.errors ?? [];
  const changes = rows.filter((r) => r.action !== 'unchanged');
  const ready = plan !== null && !plan.fatal && errors.length === 0 && changes.length > 0;
  return (
    <ActionDialog open wide onClose={onClose} title={t('catalogImport.title')} description={t('catalogImport.help')}
      submitLabel={t('catalogImport.submit', { count: changes.length })} pending={run.isPending} canSubmit={ready}
      onSubmit={() => run.mutate({ items: changes.map((r) => ({ ...(r.id ? { id: r.id } : {}), code: r.code, label: r.label, price: Math.round(r.price * 100), active: r.active })) })}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">
          <span className="mb-1 block">{t('catalogImport.file')}</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void pick(e.target.files?.[0])} className="block text-sm" />
        </label>
        <Button type="button" variant="outline" size="sm" onClick={template}>{t('catalogImport.template')}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('catalogImport.columns')}</p>
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
              <ul className="list-disc space-y-0.5 ps-5">
                {errors.slice(0, SHOWN_ERRORS).map((e, i) => <li key={`${e.row}-${i}`}>{t(`catalogImport.problem.${e.problem}`, { row: e.row, value: e.value ?? '' })}</li>)}
              </ul>
              {errors.length > SHOWN_ERRORS && <p className="mt-1 text-xs text-muted-foreground">{t('catalogImport.moreErrors', { count: errors.length - SHOWN_ERRORS })}</p>}
            </div>
          )}
          {rows.length > 0 && (
            <table className="w-full text-xs">
              <caption className="mb-1 text-start font-medium">{t('catalogImport.preview')}</caption>
              <thead><tr><th className="text-start">{t('insurance.catalog.code')}</th><th className="text-start">{t('catalogManager.laboratory.label')}</th><th className="text-end">{t('catalogManager.price')}</th><th className="text-start ps-3">{t('columns.status')}</th></tr></thead>
              <tbody>
                {rows.slice(0, SHOWN_ROWS).map((r) => (
                  <tr key={r.row}>
                    <td><code>{r.code}</code></td>
                    <td>{r.label}</td>
                    <td className="text-end tabular-nums">{r.previous && r.previous.price !== r.price ? `${fmt(r.previous.price)} → ${fmt(r.price)}` : fmt(r.price)}</td>
                    <td className="ps-3"><StatusBadge tone={r.action === 'create' ? 'success' : r.action === 'update' ? 'info' : 'neutral'}>{t(`catalogImport.action.${r.action}`)}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length > SHOWN_ROWS && <p className="text-xs text-muted-foreground">{t('catalogImport.moreRows', { count: rows.length - SHOWN_ROWS })}</p>}
          {errors.length > 0 && <p className="text-xs text-muted-foreground">{t('catalogImport.fixFirst')}</p>}
        </>
      )}
    </ActionDialog>
  );
}
