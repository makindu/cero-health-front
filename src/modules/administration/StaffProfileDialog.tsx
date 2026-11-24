import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/form-field';
import { Input, Select } from '@/components/forms/controls';
import { ActionDialog } from '../finance/ActionDialog';
import { useCareUnits } from '../_shared/reference-data';
import { optionOf, resolveFunctionOption, useStaffFunctions } from './staff-functions';
import { STAFF_TYPES, useStaffCandidates, useStaffMutation, type StaffMemberRow } from './staff-api';

/**
 * Profil de personnel d'un membre de l'établissement. Sans `member` : on choisit d'abord un compte CERO ID qui n'a pas encore de profil.
 * Avec `member` : on crée son profil (s'il n'en a pas) ou on modifie celui qu'il a. Les comptes et leurs accès se gèrent dans CERO ID.
 */
export function StaffProfileDialog({ member, onClose }: { member: StaffMemberRow | null; onClose: () => void }) {
  const { t } = useTranslation('administration');
  const units = useCareUnits();
  const candidates = useStaffCandidates();
  const fns = useStaffFunctions();
  const functions = fns.data?.functions ?? [];
  const [v, setV] = useState({
    userId: member?.userId ?? '',
    choice: optionOf(member?.type ?? '', member?.functionId ?? ''),
    title: member?.title ?? '',
    specialty: member?.specialty ?? '',
    registrationNumber: member?.registrationNumber ?? '',
    careUnitId: member?.careUnitId ?? '',
    active: member?.hasProfile ? member.active : true,
  });
  const editing = Boolean(member?.hasProfile);
  const save = useStaffMutation({ successTitle: t('users.saved'), onDone: onClose });
  const picked = resolveFunctionOption(v.choice, functions);
  const ready = v.userId !== '' && picked.type !== '';
  const title = member ? (editing ? t('users.editTitle') : t('users.createTitle')) : t('users.inviteTitle');
  return (
    <ActionDialog open onClose={onClose} title={title} description={member ? member.name : t('staff.accountHint')} submitLabel={t('users.inviteSubmit')} pending={save.isPending} canSubmit={ready}
      onSubmit={() => save.mutate({ userId: v.userId, profileId: member?.profileId ?? '', type: picked.type, functionId: picked.functionId, title: v.title, specialty: v.specialty, registrationNumber: v.registrationNumber, careUnitId: v.careUnitId, active: v.active })}>
      {!member && (
        <FormField label={t('staff.account')} required hint={candidates.data && candidates.data.length === 0 ? t('users.noCandidates') : undefined}>
          {(c) => (
            <Select {...c} value={v.userId} onChange={(e) => setV({ ...v, userId: e.target.value })}>
              <option value="">{t('users.pickAccount')}</option>
              {(candidates.data ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </FormField>
      )}
      <FormField label={t('staff.type')} required>
        {(c) => (
          <Select {...c} value={v.choice} onChange={(e) => setV({ ...v, choice: e.target.value })}>
            <option value="">{t('users.pickType')}</option>
            <optgroup label={t('functions.standard')}>
              {STAFF_TYPES.map((k) => <option key={k} value={`t:${k}`}>{t(`staff.types.${k}`, { defaultValue: k })}</option>)}
            </optgroup>
            {functions.length > 0 && (
              <optgroup label={t('functions.custom')}>
                {functions.map((f) => <option key={f.id} value={`f:${f.id}`}>{f.label}</option>)}
              </optgroup>
            )}
          </Select>
        )}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('users.service')}>
          {(c) => (
            <Select {...c} value={v.careUnitId} onChange={(e) => setV({ ...v, careUnitId: e.target.value })}>
              <option value="">—</option>
              {(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
        </FormField>
        <FormField label={t('users.specialty')}>
          {(c) => <Input {...c} maxLength={80} value={v.specialty} onChange={(e) => setV({ ...v, specialty: e.target.value })} />}
        </FormField>
        <FormField label={t('staff.title')}>
          {(c) => <Input {...c} maxLength={80} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}
        </FormField>
        <FormField label={t('users.registration')}>
          {(c) => <Input {...c} maxLength={60} value={v.registrationNumber} onChange={(e) => setV({ ...v, registrationNumber: e.target.value })} />}
        </FormField>
      </div>
      {editing && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
          {t('users.statuses.active')}
        </label>
      )}
    </ActionDialog>
  );
}
