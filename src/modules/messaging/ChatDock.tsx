import { Check, CheckCheck, ChevronLeft, MessageSquare, MessageSquarePlus, Minus, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/feedback/spinner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/core/i18n/useFormatters';
import { useLocalUser } from '@/core/local/session';
import { cn } from '@/utils/cn';
import { MAX_MESSAGE_LENGTH, presenceOf, readersOf, totalUnread, type ConversationSummary } from './messaging-rules';
import { MESSAGING_AVAILABLE, useContacts, useConversations, useHeartbeat, useMessagingActions, usePresence, useReads, useThread } from './use-messaging';

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
  return <Dock />;
}

function Dock() {
  const { t } = useTranslation('messaging');
  const f = useFormatters();
  const me = useLocalUser();
  const [{ mode, selected }, setState] = useState(load);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState('');
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
  const reads = useReads(mode === 'open' ? (selected ?? undefined) : undefined);
  const messages = thread.data ?? [];
  const lastAt = messages[messages.length - 1]?.at;
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
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'end' }); }, [lastAt, selected, mode]);

  const send = (): void => {
    if (!selected || !draft.trim() || actions.send.isPending) return;
    actions.send.mutate({ conversationId: selected, body: draft }, { onSuccess: () => { setDraft(''); setTimeout(grow, 0); } });
  };
  const start = (id: string): void => actions.openDirect.mutate(id, { onSuccess: (c) => { set({ selected: c.id }); setPicking(false); } });

  if (mode === 'closed') {
    return (
      <button type="button" onClick={() => set({ mode: 'open' })} aria-label={unread > 0 ? `${t('open')} — ${t('unread', { count: unread })}` : t('open')}
        className="no-print fixed bottom-4 end-4 z-30 inline-flex size-12 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-lg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
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
        {mode === 'open' && !selected && (
          <Button size="icon" variant="ghost" className="size-7" aria-label={t('new')} aria-expanded={picking} onClick={() => setPicking(!picking)}><MessageSquarePlus aria-hidden className="size-4" /></Button>
        )}
        <Button size="icon" variant="ghost" className="size-7" aria-label={mode === 'min' ? t('expand') : t('minimize')} onClick={() => set({ mode: mode === 'min' ? 'open' : 'min' })}><Minus aria-hidden className="size-4" /></Button>
        <Button size="icon" variant="ghost" className="size-7" aria-label={t('close')} onClick={() => set({ mode: 'closed' })}><X aria-hidden className="size-4" /></Button>
      </header>

      {mode === 'open' && (!selected || !current ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="border-b border-border bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">{t('note')}</p>
          {picking && (
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
          <div className="scroll-nav min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
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
            <div ref={bottom} />
          </div>
          <form className="border-t border-border bg-surface p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <div className="flex items-end gap-1 rounded-2xl border border-border bg-muted px-3 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
              <textarea ref={composer} rows={1} aria-label={t('composer')} placeholder={t('placeholder')} maxLength={MAX_MESSAGE_LENGTH} value={draft}
                onChange={(e) => { setDraft(e.target.value); grow(); }}
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
