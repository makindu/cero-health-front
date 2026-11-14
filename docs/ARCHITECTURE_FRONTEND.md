# Architecture frontend — CERO HEALTH

## 1. Stack
React 19 · TypeScript · Vite · Tailwind CSS 4 · React Router · TanStack Query · Axios · React Hook Form + Zod ·
Lucide · i18next. Gestionnaire : pnpm. Tests : Vitest + Testing Library.
(Le gabarit Angular partagé n'est pas utilisé : la mission a choisi React.)

## 2. Arborescence (Phase 1)
```
frontend/
  docs/                      ce dossier + contrats + questions ID CORE
  scripts/                   check-i18n.mjs, check-design-tokens.mjs
  src/
    app/                     AppProviders (Query, Thème, Permissions, Toasts)
    routes/                  routeur (pages lazy, routes de modules générées depuis nav-config)
    pages/                   Dashboard, ModulePlaceholder, DesignSystem, NotFound
    components/
      ui/                    button, badge, card, dialog, tabs, breadcrumbs, dropdown
      forms/                 FormField, contrôles, SearchInput
      tables/                DataTable (table ≥ md / cartes mobile), Pagination
      feedback/              spinner, EmptyState, ErrorState, toasts
      layout/                AppLayout, Sidebar, en-tête, thème, langue, utilisateur
    core/
      api/                   3 clients, erreurs, normaliseurs, stratégies d'auth, contrats HEALTH
      auth/                  AuthPort (provisoire)
      config/                env (VITE_* validées par Zod)
      i18n/                  init, formateurs
      navigation/            nav-config (menu + permissions)
      permissions/           codes, provider, <Can>
      preferences/           store (thème, langue, densité, menu)
      theme/                 ThemeProvider
    locales/{fr,en,sw}/      common, dashboard, designSystem
    styles/                  tokens.css (source des couleurs), index.css
    hooks/  utils/  test/
```
Phases suivantes ajouteront `src/modules/<module>/{services,hooks,pages}`.

## 3. Multi-API
`idCoreClient`, `uzishaClient`, `healthClient` : trois instances Axios indépendantes (URL, délai, normaliseur,
stratégie d'auth propres). Erreurs normalisées en `ApiError` (12 types), sans en-têtes ni jeton. Les composants
n'appellent jamais d'endpoint : ils passent par des services métier (ex. `patientService.getPatients()`).
Un jeton n'est jamais supposé valide pour toutes les API.

## 4. Authentification
Uniquement via CERO ID CORE, en phase 2, derrière `AuthPort`. Bloquée par `CERO_ID_CORE_QUESTIONS.md`.
Le cache TanStack est vidé à la déconnexion et au changement d'établissement (`queryKeys.scoped`).

## 5. Design system
Couleurs = variables CSS dans `tokens.css` (clair / sombre), jamais de couleur en dur. Les teintes d'origine
(#0D9488, #22A06B, warning #D97706) échouent AA avec du texte blanc (3,74 / 3,30 / 3,19) : des variantes
assombries sont utilisées pour les aplats et conservées en `--palette-*`. Validé par `pnpm check:tokens`
(33 paires × 2 thèmes). Statuts = icône + libellé. Densité via `data-density`.

## 6. i18n
fr (défaut), en, sw ; un fichier JSON par espace de noms. Ajouter une langue = ajouter un dossier avec
`common.json` contenant `meta`. Parité des clés vérifiée par `pnpm check:i18n`. Le swahili doit être relu par un
locuteur natif.

## 7. Responsive
Mobile : menu en tiroir, tableaux en cartes, fenêtres en feuille basse. Tablette : rail d'icônes.
Ordinateur : menu complet réductible.

## 8. Sécurité
Aucun secret dans le code ni les VITE_*. Le frontend n'est pas une barrière : permissions revérifiées par l'API.
`VITE_PREVIEW_MODE=true` donne toutes les permissions (démonstration seulement, bandeau « Aperçu »).

## 9. Phases
1 fondations (ce livrable) · 2 connexion ID CORE, profil, établissement, permissions · 3 dashboard, patients ·
4 RDV, dossiers, consultations, soins · 5 prescriptions, pharmacie, labo, hospitalisation, facturation, stock ·
6 rapports, administration, audit, impression.

## 10. Risques
Contrat ID CORE inconnu · format des permissions non tranché · correspondance établissement/entreprise ·
endpoints HEALTH inexistants · swahili non relu.


## Modules métier (phase 3)

- `src/modules/_shared/` : moteur commun — `resource-service` (modes api / démo / erreur de configuration),
  `use-resource` (TanStack Query par établissement), `ResourcePage` (recherche, filtres, tri, pagination, fiche détail,
  création), `DynamicForm` (RHF + Zod), `CommandButton` (confirmation puis commande), `ModuleRoute` (garde de permission).
- `src/modules/<module>/` : `data.ts` (types, service, données FICTIVES `DEMO-`), pages et colonnes.
- `src/modules/registry.tsx` : identifiant de navigation → page chargée à la demande ; `routes/index.tsx` l'utilise
  et retombe sur `ModulePlaceholderPage` si un module n'est pas enregistré.
- Règle d'honnêteté : en démonstration, aucune écriture n'est simulée comme réelle (bannière + message explicite).
