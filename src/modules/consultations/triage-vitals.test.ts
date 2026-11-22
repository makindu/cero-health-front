import { describe, expect, it } from 'vitest';
import { latestReadingOn, readingsFromApi, toReading } from './triage-vitals';

const rec = (id: string, at: string, extra: Record<string, number> = {}) => toReading({ id, entryId: 'e1', recordedAt: at, recordedBy: 'Inf. A', ...extra });

describe('constantes du triage', () => {
  it('ne garde que ce qui a été mesuré, en texte', () => {
    const r = rec('v1', '2026-11-18T08:00:00', { temperature: 37.2, pulse: 80 });
    expect(r.values).toEqual({ temperature: '37.2', pulse: '80' });
  });
  it('reprend la dernière prise du jour de la consultation', () => {
    const list = [rec('v1', '2026-11-18T08:00:00', { pulse: 70 }), rec('v2', '2026-11-18T09:30:00', { pulse: 90 }), rec('v3', '2026-11-17T09:30:00', { pulse: 60 })];
    expect(latestReadingOn(list, '2026-11-18T11:00:00')?.id).toBe('v2');
    expect(latestReadingOn(list, '2026-11-19T11:00:00')).toBeUndefined();
  });
  it('ignore une prise sans aucune valeur', () => {
    expect(latestReadingOn([rec('v1', '2026-11-18T08:00:00')], '2026-11-18T10:00:00')).toBeUndefined();
  });

  it('traduit les constantes du serveur, avec l’auteur, et écarte une ligne corrigée', () => {
    const rows = [
      { id: 3, triage_entry_id: 11, recorded_at: '2026-11-21T08:05:00Z', recorded_by_user_id: 2, temperature_c: 38.5, pulse_bpm: 90, weight_kg: 12.4, height_cm: null, corrects_vital_sign_id: null },
      { id: 4, triage_entry_id: 11, recorded_at: '2026-11-21T08:09:00Z', recorded_by_user_id: 2, temperature_c: 38.1, pulse_bpm: null, corrects_vital_sign_id: 3 },
    ];
    const list = readingsFromApi(rows, (u) => `Inf. n°${String(u)}`);
    expect(list.map((r) => r.id)).toEqual(['4']);
    expect(list[0]).toMatchObject({ entryId: '11', author: 'Inf. n°2', values: { temperature: '38.1' } });
    const all = readingsFromApi(rows.slice(0, 1), () => 'x');
    expect(all[0]?.values).toEqual({ temperature: '38.5', pulse: '90', weight: '12.4' });
  });
});
