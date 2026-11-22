import { Check, CheckCheck, ChevronLeft, MessageSquare, MessageSquarePlus, Minus, Send, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/feedback/spinner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { cn } from '@/utils/cn';
import { disablePush, enablePush, pushSupported, rememberChatLink, takeChatLink } from './chat-push';
import { desktopDenied, desktopSupported, incoming, loadPrefs, notifyDesktop, playChime, requestDesktop, savePrefs, titleWithCount, unlockAudio, type AlertPrefs } from './chat-alerts';
import { MAX_MESSAGE_LENGTH, type Message, presenceOf, readersOf, totalUnread, type ConversationSummary } from './messaging-rules';
import { referenceFromApi } from '../_shared/reference-data';
import { MembersPanel, NewGroupForm } from './GroupPanels';
import { PAGE } from './messaging-api';
import { messaging } from './messaging';
import { MESSAGING_AVAILABLE, useChatMe, useContacts, useConversations, useHeartbeat, useMessagingActions, usePresence, useReads, useThread, useTypists } from './use-messaging';

type Mode = 'closed' | 'open' | 'min';
const KEY = 'cero-health.chat-dock';

function load(): { mode: Mode; selected: string | null } {
  try {
    const raw = JSON.parse(globalThis.sessionStorage?.getItem(KEY) ?? 'null') as { mode?: Mode; selected?: string | null } | null;
    if (raw && (raw.mode === 'open' || raw.mode === 'min' || raw.mode === 'closed')) return { mode: raw.mode, selected: typeof raw.selected === 'string' ? raw.selected : null };
  } catch { /* stockage indisponible : état par défaut */ }
  return { mode: 'closed', selected: null };
}

/**
 * Messagerie flottante (comme une discussion Messenger ou la rédaction d'un courriel) : fenêtre NON modale ancrée en bas à droite,
 * au-dessus de n'importe quelle page. Aucun fond bloquant, aucun piège de focus : on continue à travailler pendant qu'elle est ouverte.
 * Elle reste ouverte quand on change de page (le gabarit n'est pas démonté) et se souvient de son état pour la session de l'onglet.
 */
export function ChatDock() {
  if (!MESSAGING_AVAILABLE) return null;
  // Ouverte à tout utilisateur connecté (aucun droit particulier) ; sans profil de personnel actif, la fenêtre ne s'affiche pas (voir Dock).
  return <Dock />;
}

function Dock() {
  const { t } = useTranslation('messaging');
  const f = useFormatters();
  const meOrNull = useChatMe();
  const me = meOrNull ?? { id: '', name: '' };
  const [{ mode, selected }, setState] = useState(load);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState('');
  const [prefs, setPrefs] = useState<AlertPrefs>(loadPrefs);
  const [blocked, setBlocked] = useState(desktopDenied());
  const seen = useRef<Record<string, string> | null>(null);
  const { can } = usePermissions();
  const canManage = referenceFromApi() && can('health.messaging.manage');
  const [grouping, setGrouping] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  /** Historique : messages plus anciens déjà chargés, par conversation (mode API). */
  const [olderBy, setOlderBy] = useState<Record<string, { items: Message[]; done: boolean }>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  useHeartbeat();
  const presence = usePresence();
  const list = useConversations();
  const contacts = useContacts();
  const actions = useMessagingActions();
  const thread = useThread(mode === 'open' ? (selected ?? undefined) : undefined);
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const grow = (): void => { const el = composer.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 112)}px`; };

  const set = (patch: Partial<{ mode: Mode; selected: string | null }>): void => {
    setState((cur) => {
      const next = { ...cur, ...patch };
      try { globalThis.sessionStorage?.setItem(KEY, JSON.stringify(next)); } catch { /* sans effet */ }
      return next;
    });
  };

  const summaries = list.data ?? [];
  const unread = totalUnread(summaries);
  const current = summaries.find((s) => s.conversation.id === selected);
  const typists = useTypists(mode === 'open' ? (selected ?? undefined) : undefined);
  const lastTypingSent = useRef(0);
  const reads = useReads(mode === 'open' ? (selected ?? undefined) : undefined);
  const olderState = selected ? olderBy[selected] : undefined;
  /** Fil affiché = page la plus récente + historique chargé + messages déjà vus que la page récente a fait glisser hors de sa fenêtre. */
  const seenMessages = useRef<Record<string, Map<string, Message>>>({});
  const messages = useMemo(() => {
    if (!selected) return [];
    const keep = (seenMessages.current[selected] ??= new Map());
    for (const m of [...(olderState?.items ?? []), ...(thread.data ?? [])]) keep.set(m.id, m);
    const all = [...keep.values()];
    const numeric = all.every((m) => /^\d+$/.test(m.id));
    return all.sort((a, b) => (numeric ? Number(a.id) - Number(b.id) : a.at.localeCompare(b.at) || a.id.localeCompare(b.id)));
  }, [selected, olderState, thread.data]);
  const canLoadOlder = referenceFromApi() && !olderState?.done && (thread.data?.length ?? 0) >= PAGE;
  const lastAt = messages[messages.length - 1]?.at;
  useEffect(() => { setMembersOpen(false); }, [selected]);
  const nameOf = useMemo(() => {
    const m = new Map((contacts.data ?? []).map((c) => [c.id, c.name]));
    return (s: ConversationSummary): string => (s.conversation.kind === 'channel' ? (s.conversation.title ?? t('channel')) : (m.get(s.conversation.memberIds.find((id) => id !== me.id) ?? '') ?? t('unknownContact')));
  }, [contacts.data, me.id, t]);

  /** Texte de présence : toujours écrit en toutes lettres (le point coloré ne porte jamais seul l'information). */
  const status = (s: ConversationSummary): { online: boolean; text: string } => {
    const now = new Date();
    const seen: Record<string, string> = presence.data ?? {};
    if (s.conversation.kind === 'channel') {
      const n = Object.entries(seen).filter(([id, at]) => id !== me.id && presenceOf(at, now).state === 'online').length + 1;
      return { online: n > 1, text: t('presence.channel', { count: n }) };
    }
    const other = s.conversation.memberIds.find((id) => id !== me.id) ?? '';
    const p = presenceOf(seen[other], now);
    if (p.state === 'online') return { online: true, text: t('presence.online') };
    if (!p.seenAt) return { online: false, text: t('presence.never') };
    const min = Math.max(1, Math.round((now.getTime() - new Date(p.seenAt).getTime()) / 60_000));
    if (min < 60) return { online: false, text: t('presence.minutes', { count: min }) };
    if (min < 1440) return { online: false, text: t('presence.hours', { count: Math.floor(min / 60) }) };
    return { online: false, text: t('presence.date', { date: f.dateTime(p.seenAt) }) };
  };

  // Une conversation n'est marquée lue que si elle est réellement affichée (fenêtre ouverte, fil visible).
  const { markRead } = actions;
  useEffect(() => {
    if (mode === 'open' && current && current.unread > 0) markRead.mutate(current.conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected, current?.unread, lastAt]);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'end' }); }, [lastAt, selected, mode, typists.data?.length]);

  // Alertes : son + notification du navigateur pour un nouveau message d'un autre, sauf si la conversation est déjà sous les yeux.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => {
    const unlock = (): void => unlockAudio();
    globalThis.document?.addEventListener('pointerdown', unlock, { once: true });
    globalThis.document?.addEventListener('keydown', unlock, { once: true });
    return () => { globalThis.document?.removeEventListener('pointerdown', unlock); globalThis.document?.removeEventListener('keydown', unlock); };
  }, []);
  useEffect(() => {
    if (!list.data) return;
    const r = incoming(seen.current, list.data, me.id);
    seen.current = r.seen;
    const away = globalThis.document?.visibilityState === 'hidden' || !globalThis.document?.hasFocus();
    for (const s of r.fresh) {
      const watching = mode === 'open' && selected === s.conversation.id && !away;
      if (watching) continue;
      if (prefsRef.current.sound) playChime();
      if (prefsRef.current.desktop && away) {
        notifyDesktop({
          tag: `chat-${s.conversation.id}`, title: t('alerts.notifyTitle', { defaultValue: 'Nouveau message de {{name}}', name: nameOf(s) }),
          body: t('alerts.notifyBody', { defaultValue: 'Ouvrez la messagerie pour le lire.' }), onClick: () => set({ mode: 'open', selected: s.conversation.id }),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data]);
  // Compteur dans le titre de l'onglet : visible même quand la fenêtre est cachée.
  useEffect(() => {
    const doc = globalThis.document;
    if (!doc) return;
    doc.title = titleWithCount(doc.title, unread);
    return () => { doc.title = titleWithCount(doc.title, 0); };
  }, [unread]);
  const changePrefs = (patch: Partial<AlertPrefs>): void => { const next = { ...prefs, ...patch }; setPrefs(next); savePrefs(next); };
  const toggleDesktop = async (on: boolean): Promise<void> => {
    if (!on) { changePrefs({ desktop: false }); if (referenceFromApi() && pushSupported()) void disablePush(); return; }
    const ok = await requestDesktop();
    setBlocked(!ok && desktopDenied());
    changePrefs({ desktop: ok });
    // Réveil même application fermée (Web Push) : seulement avec l'API, et sans bloquer l'alerte locale si le serveur ne l'offre pas.
    if (ok && referenceFromApi() && pushSupported()) void enablePush();
  };

  // Un clic sur une notification Web Push ouvre la conversation concernée (application déjà ouverte ou lancée via #chat=ID).
  useEffect(() => {
    const openChat = (id: string | null | undefined): void => { if (id) set({ mode: 'open', selected: id }); };
    rememberChatLink();
    openChat(takeChatLink());
    const onMessage = (e: MessageEvent): void => { const d = e.data as { type?: string; conversationId?: string | null } | null; if (d?.type === 'chat-open') openChat(d.conversationId); };
    globalThis.navigator?.serviceWorker?.addEventListener('message', onMessage);
    return () => globalThis.navigator?.serviceWorker?.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Au plus un signal toutes les 3 s tant que l'on tape ; jamais pour un champ vidé. */
  const notifyTyping = (value: string): void => {
    if (!referenceFromApi() || !selected || !value.trim()) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 3_000) return;
    lastTypingSent.current = now;
    actions.typing.mutate(selected);
  };
  const typingNames = (typists.data ?? []).map((id) => (contacts.data ?? []).find((c) => c.id === id)?.name ?? t('unknownContact'));
  const send = (): void => {
    if (!selected || !draft.trim() || actions.send.isPending) return;
    actions.send.mutate({ conversationId: selected, body: draft }, { onSuccess: () => { setDraft(''); setTimeout(grow, 0); } });
  };
  const loadOlder = async (): Promise<void> => {
    const first = messages[0];
    if (!selected || !first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const batch = await messaging.older(selected, first.id);
      setOlderBy((cur) => ({ ...cur, [selected]: { items: [...batch, ...(cur[selected]?.items ?? [])], done: batch.length < PAGE } }));
    } catch { /* l'historique reste tel quel ; on peut réessayer */ } finally { setLoadingOlder(false); }
  };
  const members = (current?.conversation.memberIds ?? []).map((id) => ({ id, name: id === me.id ? me.name : (contacts.data ?? []).find((c) => c.id === id)?.name ?? t('unknownContact'), role: '' }));
  const candidates = (contacts.data ?? []).filter((c) => !(current?.conversation.memberIds ?? []).includes(c.id));
  const start = (id: string): void => actions.openDirect.mutate(id, { onSuccess: (c) => { set({ selected: c.id }); setPicking(false); } });

  if (!meOrNull) return null;

  if (mode === 'closed') {
    return (
      <button type="button" onClick={() => set({ mode: 'open' })} aria-label={unread > 0 ? `${t('open')} — ${t('unread', { count: unread })}` : t('open')}
        className="no-print fixed bottom-4 end-4 z-30 inline-flex size-12 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/40 transition-transform hover:scale-105 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <MessageSquare aria-hidden className="size-5" />
        {unread > 0 && <span aria-hidden className="absolute -end-1.5 -top-1.5 h-5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-5 text-danger-foreground ring-2 ring-background">{unread > 99 ? '99+' : unread}</span>}
      </button>
    );
  }

  const title = selected && current ? nameOf(current) : t('title');
  const { online, text: statusText } = selected && current ? status(current) : { online: false, text: '' };
  return (
    <section role="region" aria-label={t('dock')} onKeyDown={(e) => { if (e.key === 'Escape') set({ mode: 'min' }); }}
      className={cn('no-print fixed bottom-0 end-4 z-30 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-t-lg border border-b-0 border-t-2 border-border border-t-primary bg-surface text-foreground shadow-xl', mode === 'open' && 'h-[30rem] max-h-[75dvh]')}>
      <header className="flex items-center gap-1 border-b border-border bg-surface px-2 py-1.5 text-foreground">
        {mode === 'open' && selected && (
          <Button size="icon" variant="ghost" className="size-7" aria-label={t('back')} onClick={() => set({ selected: null })}><ChevronLeft aria-hidden className="size-4" /></Button>
        )}
        <button type="button" onClick={() => set({ mode: mode === 'min' ? 'open' : 'min' })} aria-expanded={mode === 'open'} aria-label={mode === 'min' ? t('expand') : t('minimize')}
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          {selected && current && (
            <span className="relative shrink-0">
              <Avatar name={title} size="md" />
              <span aria-hidden className={cn('absolute -bottom-0.5 -end-0.5 size-3 rounded-full ring-2 ring-surface', online ? 'bg-success' : 'bg-neutral')} />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{title}</span>
            {selected && current && <span className="block truncate text-[11px] leading-tight text-muted-foreground" aria-live="polite">{statusText}</span>}
          </span>
          {unread > 0 && mode === 'min' && <span className="rounded-full bg-danger px-1.5 text-[11px] text-danger-foreground">{unread}</span>}
        </button>
        {mode === 'open' && selected && current?.conversation.kind === 'channel' && (
          <Button size="icon" variant="ghost" className="size-7" aria-label={t('group.members', { defaultValue: 'Membres' })} aria-expanded={membersOpen} onClick={() => setMembersOpen(!membersOpen)}><Users aria-hidden className="size-4" /></Button>
        )}
        {mode === 'open' && !selected && (
          <Button size="icon" variant="ghost" className="size-7" aria-label={t('new')} aria-expanded={picking} onClick={() => setPicking(!picking)}><MessageSquarePlus aria-hidden className="size-4" /></Button>
        )}
        <Button size="icon" variant="ghost" className="size-7" aria-label={mode === 'min' ? t('expand') : t('minimize')} onClick={() => set({ mode: mode === 'min' ? 'open' : 'min' })}><Minus aria-hidden className="size-4" /></Button>
        <Button size="icon" variant="ghost" className="size-7" aria-label={t('close')} onClick={() => set({ mode: 'closed' })}><X aria-hidden className="size-4" /></Button>
      </header>

      {mode === 'open' && (!selected || !current ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="border-b border-border bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">{referenceFromApi() ? t('noteApi', { defaultValue: 'Ce n’est pas un dossier médical : désignez un patient par son numéro de dossier, sans détail clinique.' }) : t('note')}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-1.5 text-xs">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={prefs.sound} onChange={(e) => { changePrefs({ sound: e.target.checked }); if (e.target.checked) { unlockAudio(); playChime(); } }} />{t('alerts.sound', { defaultValue: 'Son' })}</label>
            {desktopSupported() && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={prefs.desktop} onChange={(e) => { void toggleDesktop(e.target.checked); }} />{t('alerts.desktop', { defaultValue: 'Notifications' })}</label>}
            {blocked && <span className="text-warning">{t('alerts.blocked', { defaultValue: 'Notifications bloquées dans le navigateur : autorisez-les dans les réglages du site.' })}</span>}
          </div>
          {picking && canManage && !grouping && (
            <button type="button" onClick={() => setGrouping(true)} className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-left text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><Users aria-hidden className="size-4" />{t('group.new', { defaultValue: 'Nouveau groupe' })}</button>
          )}
          {picking && grouping && (
            <NewGroupForm contacts={contacts.data ?? []} pending={actions.createChannel.isPending} onCancel={() => setGrouping(false)}
              onCreate={(title, ids) => actions.createChannel.mutate({ title, memberIds: ids }, { onSuccess: (c) => { set({ selected: c.id }); setPicking(false); setGrouping(false); } })} />
          )}
          {picking && !grouping && (
            <ul className="border-b border-border bg-muted/40 p-1" aria-label={t('pickContact')}>
              {(contacts.data ?? []).map((c) => (
                <li key={c.id}><button type="button" onClick={() => start(c.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><Avatar name={c.name} size="sm" /><span className="truncate">{c.name}</span></button></li>
              ))}
            </ul>
          )}
          {list.isPending ? <div className="space-y-2 p-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : (
            <ul className="scroll-nav min-h-0 flex-1 overflow-y-auto p-1" aria-label={t('conversations')}>
              {summaries.map((s) => {
                const name = nameOf(s);
                return (
                  <li key={s.conversation.id}>
                    <button type="button" onClick={() => { set({ selected: s.conversation.id }); setTimeout(() => composer.current?.focus(), 0); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                      <Avatar name={name} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn('truncate text-sm', s.unread > 0 ? 'font-semibold' : 'font-medium')}>{name}</span>
                          {s.last && <span className="shrink-0 text-[11px] text-muted-foreground">{f.time(s.last.at)}</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{s.last ? s.last.body : t('noMessage')}</span>
                      </span>
                      {s.unread > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground" aria-label={t('unread', { count: s.unread })}>{s.unread}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {membersOpen && current?.conversation.kind === 'channel' && (
            <MembersPanel members={members} candidates={candidates} canAdd={canManage} pending={actions.addMembers.isPending}
              onAdd={(ids) => actions.addMembers.mutate({ conversationId: current.conversation.id, memberIds: ids })} />
          )}
          <div className="scroll-nav min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
            {canLoadOlder && (
              <div className="flex justify-center">
                <Button size="sm" variant="outline" loading={loadingOlder} onClick={() => { void loadOlder(); }}>{t('older', { defaultValue: 'Voir les messages précédents' })}</Button>
              </div>
            )}
            {thread.isPending ? <Skeleton className="h-16" /> : messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">{t('empty')}</p>
            ) : messages.map((m) => {
              const mine = m.senderId === me.id;
              return (
                <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-lg border px-3 py-2 text-sm shadow-sm', mine ? 'border-primary/30 bg-primary-soft text-primary-ink' : 'border-border bg-surface text-foreground')}>
                    {!mine && <p className="text-[11px] font-semibold">{m.senderName}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-80">
                      <span>{f.dateTime(m.at)}</span>
                      {mine && (() => {
                        const n = readersOf(m, reads.data ?? []).length;
                        const direct = current?.conversation.kind === 'direct';
                        const label = n === 0 ? t('receipt.sent') : direct ? t('receipt.read') : t('receipt.readBy', { count: n });
                        return <span className="inline-flex items-center gap-0.5 font-medium">{n === 0 ? <Check aria-hidden className="size-3" /> : <CheckCheck aria-hidden className="size-3" />}{label}</span>;
                      })()}
                    </p>
                  </div>
                </div>
              );
            })}
            {typingNames.length > 0 && (
              <div className="flex justify-start" role="status">
                <div className="max-w-[85%] rounded-lg border border-border bg-surface px-3 py-2 text-foreground shadow-sm">
                  {current?.conversation.kind === 'channel' && <p className="text-[11px] font-semibold">{typingNames.join(', ')}</p>}
                  <span aria-hidden className="flex h-4 items-center gap-1">
                    <i className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                    <i className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <i className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                  </span>
                  <span className="sr-only">{typingNames.length === 1 ? t('typing.one', { defaultValue: '{{name}} est en train d’écrire…', name: typingNames[0] }) : t('typing.many', { defaultValue: '{{names}} écrivent…', names: typingNames.join(', ') })}</span>
                </div>
              </div>
            )}
            <div ref={bottom} />
          </div>
          <form className="border-t border-border bg-surface p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <div className="flex items-end gap-1 rounded-2xl border border-border bg-muted px-3 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
              <textarea ref={composer} rows={1} aria-label={t('composer')} placeholder={t('placeholder')} maxLength={MAX_MESSAGE_LENGTH} value={draft}
                onChange={(e) => { setDraft(e.target.value); grow(); notifyTyping(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                className="max-h-28 min-h-8 flex-1 resize-none self-center bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground" />
              <button type="submit" aria-label={t('send')} disabled={!draft.trim() || actions.send.isPending}
                className="mb-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40">
                <Send aria-hidden className="size-4" />
              </button>
            </div>
            {draft.length > MAX_MESSAGE_LENGTH * 0.8 && <p className="mt-1 px-2 text-end text-[10px] text-muted-foreground">{draft.length}/{MAX_MESSAGE_LENGTH}</p>}
          </form>
        </div>
      ))}
    </section>
  );
}
