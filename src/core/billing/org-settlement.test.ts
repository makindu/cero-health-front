import { describe, expect, it } from 'vitest';
import { distributeLump, groupByMember, spreadOldestFirst, validateAllocations, type OrgDue } from './org-settlement';

const d = (invoiceId: string, patientId: string, patientName: string, createdAt: string, due: number): OrgDue => ({ invoiceId, number: invoiceId.toUpperCase(), createdAt, patientId, patientName, due });
const dues: OrgDue[] = [
  d('i1', 'p2', 'Zola', '2026-11-01', 5000),
  d('i2', 'p1', 'Alice', '2026-11-02', 3000),
  d('i3', 'p1', 'Alice', '2026-11-03', 2000),
  d('i4', 'p2', 'Zola', '2026-11-04', 1000),
];
const members = groupByMember(dues);
const sum = (a: { amount: number }[]): number => a.reduce((s, x) => s + x.amount, 0);

describe('paiement groupé par organisme', () => {
  it('regroupe par membre, alphabétique, factures de la plus ancienne à la plus récente', () => {
    expect(members.map((m) => [m.patientName, m.total])).toEqual([['Alice', 5000], ['Zola', 6000]]);
    expect(members[1]!.invoices.map((i) => i.invoiceId)).toEqual(['i1', 'i4']);
  });

  it('répartit un montant par membre, plus ancienne facture d’abord', () => {
    expect(spreadOldestFirst(members[0]!.invoices, 4000)).toEqual([{ invoiceId: 'i2', amount: 3000 }, { invoiceId: 'i3', amount: 1000 }]);
  });

  it('somme globale « plus anciennes d’abord » : toutes les factures, tous membres confondus', () => {
    const a = distributeLump(members, 8000, 'oldest');
    expect(a).toEqual([{ invoiceId: 'i1', amount: 5000 }, { invoiceId: 'i2', amount: 3000 }]);
  });

  it('somme globale « membre par membre »', () => {
    const a = distributeLump(members, 7000, 'member');
    expect(a).toEqual([{ invoiceId: 'i2', amount: 3000 }, { invoiceId: 'i3', amount: 2000 }, { invoiceId: 'i1', amount: 2000 }]);
  });

  it('somme globale proportionnelle : total exact, jamais au-delà du dû d’un membre', () => {
    for (const lump of [1, 7, 3333, 5555, 10999, 11000]) {
      const a = distributeLump(members, lump, 'proportional');
      expect(sum(a)).toBe(lump);
      for (const m of members) {
        const got = sum(a.filter((x) => m.invoices.some((i) => i.invoiceId === x.invoiceId)));
        expect(got <= m.total).toBe(true);
      }
    }
  });

  it('refuse trop-perçu, montant nul ou invalide, rien à payer', () => {
    expect(() => distributeLump(members, 11001, 'oldest')).toThrow();
    expect(() => distributeLump(members, 0, 'member')).toThrow();
    expect(() => distributeLump(members, 1.5, 'proportional')).toThrow();
    expect(() => distributeLump([], 100, 'oldest')).toThrow();
  });

  it('valide un lot saisi : ignore les zéros, refuse doublon, inconnue, excès, lot vide', () => {
    expect(validateAllocations(dues, [{ invoiceId: 'i1', amount: 5000 }, { invoiceId: 'i2', amount: 0 }])).toEqual([{ invoiceId: 'i1', amount: 5000 }]);
    expect(() => validateAllocations(dues, [{ invoiceId: 'i1', amount: 5001 }])).toThrow();
    expect(() => validateAllocations(dues, [{ invoiceId: 'zz', amount: 1 }])).toThrow();
    expect(() => validateAllocations(dues, [{ invoiceId: 'i1', amount: 1 }, { invoiceId: 'i1', amount: 1 }])).toThrow();
    expect(() => validateAllocations(dues, [{ invoiceId: 'i1', amount: 0 }])).toThrow();
    expect(() => validateAllocations(dues, [{ invoiceId: 'i1', amount: -5 }])).toThrow();
  });
});
