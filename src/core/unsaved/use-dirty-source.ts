import { useEffect, useId } from 'react';
import { setDirtySource } from './dirty-registry';

/** Déclare que l'écran ou la fenêtre courante contient des modifications non enregistrées. */
export function useDirtySource(dirty: boolean): void {
  const id = useId();
  useEffect(() => {
    setDirtySource(id, dirty);
    return () => setDirtySource(id, false);
  }, [id, dirty]);
}
