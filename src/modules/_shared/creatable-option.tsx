import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/forms/controls';
import { Button } from '@/components/ui/button';

export interface CreatableConfig {
  /** Texte du lien qui ouvre la saisie (ex. « Ajouter un type »). */
  addLabel: string;
  inputLabel: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Message affiché si la création échoue sans message du serveur. */
  errorMessage: string;
  /** Crée la valeur côté serveur et renvoie l'option à ajouter à la liste (et à sélectionner). */
  onCreate: (label: string) => Promise<{ value: string; label: string }>;
}

/** Saisie en ligne d'une nouvelle valeur d'une liste de choix, sans quitter le formulaire. */
export function CreatableOption({ config, onAdded }: { config: CreatableConfig; onAdded: (option: { value: string; label: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setOpen(false);
    setText('');
    setError('');
  };

  const add = async () => {
    const label = text.trim();
    if (label.length < 2 || busy) return;
    setBusy(true);
    setError('');
    try {
      onAdded(await config.onCreate(label));
      close();
    } catch (e) {
      setError(e instanceof Error && e.message && !/^\d{3}$/.test(e.message) ? e.message : config.errorMessage);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <Plus aria-hidden className="size-4" />
        {config.addLabel}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          className="min-w-0 flex-1 basis-48"
          aria-label={config.inputLabel}
          placeholder={config.placeholder}
          value={text}
          maxLength={60}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Entrée ajoute le type ; elle ne doit jamais valider tout le formulaire.
            if (e.key === 'Enter') {
              e.preventDefault();
              void add();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        />
        <Button size="icon" onClick={() => void add()} loading={busy} disabled={text.trim().length < 2} aria-label={config.confirmLabel} title={config.confirmLabel}>
          <Check aria-hidden className="size-5" />
        </Button>
        <Button size="icon" variant="outline" onClick={close} disabled={busy} aria-label={config.cancelLabel} title={config.cancelLabel}>
          <X aria-hidden className="size-5" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
