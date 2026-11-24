import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { useToast } from '@/components/feedback/toast';
import { DataTable, type Column } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { usePreferences } from '@/core/preferences/preferences-store';
import { ActionDialog } from '../finance/ActionDialog';
import { REVIEW_PAGE, apiReview, type DrugNameRow, type ExamRow } from './review-api';
import { drugPatch, examPatch } from './review-rules';

const DRUG_MANAGE = 'health.catalog.manage';
const EXAM_MANAGE = 'health.lab.catalog';

/** Éléments ajoutés à la volée par le personnel : le gestionnaire les confirme, corrige ou relie à un article du catalogue. */
export function ReviewQueue() {
  const { t } = useTranslation('administration');
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('review.intro', { defaultValue: 'Ces éléments ont été ajoutés en cours de saisie par le personnel. Confirmez-les, corrigez leur nom ou reliez-les à un article du catalogue. Les ordonnances et demandes déjà enregistrées ne changent jamais.' })}</p>
      <DrugsToReview />
      <ExamsToReview />
    </div>
  );
}

function useFeedback(): { done: (title: string) => void; fail: (e: unknown) => void } {
  const { t } = useTranslation('finance');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return {
    done: (title) => { toast({ tone: 'success', title }); void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'review') }); },
    fail: (error) => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('module.saveFailed'), description: error instanceof ApiError ? undefined : t('module.saveFailedHint') }),
  };
}

function DrugsToReview() {
  const { t } = useTranslation('administration');
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const fb = useFeedback();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DrugNameRow | null>(null);
  const list = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'review', 'drugs', page), queryFn: () => apiReview.drugs(true, page), placeholderData: keepPreviousData });
  const canManage = can(DRUG_MANAGE);
  const confirm = useMutation({ mutationFn: (d: DrugNameRow) => apiReview.updateDrug(d.id, { needs_review: false }), onSuccess: () => fb.done(t('review.confirmed', { defaultValue: 'Médicament confirmé' })), onError: fb.fail });
  const columns: Column<DrugNameRow>[] = [
    { id: 'name', header: t('review.drugName', { defaultValue: 'Médicament' }), cell: (d) => d.name, primary: true },
    { id: 'uses', header: t('review.uses', { defaultValue: 'Prescriptions' }), cell: (d) => d.uses, className: 'text-end tabular-nums' },
    ...(canManage ? [{ id: 'actions', header: '', cell: (d: DrugNameRow) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" loading={confirm.isPending && confirm.variables?.id === d.id} onClick={() => confirm.mutate(d)}>{t('review.confirm', { defaultValue: 'Confirmer' })}</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(d)}>{t('review.correct', { defaultValue: 'Corriger…' })}</Button>
      </div>
    ) }] : []),
  ];
  return (
    <Card title={t('review.drugsTitle', { defaultValue: 'Médicaments à valider' })}>
      <DataTable caption={t('review.drugsTitle', { defaultValue: 'Médicaments à valider' })} columns={columns} rows={list.data?.rows ?? []} getRowId={(d) => d.id}
        loading={list.isPending} error={list.error} onRetry={() => void list.refetch()}
        emptyTitle={t('review.noDrugs', { defaultValue: 'Aucun médicament à valider' })}
        pagination={{ page, perPage: REVIEW_PAGE, total: list.data?.total ?? 0, onPageChange: setPage }} />
      {editing && <CorrectDialog key={editing.id} kind="drug" id={editing.id} original={{ name: editing.name, catalogItemId: editing.catalogItemId }} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function ExamsToReview() {
  const { t } = useTranslation('administration');
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const fb = useFeedback();
  const [editing, setEditing] = useState<ExamRow | null>(null);
  const list = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'review', 'exams'), queryFn: () => apiReview.exams(true) });
  const canManage = can(EXAM_MANAGE);
  const confirm = useMutation({ mutationFn: (x: ExamRow) => apiReview.updateExam(x.id, { needs_review: false }), onSuccess: () => fb.done(t('review.examConfirmed', { defaultValue: 'Examen confirmé' })), onError: fb.fail });
  const columns: Column<ExamRow>[] = [
    { id: 'label', header: t('review.examLabel', { defaultValue: 'Examen' }), cell: (x) => x.label, primary: true },
    { id: 'code', header: t('review.code', { defaultValue: 'Code' }), cell: (x) => x.code },
    { id: 'linked', header: t('review.linked', { defaultValue: 'Prix' }), cell: (x) => (x.catalogItemId ? t('review.priced', { defaultValue: 'Relié au catalogue' }) : t('review.noPrice', { defaultValue: 'Sans prix' })) },
    ...(canManage ? [{ id: 'actions', header: '', cell: (x: ExamRow) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" loading={confirm.isPending && confirm.variables?.id === x.id} onClick={() => confirm.mutate(x)}>{t('review.confirm', { defaultValue: 'Confirmer' })}</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(x)}>{t('review.correct', { defaultValue: 'Corriger…' })}</Button>
      </div>
    ) }] : []),
  ];
  return (
    <Card title={t('review.examsTitle', { defaultValue: 'Examens à valider' })}>
      <DataTable caption={t('review.examsTitle', { defaultValue: 'Examens à valider' })} columns={columns} rows={list.data ?? []} getRowId={(x) => x.id}
        loading={list.isPending} error={list.error} onRetry={() => void list.refetch()}
        emptyTitle={t('review.noExams', { defaultValue: 'Aucun examen à valider' })} />
      {editing && <CorrectDialog key={editing.id} kind="exam" id={editing.id} original={{ name: editing.label, catalogItemId: editing.catalogItemId }} onClose={() => setEditing(null)} />}
    </Card>
  );
}

/** Correction du nom et lien facultatif vers un article du catalogue, puis validation en une seule fois. */
function CorrectDialog({ kind, id, original, onClose }: { kind: 'drug' | 'exam'; id: string; original: { name: string; catalogItemId: string }; onClose: () => void }) {
  const { t } = useTranslation('administration');
  const fb = useFeedback();
  const { activeFacilityId } = usePreferences();
  const [name, setName] = useState(original.name);
  const [search, setSearch] = useState('');
  const [catalogItemId, setCatalogItemId] = useState(original.catalogItemId);
  const choices = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'review', 'catalog', search.trim()),
    queryFn: () => apiReview.catalogItems(search.trim()),
    enabled: search.trim().length >= 2,
  });
  const body = kind === 'drug' ? drugPatch(original, { name, catalogItemId }) : examPatch({ label: original.name, catalogItemId: original.catalogItemId }, { name, catalogItemId });
  const save = useMutation<unknown, unknown, void>({
    mutationFn: () => (kind === 'drug' ? apiReview.updateDrug(id, body ?? {}) : apiReview.updateExam(id, body ?? {})),
    onSuccess: () => { fb.done(t('review.saved', { defaultValue: 'Enregistré et confirmé' })); onClose(); },
    onError: fb.fail,
  });
  return (
    <ActionDialog open onClose={onClose} title={kind === 'drug' ? t('review.correctDrug', { defaultValue: 'Corriger le médicament' }) : t('review.correctExam', { defaultValue: 'Corriger l\'examen' })}
      submitLabel={t('review.saveConfirm', { defaultValue: 'Enregistrer et confirmer' })} pending={save.isPending} canSubmit={body !== null} onSubmit={() => save.mutate()}>
      <FormField label={t('review.name', { defaultValue: 'Nom' })} required>{(c) => <Input {...c} value={name} maxLength={kind === 'drug' ? 255 : 150} onChange={(e) => setName(e.target.value)} />}</FormField>
      <FormField label={t('review.catalogSearch', { defaultValue: 'Relier à un article du catalogue (facultatif)' })} hint={catalogItemId ? t('review.linkedTo', { defaultValue: 'Article relié : n° {{id}}', id: catalogItemId }) : undefined}>
        {(c) => <Input {...c} value={search} placeholder={t('review.catalogPlaceholder', { defaultValue: 'Tapez au moins 2 lettres' })} onChange={(e) => setSearch(e.target.value)} />}
      </FormField>
      {(choices.data?.length ?? 0) > 0 && (
        <FormField label={t('review.catalogResults', { defaultValue: 'Articles trouvés' })}>
          {(c) => <Select {...c} value={catalogItemId} onChange={(e) => setCatalogItemId(e.target.value)}>
            <option value="">{t('review.noLink', { defaultValue: 'Aucun lien' })}</option>
            {choices.data?.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Select>}
        </FormField>
      )}
      {original.catalogItemId !== '' && catalogItemId !== '' && (
        <Button variant="outline" size="sm" onClick={() => setCatalogItemId('')}>{t('review.unlink', { defaultValue: 'Retirer le lien' })}</Button>
      )}
    </ActionDialog>
  );
}
