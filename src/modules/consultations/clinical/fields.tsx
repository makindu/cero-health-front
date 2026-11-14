import type { ReactNode } from 'react';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { RichTextEditor } from '../richtext/RichTextEditor';
import type { RichDoc } from '../richtext/doc';
import type { SectionId } from './model';

export function TextField({ label, value, onChange, disabled, type = 'text', hint, list, className }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; type?: string; hint?: string; list?: string; className?: string;
}) {
  return (
    <FormField label={label} hint={hint} className={className}>
      {(c) => <Input {...c} type={type} list={list} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />}
    </FormField>
  );
}

export function AreaField({ label, value, onChange, disabled, hint, rows = 3, className }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; hint?: string; rows?: number; className?: string;
}) {
  return (
    <FormField label={label} hint={hint} className={className}>
      {(c) => <Textarea {...c} rows={rows} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />}
    </FormField>
  );
}

export function SelectField({ label, value, onChange, options, disabled, className }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean; className?: string;
}) {
  return (
    <FormField label={label} className={className}>
      {(c) => (
        <Select {...c} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      )}
    </FormField>
  );
}

export function RichField({ label, value, onChange, disabled, target }: {
  label: string; value: RichDoc; onChange: (d: RichDoc) => void; disabled?: boolean; target?: SectionId | 'report';
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <RichTextEditor label={label} value={value} onChange={onChange} disabled={disabled} target={target} />
    </div>
  );
}

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}
