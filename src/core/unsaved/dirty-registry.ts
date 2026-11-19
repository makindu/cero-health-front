/**
 * Registre des « sources » de modifications non enregistrées (formulaires, fenêtres, éditeurs).
 * Règle du projet : tant qu'au moins une source est sale, quitter la page (changement de route,
 * fermeture de l'onglet) demande confirmation. Aucune dépendance à React : testable seul.
 */
const sources = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setDirtySource(id: string, dirty: boolean): void {
  const had = sources.has(id);
  if (dirty === had) return;
  if (dirty) sources.add(id);
  else sources.delete(id);
  notify();
}

export function hasUnsavedChanges(): boolean {
  return sources.size > 0;
}

export function subscribeDirty(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Réservé aux tests. */
export function resetDirtySources(): void {
  sources.clear();
  notify();
}
