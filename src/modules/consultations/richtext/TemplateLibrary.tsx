import { Copy, Pencil, Plus, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { Input, Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/badge';
import { usePermissionsCan } from './use-can';
import { SECTIONS, type SectionId } from '../clinical/model';
import { createResourceService } from '../../_shared/resource-service';
import { useResourceList } from '../../_shared/use-resource';
import { EMPTY_DOC, sanitizeDoc, type RichDoc } from './doc';
import { BUILT_IN_TEMPLATES, buildTemplateDoc, readFavorites, toggleFavorite, writeFavorites, type CustomTemplate } from './templates';
import { RichTextEditor } from './RichTextEditor';

type Target = SectionId | 'report';

/** Contrat proposé : /health/consultation-templates (voir docs/API_CONTRACTS_NEEDED.md). Aucune donnée fictive. */
export const templateService = createResourceService<CustomTemplate>({
  source: 'health',
  endpoint: '/health/consultation-templates',
  demoRows: [],
  searchText: (tpl) => tpl.name,
});

interface Entry {
  id: string;
  name: string;
  target: Target;
  scope: 'common' | 'facility' | 'personal';
  doc: RichDoc;
  custom: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  target?: Target;
  hasContent: boolean;
  onApply: (doc: RichDoc, mode: 'replace' | 'append') => void;
}

export function TemplateLibrary({ open, onClose, target, hasContent, onApply }: Props) {
  const { t } = useTranslation('consultations');
  const toast = useToast();
  const canCreate = usePermissionsCan('health.consultations.update');
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites());
  const [onlyTarget, setOnlyTarget] = useState(true);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ source?: Entry; name: string; target: Target; scope: 'personal' | 'facility'; doc: RichDoc } | null>(null);

  const custom = useResourceList('consultation-templates', templateService, { page: 1, perPage: 200, search: '', filters: {}, sort: null });

  const entries = useMemo<Entry[]>(() => {
    const builtIn = BUILT_IN_TEMPLATES.map<Entry>((tpl) => ({
      id: `builtin:${tpl.id}`,
      name: t(`clinical.tpl.names.${tpl.id}`),
      target: tpl.target,
      scope: 'common',
      doc: buildTemplateDoc(tpl, (key) => t(`clinical.tpl.sec.${key}`)),
      custom: false,
    }));
    const own = (custom.data?.rows ?? []).map<Entry>((row) => ({
      id: row.id, name: row.name, target: row.target, scope: row.scope, doc: sanitizeDoc(row.content), custom: true,
    }));
    return [...builtIn, ...own];
  }, [custom.data, t]);

  const visible = entries
    .filter((e) => !onlyTarget || !target || e.target === target || e.target === 'report')
    .filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));

  function favorite(id: string) {
    const next = toggleFavorite(favorites, id);
    setFavorites(next);
    writeFavorites(next);
  }

  async function save() {
    if (!editing || editing.name.trim() === '') return;
    try {
      const result = await templateService.create({
        name: editing.name.trim(), target: editing.target, scope: editing.scope, content: JSON.stringify(editing.doc),
      });
      toast(result.isDemo
        ? { tone: 'warning', title: t('clinical.tpl.demoNotSaved'), description: t('clinical.tpl.demoNotSavedHint') }
        : { tone: 'success', title: t('clinical.tpl.saved') });
      if (!result.isDemo) {
        setEditing(null);
        void custom.refetch();
      }
    } catch {
      toast({ tone: 'danger', title: t('clinical.tpl.saveFailed') });
    }
  }

  const scopeLabel = (s: Entry['scope']) => t(`clinical.tpl.scope.${s}`);

  return (
    <Dialog open={open} onClose={onClose} title={t('clinical.tpl.title')} description={t('clinical.tpl.subtitle')} showClose>
      {editing ? (
        <div className="space-y-3">
          <FormField label={t('clinical.tpl.name')} required>
            {(c) => <Input {...c} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t('clinical.tpl.target')}>
              {(c) => (
                <Select {...c} value={editing.target} onChange={(e) => setEditing({ ...editing, target: e.target.value as Target })}>
                  {[...SECTIONS, 'report' as const].map((s) => <option key={s} value={s}>{t(`clinical.targets.${s}`)}</option>)}
                </Select>
              )}
            </FormField>
            <FormField label={t('clinical.tpl.scopeLabel')}>
              {(c) => (
                <Select {...c} value={editing.scope} onChange={(e) => setEditing({ ...editing, scope: e.target.value as 'personal' | 'facility' })}>
                  <option value="personal">{t('clinical.tpl.scope.personal')}</option>
                  <option value="facility">{t('clinical.tpl.scope.facility')}</option>
                </Select>
              )}
            </FormField>
          </div>
          <RichTextEditor label={t('clinical.tpl.content')} value={editing.doc} onChange={(doc) => setEditing({ ...editing, doc })} />
          <p role="note" className="rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink">{t('clinical.tpl.noPatientData')}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>{t('clinical.cancel')}</Button>
            <Button variant="outline" onClick={() => onApply(editing.doc, hasContent ? 'append' : 'replace')}>{t('clinical.tpl.useNow')}</Button>
            <Button onClick={() => void save()}>{t('clinical.tpl.save')}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={t('clinical.tpl.search')} className="min-w-48 flex-1">
              {(c) => <Input {...c} value={query} onChange={(e) => setQuery(e.target.value)} />}
            </FormField>
            {target && (
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={onlyTarget} onChange={(e) => setOnlyTarget(e.target.checked)} />
                {t('clinical.tpl.onlySection')}
              </label>
            )}
            {canCreate && (
              <Button variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => setEditing({ name: '', target: target ?? 'report', scope: 'personal', doc: EMPTY_DOC })}>
                {t('clinical.tpl.new')}
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            <li>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                <div><p className="font-medium">{t('clinical.tpl.blank')}</p><p className="text-sm text-muted-foreground">{t('clinical.tpl.blankHint')}</p></div>
                <Button size="sm" variant="outline" onClick={() => onApply(EMPTY_DOC, 'replace')} disabled={!hasContent}>{t('clinical.tpl.clear')}</Button>
              </div>
            </li>
            {visible.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <button type="button" aria-pressed={favorites.includes(e.id)} aria-label={t('clinical.tpl.favorite')} onClick={() => favorite(e.id)}>
                      <Star aria-hidden className={favorites.includes(e.id) ? 'size-4 fill-current text-warning' : 'size-4 text-muted-foreground'} />
                    </button>
                    {e.name}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <StatusBadge tone={e.scope === 'personal' ? 'info' : 'neutral'}>{scopeLabel(e.scope)}</StatusBadge>
                    <span>{t(`clinical.targets.${e.target}`)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => onApply(e.doc, 'replace')}>{hasContent ? t('clinical.tpl.replace') : t('clinical.tpl.use')}</Button>
                  {hasContent && <Button size="sm" variant="outline" onClick={() => onApply(e.doc, 'append')}>{t('clinical.tpl.append')}</Button>}
                  {canCreate && (
                    <Button size="sm" variant="ghost" aria-label={e.custom ? t('clinical.tpl.edit') : t('clinical.tpl.duplicate')} leftIcon={e.custom ? <Pencil className="size-4" /> : <Copy className="size-4" />}
                      onClick={() => setEditing({ source: e, name: e.custom ? e.name : t('clinical.tpl.copyOf', { name: e.name }), target: e.target, scope: 'personal', doc: e.doc })}>
                      {e.custom ? t('clinical.tpl.edit') : t('clinical.tpl.duplicate')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {visible.length === 0 && <li className="text-sm text-muted-foreground">{t('clinical.tpl.none')}</li>}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
