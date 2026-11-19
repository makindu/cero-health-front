import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { DateField, Input, Select, Textarea } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { DraftNotice } from '@/components/feedback/draft-notice';
import { Button } from '@/components/ui/button';
import { clearDraft, fingerprint, loadDraft, saveDraft } from '@/core/drafts/draft-store';
import { useDirtySource } from '@/core/unsaved/use-dirty-source';
import { PatientCombobox } from './patient-combobox';
import { PractitionerCombobox } from './practitioner-combobox';

export type FieldType = 'text' | 'textarea' | 'date' | 'time' | 'select' | 'number' | 'tel' | 'email' | 'patient' | 'practitioner';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
  /** Format exigé (champ non vide) ; `patternMessage` est une clé i18n. */
  pattern?: RegExp;
  patternMessage?: string;
  /** 2 = occupe toute la largeur sur écran large. */
  span?: 1 | 2;
}

type Values = Record<string, string>;

/** Construit le schéma Zod d'un formulaire. Les messages sont des CLÉS i18n (traduites par FormField). */
export function buildSchema(fields: readonly FieldDef[]) {
  const shape: Record<string, z.ZodType<string>> = {};
  for (const field of fields) {
    let rule: z.ZodType<string> = field.required
      ? z.string().trim().min(1, { message: 'validation.required' })
      : z.string().trim();
    if (field.type === 'email') {
      rule = rule.refine((value) => value === '' || /^\S+@\S+\.\S+$/.test(value), {
        message: 'validation.email',
      });
    } else if (field.type === 'number') {
      rule = rule.refine((value) => value === '' || /^\d+([.,]\d+)?$/.test(value), {
        message: 'validation.number',
      });
    } else if (field.type === 'date') {
      rule = rule.refine((value) => value === '' || !Number.isNaN(Date.parse(value)), {
        message: 'validation.invalidDate',
      });
    }
    if (field.pattern) {
      const pattern = field.pattern;
      rule = rule.refine((value) => value === '' || pattern.test(value), {
        message: field.patternMessage ?? 'validation.invalidFormat',
      });
    }
    shape[field.name] = rule;
  }
  return z.object(shape);
}

function buildResolver(fields: readonly FieldDef[]): Resolver<Values> {
  const schema = buildSchema(fields);
  return (values) => {
    const result = schema.safeParse(values);
    if (result.success) return { values: result.data as Values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const name = String(issue.path[0] ?? '');
      if (name && !errors[name]) errors[name] = { type: 'validation', message: issue.message };
    }
    return { values: {}, errors: errors as unknown as FieldErrors<Values> };
  };
}

interface DynamicFormProps {
  fields: readonly FieldDef[];
  defaultValues?: Record<string, string>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: Values) => void | Promise<void>;
  onCancel?: () => void;
  /** Identifiant du brouillon automatique (par défaut : page + champs + valeurs de départ). */
  draftKey?: string;
  /** `false` pour désactiver le brouillon automatique (ex. champ sensible). */
  autosave?: boolean;
}

/** Formulaire généré depuis une définition de champs : validation Zod, erreurs traduites, accessible. */
export function DynamicForm({
  fields,
  defaultValues,
  submitLabel,
  submitting,
  onSubmit,
  onCancel,
  draftKey,
  autosave = true,
}: DynamicFormProps) {
  const { t } = useTranslation();
  const resolver = useMemo(() => buildResolver(fields), [fields]);
  // Valeurs de départ figées à l'ouverture ; le brouillon (saisie précédente non enregistrée) les remplace s'il existe.
  const [base] = useState<Values>(() =>
    Object.fromEntries(fields.map((field) => [field.name, defaultValues?.[field.name] ?? ''])),
  );
  const storageKey = useMemo(
    () =>
      draftKey ??
      `form:${globalThis.location?.pathname ?? ''}:${fields.map((f) => f.name).join('|')}:${fingerprint(base)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftKey, base],
  );
  const [draft] = useState<Values | null>(() => (autosave ? loadDraft<Values>(storageKey) : null));
  const [restored, setRestored] = useState(draft !== null);
  const [initial] = useState<Values>(() => {
    const merged: Values = { ...base };
    if (draft) for (const field of fields) if (typeof draft[field.name] === 'string') merged[field.name] = draft[field.name] ?? '';
    return merged;
  });
  const {
    register,
    setValue,
    handleSubmit,
    reset,
    watch,
    getValues,
    formState: { errors },
  } = useForm<Values>({ resolver, defaultValues: initial });

  const current = watch();
  const [submitted, setSubmitted] = useState(false);
  const changed = (values: Values) => fields.some((f) => (values[f.name] ?? '') !== (base[f.name] ?? ''));
  const dirty = changed(current) && !submitted;
  useDirtySource(dirty);

  // Sauvegarde automatique (légèrement différée) + dernière sauvegarde à la fermeture.
  const stopped = useRef(false);
  useEffect(() => {
    if (!autosave) return;
    const persist = () => {
      if (stopped.current) return;
      const values = getValues();
      if (changed(values)) saveDraft(storageKey, values);
      else clearDraft(storageKey);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = watch(() => {
      clearTimeout(timer);
      timer = setTimeout(persist, 400);
    });
    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
      persist();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, storageKey]);

  const discardDraft = () => {
    clearDraft(storageKey);
    reset(base);
    setRestored(false);
  };

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
    // Enregistré : le brouillon n'a plus lieu d'être.
    stopped.current = true;
    clearDraft(storageKey);
    setSubmitted(true);
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {restored && <DraftNotice onDiscard={discardDraft} />}
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <FormField
            key={field.name}
            label={field.label}
            hint={field.hint}
            required={field.required}
            error={errors[field.name]?.message}
            className={field.span === 2 ? 'md:col-span-2' : undefined}
          >
            {(control) => {
              const bound = register(field.name);
              if (field.type === 'textarea') {
                return <Textarea {...control} {...bound} placeholder={field.placeholder} />;
              }
              if (field.type === 'select') {
                return (
                  <Select {...control} {...bound} defaultValue="">
                    <option value="">{t('module.choose')}</option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                );
              }
              if (field.type === 'patient') {
                return (
                  <>
                    <input type="hidden" {...bound} />
                    <PatientCombobox {...control} placeholder={field.placeholder} defaultValue={initial[field.name] ?? ''} onValueChange={(v) => setValue(field.name, v, { shouldValidate: true })} />
                  </>
                );
              }
              if (field.type === 'practitioner') {
                return (
                  <>
                    <input type="hidden" {...bound} />
                    <PractitionerCombobox {...control} placeholder={field.placeholder} defaultValue={initial[field.name] ?? ''} onValueChange={(v) => setValue(field.name, v, { shouldValidate: true })} />
                  </>
                );
              }
              if (field.type === 'date') return <DateField {...control} {...bound} />;
              if (field.type === 'time') return <Input {...control} {...bound} type="time" />;
              return (
                <Input
                  {...control}
                  {...bound}
                  type={field.type === 'number' ? 'text' : field.type}
                  inputMode={field.type === 'number' ? 'decimal' : undefined}
                  placeholder={field.placeholder}
                />
              );
            }}
          </FormField>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('module.requiredHint')}</p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {onCancel && (
          <Button
            variant="outline"
            onClick={() => {
              stopped.current = true;
              clearDraft(storageKey);
              onCancel();
            }}
            disabled={submitting}
          >
            {t('actions.cancel')}
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
