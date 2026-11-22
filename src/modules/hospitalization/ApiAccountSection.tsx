import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { Input, Textarea } from '@/components/forms/controls';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can, usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ActionDialog } from '../finance/ActionDialog';
import { useMoney } from '../finance/use-finance';
import { apiHospital } from './hospital-api';
import type { Admission } from './hospital-rules';
import { useApiAdmissionAccount, useHospitalMutation } from './use-hospital';

/**
 * Clôture financière d'un séjour (mode API). Le serveur calcule les prix, les soldes et décide ; l'écran propose les trois gestes :
 * facturer les jours de chambre, facturer les consommations, clôturer (après la sortie médicale).
 */
export function ApiAccountSection({ admission }: { admission: Admission }) {
  const { t } = useTranslation('hospitalization');
  const f = useFormatters();
  const money = useMoney();
  const { can } = usePermissions();
  const account = useApiAdmissionAccount(admission.id);
  const [dialog, setDialog] = useState(false);
  const [note, setNote] = useState('');
  const [exception, setException] = useState('');
  const admissionId = admission.id;
  const mDays = useHospitalMutation(apiHospital.billRoomDays, { successTitle: t('done.roomDays') });
  const mCons = useHospitalMutation(apiHospital.billConsumptions, { successTitle: t('done.consumptionsBilled', { defaultValue: 'Consommations facturées.' }) });
  const mClose = useHospitalMutation(apiHospital.close, {
    successTitle: t('done.closed', { defaultValue: 'Séjour clôturé.' }),
    onDone: () => { setDialog(false); setNote(''); setException(''); },
  });

  const v = account.data;
  if (account.isPending) return <DetailSection title={t('account.title')}><p className="text-sm text-muted-foreground">{t('account.loading')}</p></DetailSection>;
  if (!v) return <DetailSection title={t('account.title')}><p className="text-sm text-danger">{t('account.loadFailed')}</p></DetailSection>;

  const closed = Boolean(admission.closure);
  const open = admission.status === 'admitted' || admission.status === 'dischargePending' || (admission.status === 'discharged' && !closed);
  const canBill = can(P.billing.create);
  const canClose = can(P.hospitalization.create);
  const canException = can(P.hospitalization.dischargeException);
  const outstanding = v.balances.filter((b) => b.outstanding > 0);
  const hasDebt = outstanding.length > 0;
  const debtText = outstanding.map((b) => money(b.outstanding, b.currency)).join(' + ');
  const afterDischarge = admission.status === 'discharged' && !closed;
  const blocked = v.pendingDays > 0 || v.pendingLines > 0;
  const submitOk = !blocked && (!hasDebt || (canException && exception.trim() !== ''));

  return (
    <DetailSection title={t('account.title')}>
      <DescriptionList items={[
        { label: t('account.roomDaysPending'), value: String(v.pendingDays) },
        { label: t('account.consumptionsPending', { defaultValue: 'Lignes de consommation à facturer' }), value: String(v.pendingLines) },
        { label: t('account.patientDue'), value: <strong>{hasDebt ? debtText : money(0)}</strong> },
      ]} />
      {v.links.length === 0 ? <p className="text-sm text-muted-foreground">{t('account.noInvoices')}</p> : (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {v.links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <span>{t(`account.kind.${l.kind}`, { defaultValue: l.kind === 'roomDays' ? 'Jours de chambre' : 'Consommations' })} · {l.createdAt ? f.dateTime(l.createdAt) : ''} · {money(l.total, l.currency)}</span>
              <span className="text-muted-foreground">{l.status === 'active' ? (l.remaining > 0 ? t('account.remaining', { defaultValue: 'Reste {{amount}}', amount: money(l.remaining, l.currency) }) : t('account.settled', { defaultValue: 'Soldée' })) : t('account.cancelledInvoice', { defaultValue: 'Annulée' })}</span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="flex flex-wrap gap-2 pt-2">
          {canBill && <Button variant="outline" loading={mDays.isPending} disabled={v.pendingDays === 0} onClick={() => mDays.mutate({ admissionId })}>{t('account.postDays')}</Button>}
          {canBill && <Button variant="outline" loading={mCons.isPending} disabled={v.pendingLines === 0} onClick={() => mCons.mutate({ admissionId })}>{t('account.billConsumptions', { defaultValue: 'Facturer les consommations' })}</Button>}
          {afterDischarge && canClose && <Button onClick={() => setDialog(true)}>{t('account.close', { defaultValue: 'Clôturer le séjour' })}</Button>}
        </div>
      )}
      {closed && admission.closure && (
        <p className="text-sm text-muted-foreground">
          {t('account.closedBy', { defaultValue: 'Séjour clôturé le {{date}} par {{by}}.', date: f.dateTime(admission.closure.at), by: admission.closure.by })}
          {admission.closure.exception ? ` ${t('account.closedException', { defaultValue: 'Dérogation financière : {{reason}}', reason: admission.closure.exception.reason })}` : ''}
        </p>
      )}
      {afterDischarge && !canClose && <p className="text-xs text-muted-foreground">{t('account.closeNeedsRight', { defaultValue: 'La clôture est réservée au service des admissions.' })}</p>}
      <Can permission={P.hospitalization.view}><p className="text-xs text-muted-foreground">{t('account.convention')}</p></Can>
      <ActionDialog open={dialog} onClose={() => setDialog(false)} title={t('account.closeTitle', { defaultValue: 'Clôturer le séjour' })}
        description={t('account.closeBody', { defaultValue: 'La clôture est définitive. Tous les jours de chambre et consommations doivent être facturés ; un solde impayé demande une dérogation motivée.' })}
        submitLabel={t('account.close', { defaultValue: 'Clôturer le séjour' })} pending={mClose.isPending} canSubmit={submitOk}
        onSubmit={() => mClose.mutate({ admissionId, note, exceptionReason: hasDebt ? exception : undefined })}>
        <FormField label={t('detail.note')}>{(c) => <Textarea {...c} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
        {blocked && (
          <div className="rounded-md border border-warning/40 p-3 text-sm">
            {t('account.closeBlocked', { defaultValue: 'Il reste des jours de chambre ou des consommations à facturer : facturez-les d\'abord.' })}
          </div>
        )}
        {hasDebt && (
          <div className="space-y-2 rounded-md border border-warning/40 p-3 text-sm">
            <p>{t('account.blockBalance', { due: debtText })}</p>
            {canException ? (
              <FormField label={t('account.exceptionReason')} required>{(c) => <Input {...c} value={exception} onChange={(e) => setException(e.target.value)} />}</FormField>
            ) : <p className="text-muted-foreground">{t('account.noException')}</p>}
          </div>
        )}
      </ActionDialog>
    </DetailSection>
  );
}
