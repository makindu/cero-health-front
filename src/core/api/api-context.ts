/**
 * Contexte transmis aux API à chaque requête (établissement actif).
 * Alimenté par le module d'authentification / de sélection d'établissement (phase 2).
 *
 * Attention : ce contexte n'est qu'une INDICATION envoyée au backend. L'API doit toujours revérifier
 * que l'utilisateur a accès à l'établissement demandé (cahier des charges §2.3, §10).
 */
export interface ApiContext {
  facilityId: string | null;
}

let current: ApiContext = { facilityId: null };

export const apiContext = {
  get: (): ApiContext => current,
  set(patch: Partial<ApiContext>): void {
    current = { ...current, ...patch };
  },
};
