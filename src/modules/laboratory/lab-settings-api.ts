import { healthClient } from '@/core/api';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});

export interface LabSettings {
  /** Règle réellement appliquée dans l'établissement. */
  requireDistinctValidator: boolean;
  /** Règle par défaut de la plateforme (quand l'établissement n'a pas fait de choix). */
  defaultRule: boolean;
  /** Vrai si l'établissement a fait son propre choix. */
  overridden: boolean;
}

export const labSettingsFrom = (v: unknown): LabSettings => {
  const d = rec(v);
  return { requireDistinctValidator: d.require_distinct_validator !== false, defaultRule: d.default !== false, overridden: d.overridden === true };
};

export const apiLabSettings = {
  get: async (): Promise<LabSettings> => labSettingsFrom((await healthClient.get<Row>('/lab/settings')).data),
  /** `null` = suivre la règle par défaut de la plateforme. */
  set: async (value: boolean | null): Promise<LabSettings> => labSettingsFrom((await healthClient.put<Row>('/lab/settings', { require_distinct_validator: value })).data),
};
