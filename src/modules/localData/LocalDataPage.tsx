import { Download, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { createBackup, getLocalDatabase, getStorageFallbackReason, parseBackup, resetLocalData, restoreBackup } from '@/core/local';
import { downloadBytes, safeFilename } from '@/modules/_shared/export/download';

/** Gestion des données locales : sauvegarde, restauration, réinitialisation du jeu de démonstration. */
export default function LocalDataPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const fallback = getStorageFallbackReason();

  const fail = (error: unknown) =>
    toast({ tone: 'danger', title: t('local.page.failed'), description: error instanceof Error ? error.message : undefined });

  async function exportBackup() {
    setBusy(true);
    try {
      const backup = await createBackup(await getLocalDatabase());
      const day = backup.createdAt.slice(0, 10);
      downloadBytes(safeFilename('cero-health-sauvegarde-locale', 'json', day), new TextEncoder().encode(JSON.stringify(backup)), 'application/json');
      toast({ tone: 'success', title: t('local.page.exported'), description: t('local.page.counts', backup.counts) });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      parseBackup(text); // validation AVANT toute confirmation : un fichier invalide ne touche à rien
      setPendingRestore(text);
    } catch (error) {
      fail(error);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function doRestore() {
    if (pendingRestore === null) return;
    setBusy(true);
    try {
      await restoreBackup(await getLocalDatabase(), pendingRestore);
      window.location.reload();
    } catch (error) {
      fail(error);
      setBusy(false);
      setPendingRestore(null);
    }
  }

  async function doReset() {
    setBusy(true);
    try {
      await resetLocalData(await getLocalDatabase());
      window.location.reload();
    } catch (error) {
      fail(error);
      setBusy(false);
      setConfirmReset(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('local.page.title')} description={t('local.page.description')} />
      {fallback && (
        <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          {t('local.page.fallback')}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">{t('local.page.backupTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('local.page.backupHelp')}</p>
          <Button onClick={() => void exportBackup()} loading={busy}>
            <Download aria-hidden className="size-4" /> {t('local.page.export')}
          </Button>
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">{t('local.page.restoreTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('local.page.restoreHelp')}</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            id="local-restore-file"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Upload aria-hidden className="size-4" /> {t('local.page.restore')}
          </Button>
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">{t('local.page.resetTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('local.page.resetHelp')}</p>
          <Button variant="danger" onClick={() => setConfirmReset(true)} disabled={busy}>
            <RotateCcw aria-hidden className="size-4" /> {t('local.page.reset')}
          </Button>
        </Card>
      </div>
      <ConfirmDialog
        open={pendingRestore !== null}
        title={t('local.page.restoreConfirmTitle')}
        description={t('local.page.restoreConfirm')}
        confirmLabel={t('local.page.restore')}
        tone="danger"
        loading={busy}
        onConfirm={() => void doRestore()}
        onCancel={() => setPendingRestore(null)}
      />
      <ConfirmDialog
        open={confirmReset}
        title={t('local.page.resetConfirmTitle')}
        description={t('local.page.resetConfirm')}
        confirmLabel={t('local.page.reset')}
        tone="danger"
        loading={busy}
        onConfirm={() => void doReset()}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
