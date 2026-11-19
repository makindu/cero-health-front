import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { env } from '@/core/config/env';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { isoDay } from '@/utils/dates';
import { PDF_MIME, XLSX_MIME, downloadBytes, safeFilename } from '../_shared/export/download';
import { buildPdf } from '../_shared/export/pdf';
import { buildXlsx } from '../_shared/export/xlsx';
import type { StockItemView } from './pharmacy-service';
import { stockSheet } from './stock-sheet';

/** Fiche de stock en Excel ou PDF : une ligne par lot, générée dans le navigateur à partir de ce qui est affiché. */
export function StockExportMenu({ items, day }: { items: readonly StockItemView[]; day: string }) {
  const { t } = useTranslation('pharmacy');
  const { t: tc } = useTranslation();
  const f = useFormatters();
  const toast = useToast();

  function run(format: 'xlsx' | 'pdf'): void {
    try {
      const { header, rows } = stockSheet(items, day, {
        code: t('stock.sheet.code'), item: t('stock.item'), lot: t('stock.lotNumber'), expiry: t('stock.expiry'), quantity: t('stock.quantity'),
        status: t('stock.sheet.status'), ok: t('stock.sheet.ok'), expired: t('stock.expired'), out: t('stock.sheet.out'),
      });
      const title = t('stock.sheet.title');
      const now = new Date();
      const notes = [`${tc('export.generatedAt')} ${f.dateTime(now)} · ${tc('export.rows', { count: rows.length })}`, ...(env.localMode ? [tc('export.demoMark')] : [])];
      const name = safeFilename(t('stock.sheet.filename'), format, isoDay(0, now));
      if (format === 'xlsx') downloadBytes(name, buildXlsx(title, [[title], ...notes.map((n) => [n]), [], header, ...rows]), XLSX_MIME);
      else downloadBytes(name, buildPdf({ title, notes, header, rows: rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c)))) }), PDF_MIME);
      toast({ tone: 'success', title: tc('export.done') });
    } catch {
      toast({ tone: 'danger', title: tc('export.failed') });
    }
  }

  return (
    <Can permission={P.inventory.view}>
      <Dropdown label={t('stock.exportMenu')} trigger={<><Download aria-hidden className="size-4" /><span className="px-1 text-sm">{t('stock.exportMenu')}</span></>}>
        {(close) => (
          <>
            <DropdownItem icon={<FileSpreadsheet className="size-4" />} onClick={() => { close(); run('xlsx'); }}>{tc('export.excel')}</DropdownItem>
            <DropdownItem icon={<FileText className="size-4" />} onClick={() => { close(); run('pdf'); }}>{tc('export.pdf')}</DropdownItem>
          </>
        )}
      </Dropdown>
    </Can>
  );
}
