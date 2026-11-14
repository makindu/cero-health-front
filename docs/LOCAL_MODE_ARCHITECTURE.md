# CERO HEALTH — Mode local : audit et architecture

> **Statut : Phase 1 (fondations).** Le mode local est activé par `VITE_LOCAL_MODE=true`. Il n'envoie **aucune** requête
> aux API (CERO ID CORE, CERO UZISHA, CERO HEALTH). Bandeau permanent :
> « MODE LOCAL — Données enregistrées uniquement sur cet appareil. Aucune synchronisation serveur. »

## 1. Audit de l'existant (avant Phase 1)

| Zone | État constaté | Conséquence |
|---|---|---|
| 16 pages de modules | Lecture/écriture via `createResourceService` (modes api / démo / config) | Point d'intégration unique : le mode local s'y branche sans toucher aux pages |
| Mode démo | Écritures **non** enregistrées (`isDemo: true`) | Insuffisant pour un parcours réel : rien ne persiste |
| Consultation | Module clinique complet (7 sections, Tiptap, antécédents versionnés, signature, addenda) | Réutilisé tel quel ; ses données passeront par les dépôts locaux (Phase 4/5) |
| Patients / RDV / Accueil | Listes, doublons, agenda, passage sans RDV | À brancher sur dépôts locaux (Phase 2) |
| Facturation / caisse | Pages de liste, sans moteur de calcul | Moteur de tarification et factures figées à créer (Phase 3) |
| Argent | Aucun type monétaire | `core/money` créé (entiers en unités mineures) |
| Permissions | Constantes `PERMISSIONS`, `Can`, `ModuleRoute` | Étendues (remises, crédit, remboursement, couverture…) et **revérifiées dans les services** |
| Isolation établissement | `activeFacilityId` dans les préférences et clés de cache | Repris comme clé de partition des données locales |

## 2. Séparation des couches

```
UI (pages, composants)            ← ne connaît ni IndexedDB ni localStorage
Services applicatifs              ← createResourceService, services métier (Phase 2+)
Règles métier (fonctions pures)   ← money, tarification, validité, lits… testées sans navigateur
Repositories (Repository<T>)      ← contrat identique pour une future implémentation API
Stockage local (LocalDatabase)    ← IndexedDB (repli mémoire signalé), transactions atomiques
Contrats API futurs               ← docs/API_CONTRACTS_NEEDED.md
```
`localStorage` ne sert qu'aux préférences simples (thème, langue, rôle de démonstration).

## 3. Couche de données locale (`src/core/local`)
- **Un store générique `records`** : enveloppe `{collection, facilityId, id, data, version, createdAt, updatedAt, createdBy, updatedBy}`,
  clé composite `[collection, facilityId, id]`. Ajouter une entité ne demande pas de migration IndexedDB.
- **`audit`** (append-only) et **`meta`** (clé/valeur : version de schéma, marqueurs de semis).
- **`LocalDatabase.run(mode, fn)`** : transaction atomique avec annulation complète en cas d'erreur ; écritures sérialisées
  (verrou : deux caisses ne peuvent pas occuper le même lit — testé).
- **Migrations** : `schema.ts` (`SCHEMA_VERSION`, `migrate`) ; un schéma plus récent que l'application est refusé (`SchemaTooNewError`).
- **Verrou optimiste** : `update(id, change, {expectedVersion})` → conflit `409` si la version a changé.
- **Semis fictif** : les lignes `demoRows` sont copiées une fois par établissement ; réinitialisable.
- **Sauvegarde / restauration / réinitialisation** (`backup.ts`, page « Données locales ») : fichier JSON validé **avant**
  toute restauration, confirmation obligatoire, schéma trop récent refusé.
- **Repli mémoire** : si IndexedDB est indisponible (navigation privée…), l'application l'indique et propose d'exporter.
- **Jamais de donnée locale vers CERO ID CORE / CERO UZISHA.**

## 4. Intégration (`createResourceService`)
Mode `local` prioritaire quand `VITE_LOCAL_MODE=true`. Lecture : toujours possible (jeu fictif). Écriture : **seulement** si le
module déclare `local.create/update/commands` — sinon erreur explicite « non disponible en mode local pour ce module »
(aucune création générique qui produirait des lignes incohérentes). Les permissions déclarées sont vérifiées par
`assertPermission` dans le service ; chaque écriture ajoute une entrée d'audit dans la même transaction.

## 5. Rôles de démonstration
Réceptionniste, caissier, médecin, infirmier, laborantin, pharmacien, responsable hospitalisation, administrateur — utilisateurs
**fictifs** (sélecteur dans le bandeau). Ce n'est pas une authentification ; l'identité réelle viendra de CERO ID CORE.

## 6. Argent (`src/core/money`)
Montants en unités mineures entières ; pourcentages en points de base (80 % = 8000) ; arrondi « demi vers le haut » sur la valeur
absolue ; `allocate` (plus grand reste) conserve la somme ; devises à 0 ou 2 décimales. Exemple vérifié : 18 USD à 80 % →
assureur 14,40 / patient 3,60.

## 7. Changements d'architecture planifiés
1. Nouvelles collections : organismes, contrats, couvertures patient, abonnements, factures (avec **instantané des règles**),
   paiements, contrepassations, créances assureur, séjours, lits, comptes hospitaliers.
2. Moteur de tarification pur (`core/pricing`), appelé par accueil, caisse, labo, pharmacie, hospitalisation.
3. Service de facturation transactionnel (facture + lignes + paiement + écritures en une transaction).
4. Nouvelles permissions : remise, crédit, remboursement, annulation, exemption, validation de couverture, sortie exceptionnelle.
5. Chaque module déclare ses règles locales (`local.*`) au fur et à mesure des phases.

## 8. Limites connues (honnêteté)
- Adaptateur IndexedDB non exécuté dans l'environnement de développement de l'assistant (testé via l'implémentation mémoire) : à valider dans le navigateur.
- `pnpm check` et la validation navigateur sont à lancer sur le poste de l'utilisateur.
