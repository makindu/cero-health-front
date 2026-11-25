import { describe, expect, it } from 'vitest';
import { FORMAT_SPEC, RECEIPT_FORMATS, isReceiptFormat, receiptHtml, type ReceiptData } from './receipt';

const base: ReceiptData = {
  title: 'Reçu de règlement', facility: { name: 'CERO CEPATEC', address: 'Lubumbashi' }, number: 'STL-8', dateTime: '25/11/2026 12:47',
  lines: [{ label: 'Organisme', value: 'CERO <CEPATEC>' }, { label: 'Montant', value: '300,00 $US', strong: true }],
  copyNumber: 1, duplicateLabel: 'DUPLICATA — copie n° {n}',
};

describe('reçu imprimable', () => {
  it('propose A4, ticket 80 mm et ticket 58 mm', () => {
    expect([...RECEIPT_FORMATS].sort()).toEqual(['a4', 'pos58', 'pos80']);
    expect(isReceiptFormat('pos58')).toBe(true);
    expect(isReceiptFormat('a3')).toBe(false);
  });

  it('règle la page selon le format choisi', () => {
    expect(receiptHtml(base, 'a4')).toContain('@page{size:A4');
    expect(receiptHtml(base, 'pos80')).toContain('size:80mm auto');
    expect(receiptHtml(base, 'pos58')).toContain('size:58mm auto');
    expect(parseFloat(FORMAT_SPEC.pos58.width)).toBeLessThan(parseFloat(FORMAT_SPEC.pos80.width));
  });

  it("l'original ne porte aucune mention de duplicata", () => {
    expect(receiptHtml(base, 'a4')).not.toContain('DUPLICATA');
  });

  it('une copie suivante porte la mention DUPLICATA et son numéro, en haut et en bas', () => {
    const html = receiptHtml({ ...base, copyNumber: 3, firstPrintedLabel: 'Original imprimé le 25/11/2026' }, 'pos80');
    expect(html).toContain('DUPLICATA — copie n° 3');
    expect(html.match(/class="dup"/g)).toHaveLength(2);
    expect(html).toContain('Original imprimé le 25/11/2026');
  });

  it('échappe le texte affiché', () => {
    expect(receiptHtml(base, 'a4')).toContain('CERO &lt;CEPATEC&gt;');
    expect(receiptHtml(base, 'a4')).not.toContain('<CEPATEC>');
  });
});
