import { cn } from '@/utils/cn';

const SIZES = { xs: 'size-4 text-[8px]', sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-12 text-base' } as const;
/** Teintes issues des jetons du thème (contraste AA vérifié par scripts/check-design-tokens.mjs, clair et sombre). */
const TONES = [
  'bg-primary-soft text-primary-ink',
  'bg-info-soft text-info-ink',
  'bg-success-soft text-success-ink',
  'bg-warning-soft text-warning-ink',
  'bg-neutral-soft text-neutral-ink',
] as const;

/** Initiales : première lettre du premier et du dernier mot (« Juma Kilo » → « JK », « Amani » → « A »). */
export function initialsOf(name: string): string {
  const words = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, ' ').split(/[\s'’-]+/).filter((w) => /^\p{L}/u.test(w));
  if (words.length === 0) return '?';
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : '';
  return (first + last).toUpperCase();
}

/** Teinte stable pour un même nom (somme des codes de caractères) : la même personne a toujours la même couleur. */
export function toneIndexOf(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % TONES.length;
}

/**
 * Avatar à initiales. Décoratif (aria-hidden) : le nom est toujours écrit à côté.
 * Aucune photo : une photo de patient est une donnée sensible, son stockage relève du serveur (phase ultérieure).
 */
export function Avatar({ name, size = 'md', className }: { name: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-1 ring-border', SIZES[size], TONES[toneIndexOf(name)], className)}>
      {initialsOf(name)}
    </span>
  );
}

/** Avatar + nom (+ ligne secondaire). À utiliser partout où un patient ou un utilisateur est affiché. */
export function PersonName({ name, sub, size = 'md', strong = true }: { name: string; sub?: string; size?: keyof typeof SIZES; strong?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={name} size={size} />
      <span className="min-w-0">
        <span className={cn('block truncate', strong && 'font-medium')}>{name}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}
