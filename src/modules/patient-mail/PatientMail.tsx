import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useToast } from '@/components/feedback/toast';
import { FormField } from '@/components/forms/form-field';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/tables/data-table';
import { queryKeys } from '@/core/api/query-client';
import { unpaidDues } from '@/core/billing/group-payment';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { appointmentService } from '../appointments/data';
import { ActionDialog } from '../finance/ActionDialog';
import { useFinanceSnapshot, useMoney } from '../finance/use-finance';
import { useLabOrders } from '../laboratory/use-lab';
import { describeBusinessError } from '../_shared/business-error';
import { useResourceList } from '../_shared/use-resource';
import { MAIL_KINDS, isDue, isEmail, mailtoHref, reminderTime, type MailKind, type OutboxMail } from './mail-rules';
import { patientMail } from './mail-service';

const LEADS = ['2h', '3h', '1d', '2d', '3d', '7d'] as const;
type Lead = (typeof LEADS)[number];
const leadOf = (l: Lead): { days?: number; hours?: number } => (l.endsWith('h') ? { hours: Number.parseInt(l, 10) } : { days: Number.parseInt(l, 10) });

function useMailBox(patientId: string) {
  const { activeFacilityId } = usePreferences();
  const key = queryKeys.scoped(activeFacilityId, 'patient-mail', patientId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const list = useQuery({ queryKey: key, queryFn: () => patientMail.list(patientId) });
  const refresh = (): void => { void queryClient.invalidateQueries({ queryKey: key }); };
  const fail = (error: unknown): void => { toast({ tone: 'danger', title: describeBusinessError(t, error) ?? t('module.saveFailed') }); };
  return { list, refresh, fail, toast };
}

/** Onglet « E-mails » de la fiche patient : composer (rappel de rendez-vous, factures impayées, résultats prêts, message libre) et suivre la boîte d'envoi. */
export function PatientMail({ patientId, patientName, email }: { patientId: string; patientName: string; email?: string }) {
  const { t } = useTranslation('patients');
  const f = useFormatters();
  const box = useMailBox(patientId);
  const [composing, setComposing] = useState(false);
  const handOff = useMutation({ mutationFn: (m: OutboxMail) => { window.open(mailtoHref(m), '_self'); return patientMail.markHandedOff({ id: m.id }); }, onSuccess: box.refresh, onError: box.fail });
  const cancel = useMutation({ mutationFn: (id: string) => patientMail.cancel({ id }), onSuccess: box.refresh, onError: box.fail });
  const nowIso = new Date().toISOString();
  const columns: Column<OutboxMail>[] = [
    { id: 'kind', header: t('mail.col.kind'), cell: (m) => t(`mail.kind.${m.kind}`), primary: true },
    { id: 'subject', header: t('mail.col.subject'), cell: (m) => m.subject },
    { id: 'when', header: t('mail.col.when'), cell: (m) => (m.scheduledFor ? f.dateTime(m.scheduledFor) : f.dateTime(m.createdAt)) },
    { id: 'status', header: t('mail.col.status'), cell: (m) => <StatusBadge tone={m.status === 'handedOff' ? 'success' : m.status === 'cancelled' ? 'neutral' : isDue(m, nowIso) ? 'warning' : 'info'}>{m.status === 'queued' && !isDue(m, nowIso) ? t('mail.status.scheduled') : t(`mail.status.${m.status}`)}</StatusBadge> },
    {
      id: 'actions', header: '', cell: (m) => m.status === 'queued' ? (
        <Can permission={P.patients.update}>
          <span className="flex gap-1">
            <Button size="sm" onClick={() => handOff.mutate(m)}>{t('mail.send')}</Button>
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate(m.id)}>{t('mail.cancel')}</Button>
          </span>
        </Can>
      ) : null,
    },
  ];
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{isEmail(email) ? t('mail.recipient', { email }) : t('mail.noEmail')}</p>
        <Can permission={P.patients.update}><Button leftIcon={<Mail className="size-4" />} disabled={!isEmail(email)} onClick={() => setComposing(true)}>{t('mail.compose')}</Button></Can>
      </div>
      <p className="text-xs text-muted-foreground">{t('mail.localNotice')}</p>
      <DataTable caption={t('mail.title')} columns={columns} rows={box.list.data ?? []} getRowId={(m) => m.id} loading={box.list.isPending} emptyTitle={t('mail.empty')} />
      {composing && isEmail(email) && <ComposeDialog t={t} patientId={patientId} patientName={patientName} email={email} onClose={() => setComposing(false)} onQueued={box.refresh} onFail={box.fail} />}
    </div>
  );
}

function ComposeDialog({ t, patientId, patientName, email, onClose, onQueued, onFail }: {
  t: TFunction; patientId: string; patientName: string; email: string; onClose: () => void; onQueued: () => void; onFail: (e: unknown) => void;
}) {
  const f = useFormatters();
  const money = useMoney();
  const snap = useFinanceSnapshot();
  const labs = useLabOrders();
  const appts = useResourceList('appointments', appointmentService, { page: 1, perPage: 200, search: '', filters: { patientId }, sort: null });
  const now = new Date().toISOString();
  const upcoming = (appts.data?.rows ?? []).filter((a) => a.patientId === patientId && a.startsAt > now && a.status !== 'cancelled' && a.status !== 'noShow').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const invoices = (snap.data?.invoices ?? []).filter((v) => v.invoice.patientId === patientId);
  const dues = unpaidDues(invoices.map((v) => v.invoice), invoices.flatMap((v) => v.ledger));
  const currency = invoices[0]?.invoice.currency ?? '';
  const readyLabs = (labs.data ?? []).filter((l) => l.order.patientId === patientId && l.order.status === 'validated');

  const [kind, setKind] = useState<MailKind>('appointment');
  const [sourceId, setSourceId] = useState('');
  const [lead, setLead] = useState<Lead | ''>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const sources = kind === 'appointment' ? upcoming.map((a) => ({ id: a.id, label: `${f.dateTime(a.startsAt)} · ${a.practitioner}` })) : kind === 'labResult' ? readyLabs.map((l) => ({ id: l.order.id, label: l.order.number })) : [];
  const needsSource = kind === 'appointment' || kind === 'labResult';
  const source = sourceId || sources[0]?.id || '';

  const fill = (k: MailKind, src: string): void => {
    const greeting = t('mail.tpl.greeting', { name: patientName });
    const signature = t('mail.tpl.signature');
    if (k === 'appointment') {
      const a = upcoming.find((x) => x.id === src);
      if (!a) { setSubject(''); setBody(''); return; }
      setSubject(t('mail.tpl.appointment.subject', { when: f.dateTime(a.startsAt) }));
      setBody(`${greeting}\n\n${t('mail.tpl.appointment.body', { when: f.dateTime(a.startsAt), practitioner: a.practitioner })}\n\n${signature}`);
    } else if (k === 'unpaidInvoices') {
      const lines = dues.map((d) => `- ${d.number} : ${money(d.due, currency)}`).join('\n');
      const total = money(dues.reduce((s, d) => s + d.due, 0), currency);
      setSubject(t('mail.tpl.unpaid.subject'));
      setBody(`${greeting}\n\n${t('mail.tpl.unpaid.body', { total })}\n${lines}\n\n${signature}`);
    } else if (k === 'labResult') {
      const l = readyLabs.find((x) => x.order.id === src);
      setSubject(t('mail.tpl.lab.subject'));
      setBody(l ? `${greeting}\n\n${t('mail.tpl.lab.body', { number: l.order.number })}\n\n${signature}` : '');
    } else { setSubject(''); setBody(`${greeting}\n\n\n${signature}`); }
  };
  const [filled, setFilled] = useState('');
  const sig = `${kind}|${source}|${upcoming.length}|${dues.length}|${readyLabs.length}`;
  if (filled !== sig && (!snap.isPending && !labs.isPending && !appts.isPending)) { setFilled(sig); fill(kind, source); }

  const appt = kind === 'appointment' ? upcoming.find((a) => a.id === source) : undefined;
  const scheduledFor = appt && lead ? reminderTime(appt.startsAt, leadOf(lead)) : undefined;
  const queue = useMutation({
    mutationFn: () => patientMail.queue({ patientId, patientName, to: email, kind, subject, body, ...(scheduledFor ? { scheduledFor } : {}), ...(needsSource && source ? { sourceRef: `${kind}:${source}${lead ? `:${lead}` : ''}` } : {}) }),
    onSuccess: () => { onQueued(); onClose(); }, onError: onFail,
  });
  const ready = subject.trim() !== '' && body.trim() !== '' && (!needsSource || source !== '') && (kind !== 'unpaidInvoices' || dues.length > 0);
  return (
    <ActionDialog open onClose={onClose} title={t('mail.compose')} submitLabel={scheduledFor ? t('mail.schedule') : t('mail.queue')} pending={queue.isPending} canSubmit={ready} description={t('mail.recipient', { email })} onSubmit={() => queue.mutate()}>
      <FormField label={t('mail.col.kind')} required>
        {(c) => <Select {...c} value={kind} onChange={(e) => { setKind(e.target.value as MailKind); setSourceId(''); setLead(''); }}>{MAIL_KINDS.map((k) => <option key={k} value={k}>{t(`mail.kind.${k}`)}</option>)}</Select>}
      </FormField>
      {needsSource && (
        <FormField label={t(`mail.source.${kind}`)} required hint={sources.length === 0 ? t(`mail.noSource.${kind}`) : undefined}>
          {(c) => <Select {...c} value={source} onChange={(e) => setSourceId(e.target.value)}>{sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}
        </FormField>
      )}
      {kind === 'appointment' && (
        <FormField label={t('mail.lead.label')} hint={t('mail.lead.hint')}>
          {(c) => <Select {...c} value={lead} onChange={(e) => setLead(e.target.value as Lead | '')}><option value="">{t('mail.lead.now')}</option>{LEADS.map((l) => <option key={l} value={l}>{t(`mail.lead.${l}`)}</option>)}</Select>}
        </FormField>
      )}
      {kind === 'unpaidInvoices' && dues.length === 0 && <p className="text-sm text-muted-foreground">{t('mail.noSource.unpaidInvoices')}</p>}
      <FormField label={t('mail.col.subject')} required>{(c) => <Input {...c} maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />}</FormField>
      <FormField label={t('mail.body')} required hint={kind === 'labResult' ? t('mail.privacy') : undefined}>{(c) => <Textarea {...c} rows={9} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}</FormField>
    </ActionDialog>
  );
}
