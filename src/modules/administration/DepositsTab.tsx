import { useEffect, useState } from 'react';
import { PackagePlus, Plus, Users, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { DateField, Input, Select } from '@/components/forms/controls';
import { useToast } from '@/components/feedback/toast';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { Can, usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { useStaffMembers } from '../_shared/reference-data';
import { ActionDialog } from '../finance/ActionDialog';
import { apiDeposits, canEnterStock, DEPOSIT_LEVELS, membersProblem, receiveUnits, stockText, type DepositRow, type MemberDraft, type StockItemHit } from './deposits-api';

/** Rafraîchit la liste des dépôts, le choix de dépôt des services et les membres après chaque changement. */
function useDepositMutation<I>(run: (input: I) => Promise<void>, successTitle: string, onDone: () => void) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'deposits') });
      void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'administration', 'stock-deposits') });
      toast({ tone: 'success', title: successTitle });
      onDone();
    },
    onError: (error) => {
      const business = describeBusinessError(t, error);
      const server = !business && error instanceof ApiError && error.status && error.status < 500 ? error.message : undefined;
      toast({ tone: 'danger', title: business ?? server ?? t('module.saveFailed'), description: business || server ? undefined : t('module.saveFailedHint') });
    },
  });
}

function CreateDepositDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('administration');
  const staff = useStaffMembers();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chief, setChief] = useState('');
  const reset = (): void => { setName(''); setDescription(''); setChief(''); };
  const create = useDepositMutation(apiDeposits.create, t('deposits.created'), () => { reset(); onClose(); });
  const ok = name.trim().length >= 2 && chief !== '';
  return (
    <ActionDialog open={open} onClose={() => { reset(); onClose(); }} title={t('deposits.createTitle')} description={t('deposits.createBody')} submitLabel={t('deposits.createSubmit')}
      pending={create.isPending} canSubmit={ok} dirty={name !== '' || description !== '' || chief !== ''} onSubmit={() => create.mutate({ name, description, chiefStaffId: chief })}>
      <FormField label={t('deposits.name')} required>{(c) => <Input {...c} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} />}</FormField>
      <FormField label={t('deposits.description')}>{(c) => <Input {...c} maxLength={250} value={description} onChange={(e) => setDescription(e.target.value)} />}</FormField>
      <FormField label={t('deposits.chief')} hint={t('deposits.chiefHint')} required>
        {(c) => (
          <Select {...c} value={chief} onChange={(e) => setChief(e.target.value)}>
            <option value="">—</option>
            {(staff.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
      </FormField>
    </ActionDialog>
  );
}

function MembersDialog({ deposit, onClose }: { deposit: DepositRow; onClose: () => void }) {
  const { t } = useTranslation('administration');
  const { activeFacilityId } = usePreferences();
  const staff = useStaffMembers();
  const members = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'deposits', 'members', deposit.id), queryFn: () => apiDeposits.members(deposit.id), staleTime: 0 });
  const [rows, setRows] = useState<MemberDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (members.data && !loaded) {
      setRows(members.data.map((m, i) => ({ key: i + 1, staffId: m.staffId, level: m.level })));
      setLoaded(true);
    }
  }, [members.data, loaded]);
  const save = useDepositMutation(apiDeposits.replaceMembers, t('deposits.membersSaved'), onClose);
  const problem = membersProblem(rows);
  const nameOf = (id: string): string => (staff.data ?? []).find((s) => s.id === id)?.name ?? members.data?.find((m) => m.staffId === id)?.name ?? `#${id}`;
  const taken = (key: number): Set<string> => new Set(rows.filter((r) => r.key !== key && r.staffId !== '').map((r) => r.staffId));
  const patch = (key: number, p: Partial<MemberDraft>): void => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const dirty = loaded && JSON.stringify(rows.map((r) => [r.staffId, r.level])) !== JSON.stringify((members.data ?? []).map((m) => [m.staffId, m.level]));
  return (
    <ActionDialog open onClose={onClose} wide title={`${t('deposits.membersTitle')} — ${deposit.name}`} description={t('deposits.membersBody')} submitLabel={t('deposits.membersSave')}
      pending={save.isPending} canSubmit={loaded && problem === null && dirty} dirty={dirty} onSubmit={() => save.mutate({ depositId: deposit.id, members: rows })}>
      {members.isPending && <p className="text-sm text-muted-foreground">{t('deposits.loading')}</p>}
      {members.isError && <p role="alert" className="text-sm text-danger">{t('deposits.loadFailed')}</p>}
      {loaded && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-2">
              <Select aria-label={t('deposits.member')} className="min-w-48 flex-1" value={r.staffId} onChange={(e) => patch(r.key, { staffId: e.target.value })}>
                <option value="">—</option>
                {r.staffId !== '' && !(staff.data ?? []).some((s) => s.id === r.staffId) && <option value={r.staffId}>{nameOf(r.staffId)}</option>}
                {(staff.data ?? []).filter((s) => !taken(r.key).has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Select aria-label={t('deposits.level')} className="w-56" value={r.level} onChange={(e) => patch(r.key, { level: e.target.value as MemberDraft['level'] })}>
                <option value="">—</option>
                {DEPOSIT_LEVELS.map((l) => <option key={l} value={l}>{t(`deposits.levels.${l}`)}</option>)}
              </Select>
              <button type="button" className="rounded-full p-1 hover:bg-border" aria-label={t('deposits.removeMember')} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><X aria-hidden className="size-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setRows((rs) => [...rs, { key: Math.max(0, ...rs.map((x) => x.key)) + 1, staffId: '', level: 'entry' }])}>{t('deposits.addMember')}</Button>
          {problem && problem !== 'empty' && <p role="alert" className="text-sm text-danger">{t(`deposits.problems.${problem}`)}</p>}
          <p className="text-xs text-muted-foreground">{t('deposits.levelsHint')}</p>
        </div>
      )}
    </ActionDialog>
  );
}

/** Choix d'un produit à stock du catalogue (le serveur cherche, 15 résultats au plus). Les prestations n'ont pas de stock : elles sont écartées. */
function StockItemPicker({ picked, onPick }: { picked: StockItemHit | null; onPick: (hit: StockItemHit | null) => void }) {
  const { t } = useTranslation('administration');
  const { activeFacilityId } = usePreferences();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(h);
  }, [text]);
  const hits = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'deposits', 'items', query), queryFn: () => apiDeposits.searchItems(query), enabled: query.length >= 2 && picked === null });
  if (picked) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
        <span className="font-medium">{picked.name}</span>
        <button type="button" className="rounded-full p-1 hover:bg-border" aria-label={t('deposits.changeItem')} onClick={() => { onPick(null); setText(''); setQuery(''); }}><X aria-hidden className="size-4" /></button>
      </div>
    );
  }
  const list = hits.data ?? [];
  return (
    <div className="relative">
      <Input value={text} autoComplete="off" aria-label={t('deposits.item')} placeholder={t('deposits.searchItem')} onChange={(e) => setText(e.target.value)} />
      {query.length >= 2 && hits.data !== undefined && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg">
          {list.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t('deposits.noItem')}</li>}
          {list.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-border/40" onClick={() => onPick(h)}>{h.name}{h.derived ? ` — ${h.unitLabel}` : ''}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Stock du dépôt et, pour qui y a le droit (niveau entrée/tout/chef), enregistrement d'une entrée (approvisionnement). */
function StockDialog({ deposit, onClose }: { deposit: DepositRow; onClose: () => void }) {
  const { t } = useTranslation('administration');
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const canEnter = canEnterStock(deposit.myLevel) && can(PERMISSIONS.administration.moveStock);
  const [filter, setFilter] = useState('');
  const stock = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'deposits', 'stock', deposit.id, filter), queryFn: () => apiDeposits.stock(deposit.id, filter) });
  const [item, setItem] = useState<StockItemHit | null>(null);
  const [unitValue, setUnitValue] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [expiry, setExpiry] = useState('');
  const [reference, setReference] = useState('');
  const quantity = Number(qty);
  const reset = (): void => { setItem(null); setUnitValue(''); setQty(''); setCost(''); setExpiry(''); setReference(''); };
  const receive = useDepositMutation(apiDeposits.receive, t('deposits.entrySaved'), reset);
  const units = item ? receiveUnits(item, t('deposits.unitDefault')) : [];
  const unit = units.find((u) => u.value === unitValue) ?? units[0];
  const ok = item !== null && unit !== undefined && Number.isInteger(quantity) && quantity >= 1;
  const baseLabel = item && !item.derived ? (units.find((u) => u.value === 'base')?.label ?? '') : (item ? t('deposits.unitDefault') : '');
  return (
    <ActionDialog open onClose={onClose} wide title={`${t('deposits.stockTitle')} — ${deposit.name}`} description={t('deposits.stockBody')} submitLabel={canEnter ? t('deposits.entrySubmit') : t('deposits.close')}
      pending={receive.isPending} canSubmit={canEnter ? ok : true} dirty={item !== null || qty !== ''}
      onSubmit={() => (canEnter ? receive.mutate({ depositId: deposit.id, catalogItemId: item?.id ?? '', quantity, unit: unit?.value ?? 'base', unitCost: cost, expirationDate: expiry, reference }) : onClose())}>
      <FormField label={t('deposits.filter')}>{(c) => <Input {...c} value={filter} placeholder={t('deposits.searchItem')} onChange={(e) => setFilter(e.target.value)} />}</FormField>
      {stock.isPending && <p className="text-sm text-muted-foreground">{t('deposits.loading')}</p>}
      {stock.isError && <p role="alert" className="text-sm text-danger">{t('deposits.loadFailed')}</p>}
      {stock.data && stock.data.length === 0 && <p className="text-sm text-muted-foreground">{t('deposits.noStock')}</p>}
      {stock.data && stock.data.length > 0 && (
        <ul className="max-h-56 divide-y divide-border overflow-auto rounded-md border border-border text-sm">
          {stock.data.map((l) => <li key={l.serviceId} className="flex items-center justify-between gap-2 px-3 py-2"><span>{l.name}</span><span className="tabular-nums font-medium">{stockText(l)}</span></li>)}
        </ul>
      )}
      {canEnter ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-sm font-medium">{t('deposits.entryTitle')}</p>
          <StockItemPicker picked={item} onPick={(h) => { setItem(h); setUnitValue(''); }} />
          {item && units.length > 1 && (
            <FormField label={t('deposits.receivedIn')} required>
              {(c) => (
                <Select {...c} value={unit?.value ?? ''} onChange={(e) => setUnitValue(e.target.value)}>
                  {units.map((u) => <option key={u.value} value={u.value}>{u.value === 'pack' ? t('deposits.packOption', { label: u.label, count: u.factor, base: baseLabel }) : u.label}</option>)}
                </Select>
              )}
            </FormField>
          )}
          {item && unit && <p className="text-xs text-muted-foreground">{item.derived ? t('deposits.derivedHint', { label: unit.label, count: unit.factor }) : t('deposits.unitHint', { label: unit.label })}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('deposits.quantity')} required>{(c) => <Input {...c} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, '').slice(0, 7))} />}</FormField>
            <FormField label={unit ? t('deposits.unitCostPer', { label: unit.label }) : t('deposits.unitCost')} hint={t('deposits.unitCostHint')}>{(c) => <Input {...c} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 12))} />}</FormField>
            <FormField label={t('deposits.expiry')}>{(c) => <DateField {...c} value={expiry} onChange={(e) => setExpiry(e.target.value)} />}</FormField>
            <FormField label={t('deposits.reference')} hint={t('deposits.referenceHint')}>{(c) => <Input {...c} maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />}</FormField>
          </div>
          {ok && unit && unit.factor > 1 && <p className="text-sm font-medium">{t('deposits.willAdd', { count: quantity * unit.factor, base: baseLabel })}</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('deposits.noEntryRight')}</p>
      )}
    </ActionDialog>
  );
}

/** Dépôts de stock de l'établissement : création avec chef, membres et leurs droits de mouvement manuel. */
export function DepositsTab() {
  const { t } = useTranslation('administration');
  const { activeFacilityId } = usePreferences();
  const list = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'deposits', 'list'), queryFn: apiDeposits.list });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DepositRow | null>(null);
  const [stocking, setStocking] = useState<DepositRow | null>(null);
  return (
    <Can permission={PERMISSIONS.administration.viewDeposits} fallback={<p className="text-sm text-muted-foreground">{t('deposits.noRight')}</p>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t('deposits.intro')}</p>
          <Can permission={PERMISSIONS.administration.manageDeposits}>
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>{t('deposits.create')}</Button>
          </Can>
        </div>
        {list.isPending && <p className="text-sm text-muted-foreground">{t('deposits.loading')}</p>}
        {list.isError && <p role="alert" className="text-sm text-danger">{t('deposits.loadFailed')}</p>}
        {list.data && list.data.length === 0 && <p className="text-sm text-muted-foreground">{t('deposits.empty')}</p>}
        {list.data && list.data.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {list.data.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('deposits.membersCount', { count: d.membersCount })} · {t('deposits.chiefLabel')} : {d.chiefName || '—'}{d.description ? ` · ${d.description}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" leftIcon={<PackagePlus className="size-4" aria-hidden />} onClick={() => setStocking(d)}>{t('deposits.stock')}</Button>
                  <Can permission={PERMISSIONS.administration.manageDeposits}>
                    <Button size="sm" variant="outline" leftIcon={<Users className="size-4" aria-hidden />} onClick={() => setEditing(d)}>{t('deposits.members')}</Button>
                  </Can>
                </div>
              </li>
            ))}
          </ul>
        )}
        <CreateDepositDialog open={creating} onClose={() => setCreating(false)} />
        {editing && <MembersDialog deposit={editing} onClose={() => setEditing(null)} />}
        {stocking && <StockDialog deposit={stocking} onClose={() => setStocking(null)} />}
      </div>
    </Can>
  );
}
