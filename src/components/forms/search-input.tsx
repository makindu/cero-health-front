import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from './controls';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  debounceMs?: number;
}

/** Recherche avec délai (évite un appel API à chaque frappe). */
export function SearchInput({ value, onChange, placeholder, label, debounceMs = 300 }: SearchInputProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  // Si le parent change la valeur (ex. réinitialisation), le champ suit : ajustement pendant le rendu,
  // sans effet (react.dev « You might not need an effect »).
  const [previousValue, setPreviousValue] = useState(value);
  if (value !== previousValue) {
    setPreviousValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), debounceMs);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange, debounceMs]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={label ?? t('search.label')}
        placeholder={placeholder ?? t('search.placeholder')}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          aria-label={t('actions.clear')}
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
