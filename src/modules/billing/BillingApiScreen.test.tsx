import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/core/api';
import type { BillingLink } from './billing-api';

const h = vi.hoisted(() => ({ granted: new Set<string>(), toast: vi.fn() }));
vi.mock('@/core/permissions/PermissionsProvider', () => ({ usePermissions: () => ({ can: (code: string) => h.granted.has(code) }) }));
vi.mock('@/components/feedback/toast', () => ({ useToast: () => h.toast }));
vi.mock('../finance/use-finance', () => ({ useMoney: () => (minor: number, currency = 'USD') => `${(minor / 100).toFixed(2)} ${currency}` }));
vi.mock('./billing-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./billing-api')>()),
  apiBilling: { list: vi.fn(), show: vi.fn(), pay: vi.fn(), payTender: vi.fn(), payMixed: vi.fn(), cancel: vi.fn() },
}));

vi.mock('../exchange/fx-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../exchange/fx-api')>()),
  apiFx: { overview: vi.fn() },
}));

import { apiFx } from '../exchange/fx-api';
import { BillingApiScreen } from './BillingApiScreen';
import { apiBilling } from './billing-api';

const link = (over: Partial<BillingLink> = {}): BillingLink => ({
  id: '1', sourceType: 'consultation', sourceId: '3', patientId: '9', patientName: 'Alpha Test', currency: 'USD', status: 'active',
  totalMinor: 5000, paidMinor: 0, remainingMinor: 5000, createdAt: '2026-11-22T09:00:00Z', cancelReason: '', payments: [], lines: [], ...over,
});
const paid = link({ id: '2', patientName: 'Beta Test', paidMinor: 5000, remainingMinor: 0 });

const mocked = apiBilling as unknown as Record<'list' | 'show' | 'pay' | 'payTender' | 'payMixed' | 'cancel', ReturnType<typeof vi.fn>>;
const fxMock = apiFx as unknown as { overview: ReturnType<typeof vi.fn> };

function renderScreen(ui: ReactNode = <BillingApiScreen />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
async function openFirst(): Promise<void> {
  const row = (await screen.findAllByText('Alpha Test')).map((e) => e.closest('tr')).find(Boolean) as HTMLElement;
  await userEvent.click(within(row).getByRole('button'));
  // Le détail s'ouvre dans un <dialog> : on attend sa ligne « Reste à payer » (la liste en mode cartes porte aussi ce libellé).
  await waitFor(() => expect(document.querySelector('dialog[open] dt')).not.toBeNull());
}

beforeAll(() => {
  // jsdom n'implémente pas <dialog> : on simule l'ouverture et la fermeture.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
beforeEach(() => {
  h.granted.clear();
  h.toast.mockReset();
  Object.values(mocked).forEach((m) => m.mockReset());
  mocked.list.mockResolvedValue({ rows: [link(), paid], total: 2 });
  mocked.show.mockResolvedValue(link());
  fxMock.overview.mockReset();
  fxMock.overview.mockResolvedValue({ base: 'USD', rates: [], history: [] });
});

describe('écran de facturation (API)', () => {
  it('affiche les factures du serveur avec patient, montants et état', async () => {
    renderScreen();
    expect((await screen.findAllByText('Alpha Test')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beta Test').length).toBeGreaterThan(0);
    expect(screen.getAllByText('À encaisser').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Payée').length).toBeGreaterThan(0);
    expect(screen.getAllByText('50.00 USD').length).toBeGreaterThan(0);
    expect(mocked.list).toHaveBeenCalledWith({ status: undefined, sourceType: undefined, page: 1 });
  });

  it('n\'offre ni encaissement ni annulation sans les droits', async () => {
    renderScreen();
    await openFirst();
    expect(screen.queryByRole('button', { name: 'Enregistrer le paiement' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annuler la facture…' })).toBeNull();
  });

  it('refuse un montant trop élevé et envoie le bon montant avec une clé d\'idempotence', async () => {
    h.granted.add('health.billing.pay');
    mocked.pay.mockResolvedValue(link({ paidMinor: 2000, remainingMinor: 3000 }));
    renderScreen();
    await openFirst();
    const submit = screen.getByRole('button', { name: 'Enregistrer le paiement' });
    const input = document.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    expect(input.value).toBe('50.00');                // le montant dû est déjà saisi
    expect(submit).toBeEnabled();
    await userEvent.clear(input);
    expect(submit).toBeDisabled();
    await userEvent.type(input, '60');
    expect(submit).toBeDisabled();                    // 60 > 50 : jamais envoyé
    await userEvent.clear(input);
    await userEvent.type(input, '20');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() => expect(mocked.pay).toHaveBeenCalledTimes(1));
    expect(mocked.pay).toHaveBeenCalledWith('1', 2000, 'cash', expect.stringMatching(/.{8,}/));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' })));
  });

  it('encaisse dans une autre devise : propose le montant exact, convertit et envoie la devise remise', async () => {
    h.granted.add('health.billing.pay');
    fxMock.overview.mockResolvedValue({ base: 'USD', rates: [{ id: '1', baseCurrency: 'USD', currency: 'CDF', rate: '2800', date: '2026-11-28', setByName: '' }], history: [] });
    mocked.payTender.mockResolvedValue(link({ paidMinor: 5000, remainingMinor: 0 }));
    renderScreen();
    await openFirst();
    const select = await screen.findByLabelText('Devise remise par le patient');
    await userEvent.selectOptions(select, 'CDF');
    const input = document.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    expect(input.value).toBe('140000.00');            // 50,00 USD à 2800 = 140 000,00 CDF
    expect(screen.getByRole('button', { name: 'Enregistrer le paiement' })).toBeEnabled();
    await userEvent.clear(input);
    await userEvent.type(input, '150000');
    expect(screen.getByRole('button', { name: 'Enregistrer le paiement' })).toBeDisabled();   // dépasse le solde converti
    await userEvent.clear(input);
    await userEvent.type(input, '28000');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() => expect(mocked.payTender).toHaveBeenCalledTimes(1));
    expect(mocked.payTender).toHaveBeenCalledWith('1', 'CDF', 2800000, 'cash', expect.stringMatching(/.{8,}/));
    expect(mocked.pay).not.toHaveBeenCalled();
  });

  it('rejoue la MÊME clé après un échec, puis en change après un succès (aucun paiement en double)', async () => {
    h.granted.add('health.billing.pay');
    mocked.pay.mockRejectedValueOnce(new ApiError('conflict', 'Montant invalide ou supérieur au solde.', { source: 'health', status: 409, code: 'health.billing.overpayment' }));
    mocked.pay.mockResolvedValue(link({ paidMinor: 2000, remainingMinor: 3000 }));
    renderScreen();
    await openFirst();
    const input = document.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '20');
    const submit = screen.getByRole('button', { name: 'Enregistrer le paiement' });
    await userEvent.click(submit);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger', title: 'Montant invalide ou supérieur au solde.' })));
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);
    await waitFor(() => expect(mocked.pay).toHaveBeenCalledTimes(2));
    const [first, second] = mocked.pay.mock.calls.map((c) => c[3] as string);
    expect(second).toBe(first);                        // échec : même clé, le serveur ne paiera qu'une fois
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' })));
    const input2 = document.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    await userEvent.clear(input2);
    await userEvent.type(input2, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() => expect(mocked.pay).toHaveBeenCalledTimes(3));
    expect(mocked.pay.mock.calls[2][3]).not.toBe(first); // succès : nouvelle clé pour le paiement suivant
  });

  it('exige un motif pour annuler et l\'envoie tel quel', async () => {
    h.granted.add('health.billing.credit');
    mocked.cancel.mockResolvedValue(link({ status: 'cancelled', remainingMinor: 0, cancelReason: 'Erreur de saisie' }));
    renderScreen();
    await openFirst();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler la facture…' }));
    const confirm = screen.getByRole('button', { name: 'Annuler la facture' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'Erreur de saisie');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(mocked.cancel).toHaveBeenCalledWith('1', 'Erreur de saisie'));
  });

  it('montre l\'erreur du serveur si la liste ne charge pas, avec un réessai', async () => {
    mocked.list.mockRejectedValueOnce(new ApiError('network', 'x', { source: 'health' }));
    renderScreen();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    mocked.list.mockResolvedValue({ rows: [link()], total: 1 });
    await userEvent.click(screen.getByRole('button', { name: /Réessayer|Try again/ }));
    expect((await screen.findAllByText('Alpha Test')).length).toBeGreaterThan(0);
  });
  it('paiement mixte : 10 USD + CDF en une opération, avec aperçu du reste et envoi de toutes les remises', async () => {
    h.granted.add('health.billing.pay');
    fxMock.overview.mockResolvedValue({ base: 'USD', rates: [{ id: '1', baseCurrency: 'USD', currency: 'CDF', rate: '2800', date: '2026-11-28', setByName: '' }], history: [] });
    mocked.payMixed.mockResolvedValue(link({ paidMinor: 5000, remainingMinor: 0, payments: [
      { id: '7', amountMinor: 1000, method: 'cash', paidAt: '2026-11-28T10:00:00Z', groupId: 'mix-1' },
      { id: '8', amountMinor: 4000, method: 'mobile_money', paidAt: '2026-11-28T10:00:00Z', groupId: 'mix-1', tenderCurrency: 'CDF', tenderMinor: 11200000, fxRate: '2800' },
    ] }));
    renderScreen();
    await openFirst();
    await userEvent.click(await screen.findByRole('button', { name: /Paiement mixte/ }));
    const form = screen.getByRole('form', { name: 'Paiement mixte' });
    const inputs = within(form).getAllByRole('textbox');
    await userEvent.type(inputs[0], '10');
    await userEvent.type(inputs[1], '112000');          // 112 000 CDF = 40 USD
    expect(within(form).getByText('0.00 USD')).toBeInTheDocument();   // reste après paiement
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer le paiement mixte' }));
    await waitFor(() => expect(mocked.payMixed).toHaveBeenCalledTimes(1));
    expect(mocked.payMixed).toHaveBeenCalledWith('1', [
      { currency: 'USD', minor: 1000, method: 'cash' }, { currency: 'CDF', minor: 11200000, method: 'cash' },
    ], 'USD', expect.stringMatching(/.{8,}/));
  });

  it('paiement mixte : une remise hors espèces ne peut pas dépasser le solde', async () => {
    h.granted.add('health.billing.pay');
    fxMock.overview.mockResolvedValue({ base: 'USD', rates: [{ id: '1', baseCurrency: 'USD', currency: 'CDF', rate: '2800', date: '2026-11-28', setByName: '' }], history: [] });
    renderScreen();
    await openFirst();
    await userEvent.click(await screen.findByRole('button', { name: /Paiement mixte/ }));
    const form = screen.getByRole('form', { name: 'Paiement mixte' });
    await userEvent.selectOptions(within(form).getAllByRole('combobox')[1], 'card');
    await userEvent.type(within(form).getAllByRole('textbox')[0], '60');
    expect(within(form).getByRole('button', { name: 'Enregistrer le paiement mixte' })).toBeDisabled();
    expect(within(form).getByRole('alert')).toHaveTextContent('espèces');
  });

});
