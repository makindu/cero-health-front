# CERO HEALTH — frontend

Phase 1 : fondations (architecture, design system, thèmes, langues, responsive). Pas de connexion réelle ni de données médicales.

## Installation
Aucune dépendance n'est verrouillée ici (le registre n'était pas joignable lors de la génération).
```bash
pnpm add react react-dom react-router @tanstack/react-query axios react-hook-form zod @hookform/resolvers lucide-react i18next react-i18next clsx tailwind-merge
pnpm add -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite typescript vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom @types/node eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals prettier
cp .env.example .env.local
pnpm dev
```
## Contrôles
`pnpm check` = tokens + i18n + typecheck + lint + tests. `pnpm check:i18n` et `pnpm check:tokens` fonctionnent sans dépendances.

## Documentation
`docs/ARCHITECTURE_FRONTEND.md`, `docs/CERO_ID_CORE_QUESTIONS.md`, `docs/API_CONTRACTS_NEEDED.md`, `docs/UZISHA_REUSE_MATRIX.md`.
