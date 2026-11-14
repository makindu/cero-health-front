/**
 * Port d'authentification : ce que l'interface attend de la couche d'identité, indépendamment
 * du protocole réel de CERO ID CORE.
 *
 * ⚠ Forme PROVISOIRE. Les champs des identifiants, le format des jetons/cookies, le routage et le
 * choix de l'établissement dépendent du contrat réel de CERO ID CORE, qui n'a pas encore été fourni
 * (voir docs/CERO_ID_CORE_QUESTIONS.md). Aucun endpoint n'est supposé ici.
 *
 * Phase 2 : un adaptateur (src/core/auth/cero-id-auth.ts) implémentera ce port en s'appuyant sur
 * idCoreClient et enregistrera sa stratégie via registerAuthStrategy('id-core', ...).
 */

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

/** Établissement auquel l'utilisateur a accès. */
export interface FacilityRef {
  id: string;
  name: string;
  logoUrl?: string;
  /** Fuseau IANA de l'établissement (ex. « Africa/Lubumbashi »). */
  timeZone?: string;
  /** Devise ISO 4217 de l'établissement. */
  currency?: string;
}

export interface SessionSnapshot {
  user: AuthenticatedUser;
  facilities: FacilityRef[];
  activeFacilityId: string | null;
  /** Codes de permission effectifs pour l'établissement actif. */
  permissions: readonly string[];
  /** Fin de validité de la session, si le backend la communique. */
  expiresAt?: string;
}

export interface Credentials {
  identifier: string;
  password: string;
}

export interface AuthPort {
  /** Restaure une session existante (SSO, cookie, jeton en mémoire). null = non connecté. */
  restoreSession(): Promise<SessionSnapshot | null>;
  signIn(credentials: Credentials): Promise<SessionSnapshot>;
  selectFacility(facilityId: string): Promise<SessionSnapshot>;
  signOut(): Promise<void>;
}
