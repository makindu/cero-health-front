import type { ReactNode } from 'react';

export interface DetailItem {
  label: string;
  value: ReactNode;
}

/** Liste « libellé / valeur » pour les fiches détaillées. */
export function DescriptionList({ items }: { items: readonly DetailItem[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm text-foreground">{item.value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border pb-5 last:border-b-0 last:pb-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}
