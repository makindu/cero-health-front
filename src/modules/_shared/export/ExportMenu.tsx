import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import type { ListParams, ResourceService } from '../resource-service';
import { isoDay } from '@/utils/dates';
import { PDF_MIME, XLSX_MIME, downloadBytes, safeFilename } from './download';
import { fetchAll } from './fetch-all';
import { buildPdf } from './pdf';
import { buildXlsx, type Cell } from './xlsx';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => Cell;
}

interface ExportMenuProps<T extends { id: string }> {
  service: ResourceService<T>;
  /** Recherche et filtres COURANTS de la page : l'export reflète exactement ce que voit l'utilisateur. */
  params: Omit<ListParams, 'page' | 'perPage'>;
  columns: readonly ExportColumn<T>[];
  title: string;
  filenameBase: string;
  /** Permission d'export (l'API doit la revérifier). */
  permission: string;
}

type Format = 'xlsx' | 'pdf';

/**
 * Menu « Exporter » (Excel / PDF), visible selon la permission. Génère le fichier dans le navigateur à partir
 * du contrat de liste existant : aucun endpoint d'export n'est supposé. Un fichier issu de données fictives
 * porte la mention « DONNÉES FICTIVES ».
 */
export function ExportMenu<T extends { id: string }>({
  service,
  params,
  columns,
  title,
  filenameBase,
  permission,
}: ExportMenuProps<T>) {
  const { t } = useTranslation();
  const toast = useToast();
  const f = useFormatters();
  const [format, setFormat] = useState<Format | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(selected: Format) {
    setBusy(true);
    try {
      const result = await fetchAll(service, params);
      const now = new Date();
      const day = isoDay(0, now);
      const notes = [
        `${t('export.generatedAt')} ${f.dateTime(now)} · ${t('export.rows', { count: result.rows.length })}`,
        ...(result.isDemo ? [t('export.demoMark')] : []),
        ...(result.truncated ? [t('export.truncated', { count: result.rows.length })] : []),
      ];
      const header = columns.map((c) => c.header);
      const body = result.rows.map((row) => columns.map((c) => c.value(row)));
      if (selected === 'xlsx') {
        const sheet: Cell[][] = [[title], ...notes.map((n): Cell[] => [n]), [], header, ...body];
        downloadBytes(safeFilename(filenameBase, 'xlsx', day), buildXlsx(title, sheet), XLSX_MIME);
      } else {
        const text = body.map((cells) => cells.map((c) => (c === null || c === undefined ? '' : String(c))));
        downloadBytes(
          safeFilename(filenameBase, 'pdf', day),
          buildPdf({ title, notes, header, rows: text }),
          PDF_MIME,
        );
      }
      toast({ tone: 'success', title: t('export.done') });
    } catch {
      toast({ tone: 'danger', title: t('export.failed'), description: t('module.saveFailedHint') });
    } finally {
      setBusy(false);
      setFormat(null);
    }
  }

  return (
    <Can permission={permission}>
      <Dropdown
        label={t('export.menu')}
        trigger={
          <>
            <Download aria-hidden className="size-4" />
            <span className="px-1 text-sm">{t('export.menu')}</span>
          </>
        }
      >
        {(close) => (
          <>
            <DropdownItem
              icon={<FileSpreadsheet className="size-4" />}
              onClick={() => {
                close();
                setFormat('xlsx');
              }}
            >
              {t('export.excel')}
            </DropdownItem>
            <DropdownItem
              icon={<FileText className="size-4" />}
              onClick={() => {
                close();
                setFormat('pdf');
              }}
            >
              {t('export.pdf')}
            </DropdownItem>
          </>
        )}
      </Dropdown>
      <ConfirmDialog
        open={format !== null}
        title={t('export.confirmTitle')}
        description={t('export.confirmBody')}
        confirmLabel={t('export.confirm')}
        loading={busy}
        onConfirm={() => format && void run(format)}
        onCancel={() => !busy && setFormat(null)}
      />
    </Can>
  );
}
