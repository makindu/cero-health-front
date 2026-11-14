/**
 * Vérifie que les design tokens (src/styles/tokens.css) respectent les contrastes WCAG.
 *  - 4.5:1 pour le texte (texte normal),
 *  - 3:1 pour les éléments d'interface (bordures de champs, anneau de focus).
 * Aucune dépendance : `node scripts/check-design-tokens.mjs` (ou `pnpm check:tokens`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cssPath = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

function readBlock(selectorPattern) {
  const match = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Bloc CSS introuvable : ${selectorPattern}`);
  const vars = {};
  for (const m of match[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    vars[m[1]] = m[2];
  }
  return vars;
}

const light = readBlock(':root');
const dark = { ...light, ...readBlock('\\.dark') };

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [premier plan, arrière-plan, minimum requis, description] */
const TEXT = 4.5;
const UI = 3;
const pairs = [
  ['foreground', 'background', TEXT, 'texte sur fond de page'],
  ['foreground', 'surface', TEXT, 'texte sur carte'],
  ['foreground', 'surface-muted', TEXT, 'texte sur surface atténuée'],
  ['muted-foreground', 'background', TEXT, 'texte secondaire sur fond de page'],
  ['muted-foreground', 'surface', TEXT, 'texte secondaire sur carte'],
  ['muted-foreground', 'surface-muted', TEXT, 'texte secondaire sur surface atténuée'],
  ['primary-foreground', 'primary', TEXT, 'texte de bouton principal'],
  ['primary-foreground', 'primary-hover', TEXT, 'texte de bouton principal (survol)'],
  ['primary-ink', 'surface', TEXT, 'lien / texte primaire sur carte'],
  ['primary-ink', 'primary-soft', TEXT, 'texte primaire sur fond teinté'],
  ['primary-ink', 'surface-muted', TEXT, 'texte primaire sur surface atténuée'],
  ['nav-foreground', 'nav', TEXT, 'texte de navigation'],
  ['nav-muted', 'nav', TEXT, 'texte secondaire de navigation'],
  ['nav-foreground', 'nav-active', TEXT, 'élément de navigation actif'],
  ['nav-accent', 'nav', TEXT, 'accent de navigation'],
  ['border-strong', 'surface', UI, 'bordure de champ sur carte'],
  ['ring', 'surface', UI, 'anneau de focus sur carte'],
  ['ring', 'background', UI, 'anneau de focus sur fond de page'],
];
for (const tone of ['success', 'warning', 'danger', 'info', 'neutral']) {
  pairs.push(
    [`${tone}-foreground`, tone, TEXT, `texte sur fond plein ${tone}`],
    [`${tone}-ink`, `${tone}-soft`, TEXT, `badge ${tone}`],
    [`${tone}-ink`, 'surface', TEXT, `texte ${tone} sur carte`],
  );
}

let failures = 0;
for (const [themeName, vars] of [
  ['clair', light],
  ['sombre', dark],
]) {
  for (const [fg, bg, min, label] of pairs) {
    const a = vars[fg];
    const b = vars[bg];
    if (!a || !b) {
      console.error(`✗ [${themeName}] token manquant : ${!a ? fg : bg}`);
      failures += 1;
      continue;
    }
    const ratio = contrast(a, b);
    if (ratio < min) {
      console.error(
        `✗ [${themeName}] ${label} : ${fg} ${a} / ${bg} ${b} = ${ratio.toFixed(2)} (< ${min})`,
      );
      failures += 1;
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} contraste(s) insuffisant(s).`);
  process.exit(1);
}
console.log(
  `✓ Contrastes conformes WCAG AA (${pairs.length} paires × 2 thèmes) dans src/styles/tokens.css`,
);
