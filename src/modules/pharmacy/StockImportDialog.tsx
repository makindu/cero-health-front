import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { useFormatters } from '@/core/i18n/useFormatters';
import { XLSX_MIME, downloadBytes } from '../_shared/export/download';
import { buildXlsx } from '../_shared/export/xlsx';
import { readXlsx, XlsxReadError } from '../_shared/export/xlsx-read';
import { ActionDialog } from '../finance/ActionDialog';
import { pharmacy } from './pharmacy';
import type { StockItemView } from './pharmacy-service';
import { planStockImport, type ImportPlan } from './stock-sheet';
import { usePharmacyMutation } from './use-pharmacy';

const SHOWN_ERRORS = 15;
const SHOWN_LINES = 10;

/** Importation de lots depuis un classeur Excel : tout est vérifié et prévisualisé AVANT d'écrire ; une seule erreur bloque tout. */
export function StockImportDialog({ items, day, onClose }: { items: readonly StockItemView[]; day: string; onClose: () => void }) {
  const { t } = useTranslation('pharmacy');
  const f = useFormatters();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const run = usePharmacyMutation(pharmacy.importLots, { successTitle: t('stock.import.done'), onDone: onClose });

  async function pick(file: File | undefined): Promise<void> {
    setPlan(null);
    setReadError(null);
    setFileName(file?.name ?? '');
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setReadError(t('stock.import.read.notXlsx')); return; }
    try {
      setPlan(planStockImport(await readXlsx(new Uint8Array(await file.arrayBuffer())), items, day));
    } catch (e) {
      setReadError(t(`stock.import.read.${e instanceof XlsxReadError ? e.code : 'notXlsx'}`));
    }
  }

  const template = (): void => {
    const header = [t('stock.sheet.code'), t('stock.item'), t('stock.import.price'), t('stock.lotNumber'), t('stock.expiry'), t('stock.quantity')];
    downloadBytes(`${t('stock.import.templateFile')}.xlsx`, buildXlsx(t('stock.import.templateSheet'), [header]), XLSX_MIME);
  };
  const lines = plan?.lines ?? [];
  const errors = plan?.errors ?? [];
  const ready = plan !== null && !plan.fatal && errors.length === 0 && lines.length > 0;
  return (
    <ActionDialog open onClose={onClose} title={t('stock.import.title')} description={t('stock.import.help')} submitLabel={t('stock.import.submit', { count: lines.length })}
      pending={run.isPending} canSubmit={ready} onSubmit={() => run.mutate(lines.map((l) => ({ itemId: l.itemId, lotNumber: l.lotNumber, quantity: l.quantity, expiresAt: l.expiresAt, ...(l.newItem ? { newItem: l.newItem } : {}) })))}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">
          <span className="mb-1 block">{t('stock.import.file')}</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void pick(e.target.files?.[0])} className="block text-sm" />
        </label>
        <Button type="button" variant="outline" size="sm" onClick={template}>{t('stock.import.template')}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('stock.import.columns')}</p>
      {readError && <p role="alert" className="text-sm font-medium text-danger-ink">{readError}</p>}
      {plan?.fatal && <p role="alert" className="text-sm font-medium text-danger-ink">{t(`stock.import.fatal.${plan.fatal}`, { max: 500 })}</p>}
      {plan && !plan.fatal && (
        <>
          <p className="text-sm" role="status">{t('stock.import.summary', { file: fileName, ok: lines.length, errors: errors.length, created: plan.newItems.length })}</p>
          {errors.length > 0 && (
            <div role="alert" className="rounded-card border border-border p-3 text-sm">
              <p className="mb-1 font-medium text-danger-ink">{t('stock.import.errorsTitle')}</p>
              <ul className="list-disc space-y-0.5 ps-5">
                {errors.slice(0, SHOWN_ERRORS).map((e, i) => <li key={`${e.row}-${i}`}>{t(`stock.import.problem.${e.problem}`, { row: e.row, value: e.value ?? '' })}</li>)}
              </ul>
              {errors.length > SHOWN_ERRORS && <p className="mt-1 text-xs text-muted-foreground">{t('stock.import.moreErrors', { count: errors.length - SHOWN_ERRORS })}</p>}
            </div>
          )}
          {lines.length > 0 && (
            <table className="w-full text-xs">
              <caption className="mb-1 text-start font-medium">{t('stock.import.preview')}</caption>
              <thead><tr className="text-start"><th className="text-start">{t('stock.item')}</th><th className="text-start">{t('stock.lotNumber')}</th><th className="text-start">{t('stock.expiry')}</th><th className="text-end">{t('stock.quantity')}</th></tr></thead>
              <tbody>
                {lines.slice(0, SHOWN_LINES).map((l) => <tr key={l.row}><td>{l.itemLabel}{l.newItem && <span className="ms-1"><StatusBadge tone="success">{t('stock.import.newBadge', { price: l.newItem.price.toFixed(2).replace('.', ',') })}</StatusBadge></span>}</td><td>{l.lotNumber}</td><td>{l.expiresAt ? f.date(l.expiresAt) : '—'}</td><td className="text-end tabular-nums">{f.number(l.quantity)}</td></tr>)}
              </tbody>
            </table>
          )}
          {errors.length > 0 && <p className="text-xs text-muted-foreground">{t('stock.import.fixFirst')}</p>}
        </>
      )}
    </ActionDialog>
  );
}
