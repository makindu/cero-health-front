# Informations manquantes — CERO ID CORE

L'authentification de CERO HEALTH passe **uniquement** par CERO ID CORE (aucun login parallèle). Le contrat
réel n'ayant pas été fourni, **rien n'est deviné** dans le code : `idCoreClient` n'a pas de stratégie
d'authentification enregistrée et `AuthPort` (`src/core/auth/auth-port.ts`) est une interface provisoire.

À fournir avant la phase 2 :

1. **URLs de base** de chaque environnement (dev / recette / production) pour ID CORE, UZISHA et HEALTH, avec le préfixe (`/api`, `/api/v1`…).
2. **Connexion** : route, méthode, champs (identifiant = e-mail ? nom d'utilisateur ?), réponses de succès et d'échec, politique de verrouillage (429).
3. **Mécanisme de session** : cookie + CSRF (SPA du même domaine) ou jeton Bearer ? Durée, rafraîchissement, expiration, déconnexion (route).
4. **Profil courant** (`/me` ou équivalent) : champs renvoyés (id, nom, e-mail, avatar, langue, fuseau).
5. **Établissements** : un utilisateur peut-il en avoir plusieurs ? Comment lister, choisir et transmettre l'établissement actif (en-tête, chemin, claim) ? Établissement HEALTH = « enterprise » UZISHA ?
6. **Permissions** : format exact (`health.patients.view` selon le CDC technique, `patients.view` selon le CDC fonctionnel), où les lire (profil, route dédiée), comment elles dépendent de l'établissement.
7. **SSO** : flux de redirection entre applications CERO, code applicatif (`VITE_APP_CODE`), en-tête `X-CERO-APP`.
8. **CORS / CSRF** : origines autorisées pour le frontend, en-têtes personnalisés acceptés (`X-CERO-APP`, `X-Enterprise-Id`, `X-Request-Id`), route d'initialisation CSRF.
9. **Jeton accepté par HEALTH et UZISHA** : le même jeton/cookie est-il valide partout, ou chaque API a-t-elle son propre mécanisme ?
10. **UZISHA** : fichier `routes/api.php` et middleware `enterprise.active` (absents des archives) pour confirmer les routes réutilisables.
