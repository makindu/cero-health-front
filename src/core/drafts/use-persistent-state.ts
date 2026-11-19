import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { clearDraft, loadDraft, saveDraft } from './draft-store';

const SAVE_DELAY_MS = 400;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface PersistentStateControls {
  /** Un brouillon a été retrouvé et appliqué à l'ouverture. */
  restored: boolean;
  /** Abandonne le brouillon et revient à la valeur de départ. */
  discard: () => void;
  /** À appeler après un enregistrement réussi : supprime le brouillon. */
  clear: () => void;
}

/**
 * Comme `useState`, mais la saisie est sauvegardée automatiquement (brouillon local) et restaurée
 * à la réouverture. `key` doit identifier le formulaire ET l'objet édité (ex. `rx:${patientId}`).
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, PersistentStateControls] {
  const initialRef = useRef(initial);
  const initialJson = useRef(JSON.stringify(initial));
  const [draft] = useState(() => loadDraft<T>(key));
  const [value, setValueRaw] = useState<T>(() =>
    draft === null ? initial : isPlainObject(initial) && isPlainObject(draft) ? ({ ...initial, ...draft } as T) : draft,
  );
  const [restored, setRestored] = useState(draft !== null);
  const latest = useRef(value);
  latest.current = value;
  const suppressed = useRef(false);

  const setValue: Dispatch<SetStateAction<T>> = useCallback((next) => {
    suppressed.current = false;
    setValueRaw(next);
  }, []);

  useEffect(() => {
    if (suppressed.current) return;
    if (JSON.stringify(value) === initialJson.current) {
      clearDraft(key);
      return;
    }
    const id = setTimeout(() => saveDraft(key, value), SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [key, value]);

  // Dernière sauvegarde à la fermeture (le délai ci-dessus n'a peut-être pas eu le temps de s'écouler).
  useEffect(
    () => () => {
      if (!suppressed.current && JSON.stringify(latest.current) !== initialJson.current) {
        saveDraft(key, latest.current);
      }
    },
    [key],
  );

  const clear = useCallback(() => {
    suppressed.current = true;
    clearDraft(key);
  }, [key]);

  const discard = useCallback(() => {
    clearDraft(key);
    setRestored(false);
    setValue(initialRef.current);
  }, [key, setValue]);

  return [value, setValue, { restored, discard, clear }];
}
