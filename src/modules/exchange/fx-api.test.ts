import { describe, expect, it } from 'vitest';
import { fxOverviewFrom, fxRateFrom } from './fx-api';

describe('taux de change API', () => {
  it('traduit un taux en gardant sa valeur exacte (texte)', () => {
    expect(fxRateFrom({ id: 4, base_currency: 'USD', currency: 'CDF', rate: '2800', date: '2026-11-28', set_by_name: 'Mme Financière' }))
      .toEqual({ id: '4', baseCurrency: 'USD', currency: 'CDF', rate: '2800', date: '2026-11-28', setByName: 'Mme Financière' });
  });
  it('traduit la vue d\'ensemble : devise par défaut, taux en vigueur, historique', () => {
    const o = fxOverviewFrom({ base: 'USD', rates: [{ id: 2, currency: 'EUR', rate: '0.5', date: '2026-11-28' }], history: [{ id: 2, currency: 'EUR', rate: '0.5' }, { id: 1, currency: 'EUR', rate: '0.45' }] });
    expect(o.base).toBe('USD');
    expect(o.rates.map((r) => `${r.currency}:${r.rate}`)).toEqual(['EUR:0.5']);
    expect(o.history).toHaveLength(2);
  });
  it('accepte une réponse vide ou inattendue sans planter', () => {
    expect(fxOverviewFrom(undefined)).toEqual({ base: '', rates: [], history: [] });
    expect(fxOverviewFrom('x')).toEqual({ base: '', rates: [], history: [] });
  });
});
