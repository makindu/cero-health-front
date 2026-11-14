/**
 * Dates de référence pour les calculs d'affichage (âge, ancienneté d'une attente...).
 * Figée au chargement de l'application : suffisant pour l'affichage, et pure à l'appel
 * (pas d'horloge lue pendant le rendu).
 */
export const LOADED_AT = new Date();

/** Âge en années complètes à la date de référence ; null si la date est absente ou invalide. */
export function ageFromBirthDate(birthDate: string | null | undefined, reference: Date = LOADED_AT): number | null {
  if (!birthDate) return null;
  // « AAAA-MM-JJ » est un jour civil : on le lit en local, sinon new Date() le décale d'un jour à l'ouest de l'UTC.
  const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const birth = civil ? new Date(Number(civil[1]), Number(civil[2]) - 1, Number(civil[3])) : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = reference.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    reference.getMonth() < birth.getMonth() ||
    (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** Minutes écoulées entre une date ISO et la date de référence (≥ 0). */
export function minutesSince(iso: string, reference: Date = LOADED_AT): number {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.round((reference.getTime() - time) / 60000));
}

/** Date ISO (YYYY-MM-DD) décalée de `offset` jours par rapport à aujourd'hui. */
export function isoDay(offset: number, reference: Date = LOADED_AT): string {
  const date = new Date(reference);
  date.setDate(date.getDate() + offset);
  // Jour civil LOCAL (toISOString donnerait le jour UTC, faux près de minuit selon le fuseau).
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Instant ISO à `hour:minute` du jour décalé de `offset` jours. */
export function isoAt(offset: number, hour: number, minute = 0, reference: Date = LOADED_AT): string {
  const date = new Date(reference);
  date.setDate(date.getDate() + offset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}
