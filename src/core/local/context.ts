import { preferencesStore } from '@/core/preferences/preferences-store';
import { getLocalSession } from './session';

/** Établissement utilisé tant qu'aucun n'est choisi (jeu de démonstration). */
export const LOCAL_DEFAULT_FACILITY = 'local-demo-facility';

export interface LocalContext {
  facilityId: string;
  actor: { id: string; name: string };
}

/** Contexte de la requête locale : établissement actif (préférence) et utilisateur de démonstration connecté. */
export function getLocalContext(): LocalContext {
  const user = getLocalSession().user;
  return {
    facilityId: preferencesStore.getSnapshot().activeFacilityId ?? LOCAL_DEFAULT_FACILITY,
    actor: { id: user.id, name: user.name },
  };
}
