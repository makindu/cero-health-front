import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Calculator, Check, Copy, Delete, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/core/api/query-client';
import { decimalsOf } from '@/core/money/money';
import { usePreferences } from '@/core/preferences/preferences-store';
import { referenceFromApi } from '../_shared/reference-data';
import { apiFx } from './fx-api';
import { convertMajor, parseAmount, pressKey, prettyAmount, rateMap } from './fx-math';

const POS_KEY = 'cero.converter.pos';
interface Pos { right: number; top: number }
const DEFAULT_POS: Pos = { right: 24, top: 72 };
const clamp = (p: Pos): Pos => ({
  right: Math.min(Math.max(8, p.right), Math.max(8, (globalThis.innerWidth || 1024) - 120)),
  top: Math.min(Math.max(8, p.top), Math.max(8, (globalThis.innerHeight || 768) - 80)),
});
function loadPos(): Pos {
  try {
    const r = JSON.parse(globalThis.localStorage?.getItem(POS_KEY) ?? 'null') as Partial<Pos> | null;
    if (r && typeof r.right === 'number' && typeof r.top === 'number') return clamp({ right: r.right, top: r.top });
  } catch { /* position par défaut */ }
  return DEFAULT_POS;
}

/**
 * Calculateur de conversion : un bouton dans l'en-tête ouvre une petite fenêtre flottante et déplaçable, au-dessus de n'importe quelle page,
 * sans rien fermer. Les taux sont ceux du jour (les mêmes que la facturation) ; le calcul se fait ici, sans appel à chaque frappe.
 */
export function ConverterButton() {
  const { t } = useTranslation('finance');
  const [open, setOpen] = useState(false);
  if (!referenceFromApi()) return null;

  return (
    <>
      <Button variant="ghost" size="sm" aria-label={t('fx.calculator', { defaultValue: 'Calculateur de conversion' })} title={t('fx.calculator', { defaultValue: 'Calculateur de conversion' })} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Calculator className="size-4" aria-hidden />
      </Button>
      {open && <ConverterWindow onClose={() => setOpen(false)} />}
    </>
  );
}

/* Fenêtre « type macOS » : graphite opaque, feux tricolores, grand affichage fin et pavé numérique. Couleurs fixes (comme la calculatrice du Mac), indépendantes du thème. */
const MAC = { window: '#1c1c1e', bar: '#2c2c2e', digit: '#3a3a3c', fn: '#636366', accent: '#ff9f0a', text: '#ffffff', muted: '#a1a1a6' } as const;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';

function ConverterWindow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('finance');
  const { activeFacilityId } = usePreferences();
  const q = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'exchange-rates'), queryFn: () => apiFx.overview(), refetchOnWindowFocus: true, staleTime: 60_000 });
  const rates = useMemo(() => rateMap(q.data), [q.data]);
  const codes = Object.keys(rates);
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [compact, setCompact] = useState(false);
  const [copied, setCopied] = useState(false);
  const base = q.data?.base ?? '';
  const first = from || base || codes[0] || '';
  const second = to || codes.find((c) => c !== first) || first;
  const value = convertMajor(parseAmount(amount), first, second, rates);
  const dec = decimalsOf(second);
  const fmt = (n: number, d: number) => new Intl.NumberFormat(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  const unit = convertMajor(1, first, second, rates);
  const swap = (): void => { setFrom(second); setTo(first); };
  /** Copie le résultat en nombre simple (sans espaces de milliers), prêt à coller dans un champ de saisie. */
  const copy = async (): Promise<void> => {
    if (value === null) return;
    try { await globalThis.navigator.clipboard.writeText(value.toFixed(dec)); setCopied(true); globalThis.setTimeout(() => setCopied(false), 1500); } catch { /* presse-papiers indisponible */ }
  };
  const press = (k: string): void => setAmount((a) => pressKey(a, k));

  const [pos, setPos] = useState<Pos>(loadPos);
  const drag = useRef<{ x: number; y: number; right: number; top: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    globalThis.document?.addEventListener('keydown', onKey);
    return () => globalThis.document?.removeEventListener('keydown', onKey);
  }, [onClose]);
  /** Frappe au clavier : chiffres, virgule ou point, retour arrière. */
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.target as HTMLElement).tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === '.' || e.key === ',') press('.');
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Delete') press('clear');
    else return;
    e.preventDefault();
  };

  const key = (label: React.ReactNode, k: string, kind: 'digit' | 'fn' | 'accent', extra = '', aria?: string) => (
    <button key={k + extra} type="button" aria-label={aria} onClick={() => (k === 'swap' ? swap() : press(k))}
      style={{ background: MAC[kind], color: MAC.text, fontFamily: FONT }}
      className={`flex h-12 items-center justify-center rounded-full text-xl font-normal transition-[filter] hover:brightness-125 active:brightness-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${extra}`}>{label}</button>
  );
  const pill = (value: string, set: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => set(e.target.value)}
      style={{ background: MAC.digit, color: MAC.text, colorScheme: 'dark', fontFamily: FONT }}
      className="cursor-pointer appearance-none rounded-full border-0 px-3 py-1 text-center text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      {codes.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );

  return (
    <section role="dialog" aria-label={t('fx.calculator', { defaultValue: 'Calculateur de conversion' })} tabIndex={-1} onKeyDown={onKeyDown}
      style={{ right: pos.right, top: pos.top, background: MAC.window, color: MAC.text, fontFamily: FONT, boxShadow: '0 22px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.12)' }}
      className="no-print fixed z-40 w-[18.5rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[14px] outline-none">
      <header style={{ background: MAC.bar }} className="flex cursor-grab touch-none select-none items-center gap-2 px-3 py-2.5 active:cursor-grabbing"
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, right: pos.right, top: pos.top }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { const d = drag.current; if (d) setPos(clamp({ right: d.right - (e.clientX - d.x), top: d.top + (e.clientY - d.y) })); }}
        onPointerUp={(e) => {
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          try { globalThis.localStorage?.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* position valable pour cette session */ }
        }}>
        <button type="button" aria-label={t('common.close', { defaultValue: 'Fermer' })} style={{ background: '#ff5f57' }} className="size-3 rounded-full" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} />
        <button type="button" aria-label={compact ? t('fx.expand', { defaultValue: 'Afficher le clavier' }) : t('fx.collapse', { defaultValue: 'Réduire' })} aria-pressed={compact} style={{ background: '#febc2e' }} className="size-3 rounded-full" onPointerDown={(e) => e.stopPropagation()} onClick={() => setCompact((c) => !c)} />
        <h2 style={{ color: MAC.muted }} className="flex-1 text-center text-xs font-medium">{t('fx.calculator', { defaultValue: 'Calculateur de conversion' })}</h2>
        <button type="button" aria-label={t('common.close', { defaultValue: 'Fermer' })} style={{ background: MAC.digit, color: MAC.text }} className="flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}><X className="size-4" aria-hidden /></button>
      </header>

      <div className="px-3 pb-3 pt-2">
        {q.isPending && <p style={{ color: MAC.muted }} className="py-6 text-center text-sm">{t('common.loading', { defaultValue: 'Chargement…' })}</p>}
        {q.isError && <p role="alert" className="py-6 text-center text-sm" style={{ color: '#ff453a' }}>{t('fx.unavailable', { defaultValue: 'Taux indisponibles pour le moment.' })}</p>}
        {q.data && codes.length < 2 && <p style={{ color: MAC.muted }} className="py-6 text-center text-sm">{t('fx.noneYet', { defaultValue: 'Aucun taux fixé : demandez à la financière de le fixer.' })}</p>}
        {codes.length >= 2 && (
          <>
            <div className="flex items-center justify-between gap-2">
              {pill(first, setFrom, t('fx.from', { defaultValue: 'De' }))}
              <p aria-label={t('fx.amount', { defaultValue: 'Montant' })} className="min-w-0 flex-1 truncate text-end tabular-nums" style={{ fontSize: '2.1rem', fontWeight: 300, lineHeight: 1.15 }}>{prettyAmount(amount)}</p>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              {pill(second, setTo, t('fx.to', { defaultValue: 'Vers' }))}
              <p role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-end tabular-nums" style={{ fontSize: '1.6rem', fontWeight: 300, color: MAC.accent, lineHeight: 1.2 }}>{value === null ? '—' : fmt(value, dec)}</p>
              <button type="button" disabled={value === null} onClick={() => void copy()} aria-label={copied ? t('fx.copied', { defaultValue: 'Résultat copié' }) : t('fx.copy', { defaultValue: 'Copier le résultat' })} title={copied ? t('fx.copied', { defaultValue: 'Résultat copié' }) : t('fx.copy', { defaultValue: 'Copier le résultat' })}
                style={{ background: MAC.digit, color: copied ? '#30d158' : MAC.text }} className="flex size-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              </button>
            </div>
            {unit !== null && first !== second && <p style={{ color: MAC.muted }} className="mt-1 text-end text-xs tabular-nums">1 {first} = {fmt(unit, unit < 1 ? 6 : 2)} {second}</p>}
            {!compact && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {key('C', 'clear', 'fn', '', t('fx.clear', { defaultValue: 'Effacer' }))}
                {key(<Delete className="size-5" aria-hidden />, 'back', 'fn', '', t('fx.backspace', { defaultValue: 'Supprimer le dernier chiffre' }))}
                {key(<ArrowLeftRight className="size-5" aria-hidden />, 'swap', 'accent', '', t('fx.swap', { defaultValue: 'Inverser' }))}
                {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => key(d, d, 'digit'))}
                {key('0', '0', 'digit', 'col-span-2')}
                {key(',', '.', 'digit', '', t('fx.decimal', { defaultValue: 'Virgule' }))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
