import { describe, expect, it } from 'vitest';
import { latestReadingOn, toReading } from './triage-vitals';

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
});
