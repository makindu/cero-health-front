import { useEffect, useState } from 'react';
import { LOADED_AT } from '@/utils/dates';

/** Heure courante (ms) rafraîchie périodiquement : permet d'afficher des durées d'attente à jour sans lire l'horloge au rendu. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => LOADED_AT.getTime());
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
