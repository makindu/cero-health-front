# Règle d'architecture : hors ligne d'abord, synchronisation automatique

Contexte : en République démocratique du Congo, le courant et la connexion Internet sont instables.
**Le système doit toujours pouvoir fonctionner sans Internet**, comme aujourd'hui en mode local, et se synchroniser
tout seul au retour de la connexion. Cette règle s'applique aussi après le branchement de l'API.

## Principes (non négociables)

1. **Écrire d'abord en local.** Toute action de l'utilisateur est enregistrée dans la base locale (IndexedDB) et visible
   immédiatement. L'API n'est jamais un préalable pour enregistrer, lire ou imprimer.
2. **Une file d'envoi (outbox).** Chaque écriture locale ajoute une entrée à une file persistante : identifiant unique
   (idempotence), collection, opération, contenu, horodatage, auteur, établissement, état (`pending`, `sending`, `failed`, `done`).
3. **Synchronisation automatique, sans bouton.** Elle part toute seule : au retour de la connexion (`online`), à l'ouverture
   de l'application, à intervalle régulier et après chaque écriture. Reprise après coupure au point exact où elle s'était arrêtée.
4. **Idempotence.** Le serveur reconnaît un identifiant déjà reçu et ne rejoue pas l'opération (double envoi sans effet).
   C'est déjà le principe des `submissionId` (paiements, règlements groupés, lots d'organisme).
5. **Conflits.** Données cliniques et financières : jamais d'écrasement silencieux. Écritures financières = journal en ajout seul
   (pas de conflit possible). Fiches modifiables : version + comparaison ; en cas de divergence, l'utilisateur tranche.
6. **Pas de perte de saisie.** Brouillons automatiques locaux (`core/drafts`) et garde « modifications non enregistrées »
   (`core/unsaved`) : voir ci-dessous. Une coupure de courant ne doit coûter que quelques secondes de saisie.
7. **État visible.** Un indicateur discret : « Hors ligne — N éléments en attente », « Synchronisation… », « À jour »,
   « N éléments en échec (à examiner) ». Jamais d'erreur bloquante simplement parce qu'il n'y a pas de réseau.
8. **Authentification et droits.** Session mise en cache pour continuer hors ligne ; les droits sont revérifiés par l'API à la synchronisation.
9. **Pièces et fichiers volumineux** : envoyés en différé, après les données structurées.

## Ce qui existe déjà

- Base locale transactionnelle (`core/local`, unités de travail atomiques) et journal d'audit local.
- Identifiants de soumission idempotents sur les opérations sensibles.
- `core/unsaved` : registre des modifications non enregistrées, confirmation avant de quitter une page, un onglet ou une fenêtre
  (clic à côté, Échap, croix). Tout nouvel écran à saisie doit s'y déclarer (`useDirtySource`) ; `Dialog` le fait automatiquement.
- `core/drafts` : brouillons automatiques (`DynamicForm` en bénéficie sans configuration ; `usePersistentState` pour les formulaires sur mesure).

## À construire au branchement de l'API

- `core/sync/outbox.ts` : file persistante + exécuteur (reprise, backoff exponentiel, ordre par entité).
- `core/sync/connectivity.ts` : état réseau fiable (événements + sonde légère), exposé à l'indicateur d'état.
- Contrat d'API : `Idempotency-Key`, `If-Match`/version, réponse de synchronisation incrémentale (`since`).
- Réconciliation : écran des éléments en échec / en conflit.
- Tests : coupure en plein envoi, double envoi, ordre des opérations, retour réseau après plusieurs heures.
