import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/form-field';
import { Select } from '@/components/forms/controls';
import { useToast } from '@/components/feedback/toast';
import { ApiError } from '@/core/api';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useFacilityProfile } from '../../administration/facility-api';
import { ActionDialog } from '../../finance/ActionDialog';
import { printDocument } from '../../finance/print';
import { describeBusinessError } from '../business-error';
import { RECEIPT_FORMATS, loadReceiptFormat, receiptHtml, saveReceiptFormat, type ReceiptData, type ReceiptFormat } from './receipt';
import { apiReceipts, type ReceiptKind } from './receipts-api';

/** Ce que l'écran fournit ; l'établissement, la mention de copie et le format sont ajoutés ici. */
export type ReceiptContent = Pick<ReceiptData, 'title' | 'number' | 'dateTime' | 'lines' | 'footer'>;

const FORMAT_LABEL: Record<ReceiptFormat, string> = { pos80: 'Ticket 80 mm', pos58: 'Ticket 58 mm', a4: 'Feuille A4' };

/**
 * Impression d'un reçu juste après l'encaissement, ou plus tard (« réimprimer »).
 * Le serveur numérote la copie : la première est l'original, les suivantes sont imprimées en DUPLICATA.
 */
export function ReceiptPrintDialog({ kind, id, content, reprint = false, onClose }: { kind: ReceiptKind; id: string; content: ReceiptContent; reprint?: boolean; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const toast = useToast();
  const { activeFacilityId } = usePreferences();
  const profile = useFacilityProfile(activeFacilityId ? Number(activeFacilityId) : undefined);
  const [format, setFormat] = useState<ReceiptFormat>(() => loadReceiptFormat());
  const [key] = useState(() => globalThis.crypto.randomUUID());

  const print = useMutation({
    mutationFn: () => apiReceipts.register(kind, id, format, key),
    onSuccess: (copy) => {
      saveReceiptFormat(format);
      const p = profile.data;
      printDocument(receiptHtml({
        ...content,
        facility: { name: p?.name || t('receipt.facilityFallback', { defaultValue: 'Établissement' }), address: p?.address, phone: p?.phone, taxNumber: p?.taxNumber ? `${t('receipt.taxNumber', { defaultValue: 'N° impôt' })} ${p.taxNumber}` : undefined },
        copyNumber: copy.copyNumber,
        duplicateLabel: t('receipt.duplicate', { defaultValue: 'DUPLICATA — copie n° {n}' }),
        firstPrintedLabel: copy.firstPrintedAt ? t('receipt.firstPrinted', { defaultValue: 'Original imprimé le {{date}}', date: f.dateTime(copy.firstPrintedAt) }) : undefined,
      }, format));
      onClose();
    },
    onError: (error) => {
      const business = describeBusinessError(t, error);
      const server = !business && error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined;
      toast({ tone: 'danger', title: business ?? server ?? t('receipt.failed', { defaultValue: "Impression impossible : le reçu n'a pas pu être enregistré." }) });
    },
  });

  return (
    <ActionDialog open onClose={onClose} title={reprint ? t('receipt.reprintTitle', { defaultValue: 'Réimprimer le reçu' }) : t('receipt.printTitle', { defaultValue: 'Imprimer le reçu' })}
      description={reprint ? t('receipt.reprintHint', { defaultValue: 'Si ce reçu a déjà été imprimé, la copie portera la mention DUPLICATA.' }) : t('receipt.printHint', { defaultValue: 'Choisissez le format de votre imprimante. Les impressions suivantes seront marquées DUPLICATA.' })}
      submitLabel={t('receipt.print', { defaultValue: 'Imprimer' })} pending={print.isPending} canSubmit={!print.isPending} onSubmit={() => print.mutate()}>
      <FormField label={t('receipt.format', { defaultValue: 'Format du papier' })}>
        {(c) => <Select {...c} value={format} onChange={(e) => setFormat(e.target.value as ReceiptFormat)}>{RECEIPT_FORMATS.map((x) => <option key={x} value={x}>{t(`receipt.formats.${x}`, { defaultValue: FORMAT_LABEL[x] })}</option>)}</Select>}
      </FormField>
      <p className="text-sm text-muted-foreground">{content.title} · {content.number}</p>
    </ActionDialog>
  );
}
