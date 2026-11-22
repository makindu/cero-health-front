import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { Contact } from './messaging-service';

/** Choix de personnes : cases à cocher, nom en toutes lettres. */
function People({ people, picked, onToggle, label }: { people: readonly Contact[]; picked: ReadonlySet<string>; onToggle: (id: string) => void; label: string }) {
  return (
    <ul className="max-h-40 overflow-y-auto rounded-md border border-border bg-surface p-1" aria-label={label}>
      {people.map((c) => (
        <li key={c.id}>
          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
            <input type="checkbox" checked={picked.has(c.id)} onChange={() => onToggle(c.id)} />
            <Avatar name={c.name} size="sm" /><span className="truncate">{c.name}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

const toggle = (set: ReadonlySet<string>, id: string): Set<string> => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

/** Nouveau groupe : un nom et des membres. Le créateur en fait partie d'office. */
export function NewGroupForm({ contacts, pending, onCreate, onCancel }: { contacts: readonly Contact[]; pending: boolean; onCreate: (title: string, memberIds: string[]) => void; onCancel: () => void }) {
  const { t } = useTranslation('messaging');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const ok = title.trim() !== '' && picked.size > 0;
  return (
    <form className="space-y-2 border-b border-border bg-muted/40 p-2" onSubmit={(e) => { e.preventDefault(); if (ok && !pending) onCreate(title.trim(), [...picked]); }}>
      <label className="block text-xs font-medium">
        {t('group.name', { defaultValue: 'Nom du groupe' })}
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t('group.namePlaceholder', { defaultValue: 'Ex. : Garde de nuit — Médecine' })}
          className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring" />
      </label>
      <p className="text-xs font-medium">{t('group.members', { defaultValue: 'Membres' })} · {picked.size}</p>
      <People people={contacts} picked={picked} onToggle={(id) => setPicked((cur) => toggle(cur, id))} label={t('group.members', { defaultValue: 'Membres' })} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>{t('group.cancel', { defaultValue: 'Annuler' })}</Button>
        <Button type="submit" size="sm" loading={pending} disabled={!ok}>{t('group.create', { defaultValue: 'Créer le groupe' })}</Button>
      </div>
    </form>
  );
}

/** Membres d'un groupe, avec ajout de nouveaux membres (réservé à ceux qui gèrent la messagerie). */
export function MembersPanel({ members, candidates, canAdd, pending, onAdd }: { members: readonly Contact[]; candidates: readonly Contact[]; canAdd: boolean; pending: boolean; onAdd: (ids: string[]) => void }) {
  const { t } = useTranslation('messaging');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  return (
    <div className="space-y-2 border-b border-border bg-muted/40 p-2 text-sm">
      <p className="text-xs font-medium">{t('group.members', { defaultValue: 'Membres' })} · {members.length}</p>
      <ul className="flex flex-wrap gap-1" aria-label={t('group.members', { defaultValue: 'Membres' })}>
        {members.map((m) => <li key={m.id} className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs">{m.name}</li>)}
      </ul>
      {canAdd && candidates.length > 0 && (
        <>
          <p className="text-xs font-medium">{t('group.add', { defaultValue: 'Ajouter des membres' })}</p>
          <People people={candidates} picked={picked} onToggle={(id) => setPicked((cur) => toggle(cur, id))} label={t('group.add', { defaultValue: 'Ajouter des membres' })} />
          <div className="flex justify-end">
            <Button size="sm" loading={pending} disabled={picked.size === 0} onClick={() => { onAdd([...picked]); setPicked(new Set()); }}>{t('group.addAction', { defaultValue: 'Ajouter' })}</Button>
          </div>
        </>
      )}
    </div>
  );
}
