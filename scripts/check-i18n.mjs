/**
 * Contrôles d'internationalisation (aucune dépendance) : `node scripts/check-i18n.mjs` ou `pnpm check:i18n`.
 *
 *  1. Toutes les langues ont les mêmes espaces de noms, les mêmes clés, aucune valeur vide,
 *     et les mêmes variables d'interpolation ({{variable}}) que le français (langue de référence).
 *  2. Chaque langue déclare common.meta.nativeName.
 *  3. Chaque clé utilisée littéralement dans le code (t('clé'), labelKey: 'clé') existe en français.
 *  4. Chaque ApiErrorKind possède ses textes errors.kind.<kind>.{title,description}.
 *
 * Une clé absente de son espace de noms est acceptée si « common » la définit (fallbackNS i18next).
 * Convention : un fichier source utilise au plus UN espace de noms via useTranslation('ns')
 * (sinon préfixer la clé : t('ns:clé')).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const localesDir = join(root, 'src', 'locales');
const srcDir = join(root, 'src');
const REFERENCE = 'fr';

const errors = [];
const fail = (message) => errors.push(message);

function flatten(object, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

const variables = (text) => [...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

// --- Chargement des traductions -------------------------------------------------------------
const languages = readdirSync(localesDir).filter((d) => statSync(join(localesDir, d)).isDirectory());
const catalog = {};
for (const language of languages) {
  catalog[language] = {};
  for (const file of readdirSync(join(localesDir, language)).filter((f) => f.endsWith('.json'))) {
    const namespace = file.replace(/\.json$/, '');
    try {
      catalog[language][namespace] = flatten(
        JSON.parse(readFileSync(join(localesDir, language, file), 'utf8')),
      );
    } catch (error) {
      fail(`JSON invalide : locales/${language}/${file} (${error.message})`);
    }
  }
}

if (!catalog[REFERENCE]) {
  fail(`Langue de référence « ${REFERENCE} » introuvable.`);
} else {
  // --- 1 & 2 : parité entre langues ----------------------------------------------------------
  for (const language of languages) {
    if (language === REFERENCE) continue;
    const refNamespaces = Object.keys(catalog[REFERENCE]);
    const namespaces = Object.keys(catalog[language]);
    for (const ns of refNamespaces) {
      if (!namespaces.includes(ns)) fail(`[${language}] espace de noms manquant : ${ns}`);
    }
    for (const ns of namespaces) {
      if (!refNamespaces.includes(ns)) fail(`[${language}] espace de noms en trop : ${ns}`);
    }
    for (const ns of refNamespaces) {
      const ref = catalog[REFERENCE][ns];
      const current = catalog[language][ns];
      if (!current) continue;
      for (const key of Object.keys(ref)) {
        if (!(key in current)) fail(`[${language}] clé manquante : ${ns}:${key}`);
      }
      for (const key of Object.keys(current)) {
        if (!(key in ref)) fail(`[${language}] clé en trop : ${ns}:${key}`);
      }
      for (const [key, value] of Object.entries(current)) {
        if (typeof value !== 'string' || value.trim() === '') {
          fail(`[${language}] valeur vide : ${ns}:${key}`);
        } else if (key in ref && variables(value).join() !== variables(ref[key]).join()) {
          fail(`[${language}] variables d'interpolation différentes : ${ns}:${key}`);
        }
      }
    }
  }
  for (const language of languages) {
    if (!catalog[language].common?.['meta.nativeName']) {
      fail(`[${language}] common.meta.nativeName manquant`);
    }
  }
}

// --- 3 : clés utilisées dans le code -------------------------------------------------------------
function listSources(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'locales' || entry === 'test') continue;
      files.push(...listSources(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

let checkedKeys = 0;
for (const file of listSources(srcDir)) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  const namespaces = [...source.matchAll(/useTranslation\(\s*['"]([\w-]+)['"]/g)].map((m) => m[1]);
  const unique = [...new Set(namespaces)];
  if (unique.length > 1) {
    fail(`${rel} : plusieurs espaces de noms dans le même fichier (${unique.join(', ')})`);
    continue;
  }
  const defaultNamespace = unique[0] ?? 'common';
  const used = [
    ...[...source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...source.matchAll(/\blabelKey:\s*['"]([^'"]+)['"]/g)].map((m) => `common:${m[1]}`),
  ];
  for (const raw of used) {
    const [ns, key] = raw.includes(':') ? raw.split(':') : [defaultNamespace, raw];
    checkedKeys += 1;
    if (!catalog[REFERENCE]?.[ns]) fail(`${rel} : espace de noms inconnu « ${ns} » (clé ${raw})`);
    else if (!(key in catalog[REFERENCE][ns]) && !(key in (catalog[REFERENCE].common ?? {}))) fail(`${rel} : clé de traduction absente : ${ns}:${key}`);
  }
}

// --- 4 : un texte par type d'erreur API -----------------------------------------------------------
const typesSource = readFileSync(join(srcDir, 'core', 'api', 'types.ts'), 'utf8');
const kindsBlock = /export type ApiErrorKind\s*=([^;]+);/.exec(typesSource);
if (!kindsBlock) {
  fail('ApiErrorKind introuvable dans src/core/api/types.ts');
} else {
  for (const [, kind] of kindsBlock[1].matchAll(/'([\w]+)'/g)) {
    for (const part of ['title', 'description']) {
      for (const language of languages) {
        if (!catalog[language]?.common?.[`errors.kind.${kind}.${part}`]) {
          fail(`[${language}] texte d'erreur manquant : common:errors.kind.${kind}.${part}`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  console.error(`\n${errors.length} problème(s) d'internationalisation.`);
  process.exit(1);
}
const totalKeys = Object.values(catalog[REFERENCE]).reduce((n, ns) => n + Object.keys(ns).length, 0);
console.log(
  `✓ i18n : ${languages.length} langues (${languages.join(', ')}), ${totalKeys} clés par langue, ` +
    `${checkedKeys} usages vérifiés dans le code.`,
);
