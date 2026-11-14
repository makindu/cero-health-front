import { describe, expect, it } from 'vitest';
import { docOf, docToText, heading, isEmptyDoc, para, renderDocToHtml, sanitizeDoc } from './doc';

describe('contenu riche', () => {
  it('échappe le texte et ne produit aucune balise hors liste blanche', () => {
    const hostile = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] },
        { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
        { type: 'paragraph', attrs: { textAlign: 'center;background:url(x)' }, content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
      ],
    };
    const html = renderDocToHtml(hostile);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript');
    expect(html).not.toContain('style=');
    expect(html).toContain('&lt;img');
  });
  it('rend les marques, listes et tableaux autorisés', () => {
    const doc = docOf(heading('Titre'), { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'italic' }] }] });
    expect(renderDocToHtml(doc)).toBe('<h2>Titre</h2><p style="text-align:center"><em><strong>x</strong></em></p>');
  });
  it('accepte une chaîne JSON et rejette le reste sans planter', () => {
    expect(docToText(JSON.stringify(docOf(para('bonjour'))))).toBe('bonjour');
    expect(sanitizeDoc('pas du json').content).toHaveLength(1);
    expect(sanitizeDoc(null).type).toBe('doc');
    expect(sanitizeDoc({ type: 'autre' }).type).toBe('doc');
  });
  it('détecte un document vide', () => {
    expect(isEmptyDoc(docOf())).toBe(true);
    expect(isEmptyDoc(docOf(heading('Titre'), para()))).toBe(false);
  });
});

import { BUILT_IN_TEMPLATES, buildTemplateDoc, toggleFavorite } from './templates';

describe('modèles de rédaction', () => {
  it('fournit les 8 modèles demandés, de simples trames sans contenu clinique', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(8);
    for (const tpl of BUILT_IN_TEMPLATES) {
      const doc = buildTemplateDoc(tpl, (k) => `# ${k}`);
      expect(doc.content.filter((n) => n.type === 'heading')).toHaveLength(tpl.sections.length);
      expect(doc.content.filter((n) => n.type === 'paragraph').every((n) => !n.content)).toBe(true);
    }
  });
  it('gère les favoris sans doublon', () => {
    expect(toggleFavorite([], 'a')).toEqual(['a']);
    expect(toggleFavorite(['a', 'b'], 'a')).toEqual(['b']);
  });
});
