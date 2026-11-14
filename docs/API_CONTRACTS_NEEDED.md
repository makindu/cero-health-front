# Contrats d'API HEALTH nécessaires

Aucun endpoint HEALTH n'existe à ce jour. Le fichier `src/core/api/contracts/health-endpoints.ts` décrit le
**contrat cible** (cahier des charges fonctionnel §11.2). Ces routes ne sont **pas** déclarées existantes.

Convention : enveloppe `{ success, message, data, meta }` ; erreurs `{ success:false, message, errors, data }` ;
pagination `meta: { page, perPage, total, lastPage }` ; en-tête `x-request-id` renvoyé pour le support.

| Domaine | Endpoints cibles | Phase |
|---|---|---|
| Tableau de bord | `GET /health/reports/dashboard` | 3 |
| Patients | `GET/POST /health/patients`, `GET/PUT /health/patients/{id}` | 3 |
| Rendez-vous | `GET/POST /health/appointments`, `PATCH …/{id}/status` | 4 |
| Consultations | `/health/encounters`, `…/consultations`, `…/diagnoses`, `…/prescriptions` | 4 |
| Prescriptions | `POST /health/prescriptions/{id}/dispense` | 5 |
| Laboratoire | `/health/lab-orders`, `…/results`, `/health/lab-results/{id}/validate` | 5 |
| Hospitalisation | `/health/admissions`, `…/bed-movements`, `…/discharge` | 5 |
| Facturation | `/health/billing/invoices`, `/health/invoices/{id}/payments` | 5 |
| Rapports | `/health/reports/stock`, `/health/reports/finance` | 6 |

Règles : chaque endpoint vérifie permission **et** appartenance à l'établissement côté serveur ; les actions
sensibles (consultation d'un dossier, validation, annulation) sont journalisées ; le mécanisme de transmission de
l'établissement actif reste à définir (voir `CERO_ID_CORE_QUESTIONS.md` §5).

Tant qu'un endpoint n'existe pas, l'écran correspondant affiche un état « en préparation » ou des données
**fictives clairement étiquetées** ; aucune opération simulée n'est présentée comme réelle.


## Ajouts de la phase 3 (contrats PROPOSÉS, à valider avec l'équipe backend)

Les écrans de la phase 3 consomment les routes ci-dessous via `createResourceService` (voir
`src/core/api/contracts/health-endpoints.ts`, bloc « AJOUTS PHASE 3 »). Aucune n'est déclarée existante : tant
qu'elles manquent, l'écran affiche « Service non configuré » (ou des données fictives étiquetées en mode aperçu).

| Domaine | Lecture | Commandes (POST `{collection}/{id}/{action}`) |
|---|---|---|
| Dossiers médicaux | `GET /health/medical-records` | accès journalisé côté serveur |
| Consultations | `GET /health/consultations` | `close` |
| Soins infirmiers | `GET /health/triage`, `POST …/{id}/vitals` | `start`, `complete` |
| Lits | `GET /health/beds` | `assign`, `mark-ready` |
| Prescriptions | `GET /health/prescriptions` | `dispense`, `cancel` |
| Laboratoire | `GET /health/lab-orders` | `collect`, `validate` |
| Caisse | `GET/POST /health/cash/transactions` | `close` |
| Audit | `GET /health/audit` (lecture seule, non modifiable) | — |
| Administration | `/health/administration/services`, `/facility`, `/users` (ID CORE) | — |
| Rapports | `POST /health/reports/run` | — |

Les comptes utilisateurs, rôles et mots de passe restent gérés par CERO ID CORE (voir `CERO_ID_CORE_QUESTIONS.md`).
La matrice de rôles affichée dans l'administration est une **proposition illustrative**, non appliquée.

## Ajouts « Patients » et « Rendez-vous / Accueil » (contrats PROPOSÉS)

Aucune de ces routes n'est déclarée existante ; les écrans passent par `createResourceService` et affichent
« Service non configuré » (ou des données fictives étiquetées en mode aperçu) tant qu'elles manquent.

| Besoin | Contrat cible proposé | Remarque serveur |
|---|---|---|
| Filtre par date d'inscription | `GET /health/patients?registeredFrom=AAAA-MM-JJ&registeredTo=AAAA-MM-JJ` | bornes incluses |
| Recherche de doublons | `GET /health/patients?search=<téléphone ou n° de dossier>` | la recherche doit couvrir `phone` et `fileNumber` ; la comparaison exacte est faite côté interface |
| Modification | `PUT /health/patients/{id}` | permission `health.patients.update` |
| Fusion | `POST /health/patients/{conservé}/merge { duplicateIds, reason }` | permission `health.patients.merge`, journalisée |
| Export Excel / PDF | aucun endpoint : fichier généré dans le navigateur depuis `GET /health/patients` (filtres courants, plafond 5 000 lignes) | la permission `health.patients.export` doit être revérifiée ; la traçabilité de l'export est à prévoir côté API |
| Calendrier | `GET /health/appointments?from=AAAA-MM-JJ&to=AAAA-MM-JJ&per_page=500` | jours dans le fuseau de l'établissement |
| Créneau d'un praticien | `GET /health/appointments?from&to&practitioner=` | confort d'interface uniquement |
| Création / report | `POST /health/appointments`, `POST /health/appointments/{id}/reschedule { startsAt, reason, note }` | **doit répondre 409 si le praticien a déjà un rendez-vous qui chevauche** (l'interface affiche le conflit) |
| Annulation | `POST /health/appointments/{id}/cancel { reason, note }` | motif obligatoire |
| Accueil | `POST /health/appointments/{id}/check-in`, `…/wait`, `…/start`, `…/complete`, `…/no-show`, `…/confirm` | permissions `appointments.check-in`, `.update`, `.cancel` |
| Historique | champ `history[] { type, at, by, reason?, from? }` dans le rendez-vous | produit par le serveur (utilisateur authentifié, jamais saisi par le navigateur) |
| Praticiens | à définir : l'interface déduit pour l'instant les praticiens des rendez-vous chargés | liste à fournir par CERO ID CORE (voir `CERO_ID_CORE_QUESTIONS.md`) |

Nouveaux statuts de rendez-vous : `scheduled, confirmed, arrived, waiting, inProgress, done, cancelled, noShow`.

Compléments : modification d'un rendez-vous `PUT /health/appointments/{id}` (409 si chevauchement, historique `updated` produit par le serveur) ;
historiques d'un patient via les listes existantes filtrées `?patientId=` sur `/health/consultations`, `/health/prescriptions`, `/health/admissions` ;
le numéro de dossier doit être unique par établissement (3 à 30 caractères : lettres, chiffres, `. _ / -`) et le serveur doit refuser un doublon exact.


## Accueil sans rendez-vous (proposition)
- `POST /health/triage` avec `{ patient, reason, priority, source: "walkIn" }` : enregistre l'arrivée et la place en file de triage.
- `POST /health/appointments` avec `walkIn: true` et `service` : crée une prise en charge immédiate dans un service.
- Règle attendue côté serveur : une priorité immediate / veryUrgent / urgent doit passer par le triage (le frontend le contrôle seulement par confort).

## Consultation médicale — contrats proposés (aucun n'existe aujourd'hui)

Le frontend n'appelle ces routes que lorsque l'API HEALTH est configurée ; en démonstration rien n'est envoyé ni présenté comme enregistré.
Les routes déjà déclarées dans `health-endpoints.ts` (`/health/consultations`, `/health/consultations/{id}/diagnoses`, `/health/consultations/{id}/prescriptions`) sont conservées.

| Besoin | Route proposée | Remarques |
|---|---|---|
| Créer une consultation | `POST /health/consultations` | `patientId`, `service`, `practitionerId`, `appointmentId` ou `origin = walkIn`, `triageEntryId` facultatif |
| Lire / enregistrer le dossier clinique | `GET`/`PUT /health/consultation-records/{consultationId}` (`POST` si inexistant) | Corps `{ draft }` : voir `ConsultationDraft` (`consultations/clinical/model.ts`). Contenus riches = JSON Tiptap, jamais du HTML. Le serveur doit **refuser** toute écriture si la consultation est signée/clôturée (sauf addendum) et **attribuer** auteur et date. |
| Contexte clinique du patient | `GET /health/patients/{id}/clinical-context` | Antécédents en vigueur, allergies actives, dernières constantes |
| Antécédents (niveau patient) | `GET /health/patients/{id}/antecedents`, `POST` (nouvelle entrée ou révision avec `supersedes`) | Aucune suppression ni écrasement : chaque révision crée une entrée ; origine `declared`/`observed` ; auteur, date, source |
| Vérification des antécédents | `POST /health/consultations/{id}/antecedent-verifications` | Date, auteur, `unchanged`, `changedIds` |
| Constantes du triage | `GET /health/triage/{entryId}/vitals` | Date, heure, auteur de chaque relevé ; le frontend n'invente aucune valeur |
| Diagnostics | `GET`/`POST /health/consultations/{id}/diagnoses`, `POST …/diagnoses/{diagId}/changes` | Historique complet des changements de statut/type ; jamais de suppression ; référentiel CIM-10 contrôlé : `GET /health/reference/icd10?search=` |
| Demandes d'examens / prescriptions | `POST /health/lab-orders`, `POST /health/prescriptions` avec `consultationId` | Créés dans leurs modules, liés à la consultation (pas de doublon) |
| Statuts et signature | `POST /health/consultations/{id}/{start,await-results,submit,sign,close}` | `sign` exige la permission `health.consultations.sign` et rejette si diagnostic principal, motif ou conclusion manquent |
| Addenda | `POST /health/consultations/{id}/addenda` | Autorisé uniquement après signature ; texte, auteur, date |
| Historique des modifications | `GET /health/consultations/{id}/revisions` | Produit par le serveur (source de vérité) |
| Modèles de rédaction | `GET`/`POST`/`PUT /health/consultation-templates` | `scope = personal | facility`, `target`, `content` (JSON), favoris ; les modèles communs de l'application sont dans le code |

Règles côté serveur attendues : séparation des données administratives et médicales (permission `medical-records.view` pour lire), traçabilité des lectures sensibles, assainissement du contenu riche à l'enregistrement (le frontend le fait aussi à l'affichage).

## Mode local → API (note d'architecture, Phase 1)
Les `Repository<T>` locaux définissent le contrat cible : `list`, `get`, `insert` (409 si l'identifiant existe), `update` avec
version attendue (409 en cas de conflit), journal d'audit (acteur, établissement, avant/après, motif). Une implémentation API
remplacera la fabrique de repositories sans changer les pages. Les contrats détaillés (factures avec instantané des règles,
paiements, contrepassations, créances assureur, couvertures, abonnements, séjours/lits) seront ajoutés phase par phase.

## Phase 2 — accueil et patients (règles à reproduire côté API)
- `POST /health/patients` : 409 si le numéro de dossier normalisé existe (établissement) ; numéro généré côté serveur si absent ; date de naissance non future.
- `POST /health/patients/{id}/merge` : motif obligatoire ; doublons désactivés (`mergedInto`), références (rendez-vous, triage, factures…) rattachées au dossier conservé ; jamais de suppression.
- `POST /health/appointments` : 409 si chevauchement praticien ou patient ; `walkIn=true` ⇒ statut `arrived`, refusé (422) si urgence ≥ « urgente » sans triage.
- `POST /health/appointments/{id}/{confirm|check-in|wait|start|complete|no-show|cancel|reschedule}` : transitions autorisées uniquement selon le tableau de PHASE2_RECEPTION.md ; motif requis pour cancel/reschedule ; journal (acteur, date, motif, ancien créneau).
- `POST /health/triage/{id}/{start-triage|send-to-care|transfer|discharge}` ; `POST /health/triage/{id}/vitals` ; `GET /health/triage/{id}/vitals` (lecture non encore définie).

## Phase 3 — finance (propositions à valider avec le backend)
- Catalogue `GET/PUT /health/catalog-items` (tarif privé, catégorie, actif). Organismes `/health/organizations`, contrats `/health/contracts` (règles : prestation > catégorie > général ; taux en points de base sur tarif négocié ; franchise, plafonds, quotas, autorisation préalable ; drapeaux de coordination).
- Couvertures `/health/patient-coverages` : création **toujours « pending »** ; `POST …/{id}/validate|reject|suspend` (acteur, date, note → historique). Autorisations préalables `POST /health/authorizations` (référence de l'organisme obligatoire).
- Abonnements `/health/subscriptions`. Validité des frais : `GET/POST /health/consultation-fee-config` (historique, date d'effet ≥ aujourd'hui), `GET /health/consultation-fees?patientId=`, `POST …/exempt` (motif obligatoire, permission dédiée).
- **Tarification côté serveur** : `POST /health/pricing/preview` renvoie le même détail que le moteur local (lignes, parts, justification codée, instantané des règles). Le serveur doit refaire le calcul à la création de la facture (le client ne fait pas foi).
- Factures `POST /health/billing/invoices` (lignes + `source{module,ref}` unique, `episodeId`) ; grand livre `POST /health/billing/invoices/{id}/{payments|reversals|refunds|cancel|credit|settlements|rejections}` ; **clé d'idempotence obligatoire** sur les paiements ; montants en unités mineures (entiers) + devise ; le statut est **calculé** par le serveur.
- Numérotation `FAC-AAAA-NNNNNN` continue par établissement/année, attribuée côté serveur.
- Écritures atomiques facture + grand livre + validité des frais (transaction).

## Phase 5 — laboratoire et prescriptions (propositions)
- `POST /health/laboratory/orders` crée **la demande et la facture dans la même transaction** (lignes = examens du catalogue, `source{module:'laboratory', ref:'<orderId>:<code>'}` unique, `episodeId` = consultation). Réponse : demande + facture.
- `POST …/orders/{id}/{collect|start|results|reopen|validate|amend|cancel}` ; `collect` refusé (409) tant que la part patient n'est pas soldée, sauf crédit autorisé ou exception (`POST …/payment-exception`, permission dédiée, motif obligatoire). `amend` conserve l'historique. `cancel` : avant prélèvement seulement ; annule la facture non payée, sinon marque « remboursement en attente ».
- Valeurs de résultat : texte libre saisi par le laborantin (valeur, unité, plage de référence, interprétation, commentaire) — le serveur ne les génère jamais.
- `POST /health/prescriptions` (lignes : produit, quantité entière > 0, posologie, fréquence, durée, instructions) ; `POST …/{id}/{validate|cancel}` (motif pour cancel). Dispensation = ressource distincte (Phase 6).

## Phase 6 — pharmacie (propositions)
- `POST /health/pharmacy/dispensations` : crée la dispensation **et la facture** (source `pharmacy:<id>:<ligne>`) dans la même transaction ; refuse (422/409) hors prescription validée, quantité > reste, produit hors catalogue pharmacie, stock utilisable insuffisant.
- `POST …/dispensations/{id}/dispense` : vérifie le paiement (ou crédit/exception), attribue les lots **côté serveur** (FEFO, hors périmés), écrit les mouvements, passe la prescription à `dispensed` — atomique. `POST …/{id}/cancel` avant remise (motif). `POST …/{id}/payment-exception` (permission dédiée, motif).
- Stock : `GET /health/pharmacy/stock`, `POST …/lots` (réception), `POST …/lots/{id}/adjust` (motif, jamais négatif), `GET …/movements`. À aligner avec CERO UZISHA (source de vérité du stock) : routes inconnues à ce jour.

## Phase 7 — hospitalisation (propositions)
- `GET /health/rooms`, `GET /health/beds` (état, `admissionId`). `POST /health/admissions` (patientId, bedId, motif, médecin référent, sortie prévue, consultationId) : **transaction unique** admission + occupation du lit ; 409 si lit non libre ou patient déjà hospitalisé (verrou/contrainte d'unicité côté base : un `bedId` actif par admission, un `patientId` actif).
- `POST …/admissions/{id}/transfer` (bedId, motif), `…/cancel` (motif), `…/discharge-request` et `…/discharge-request/revoke`. `POST /health/beds/{id}/{ready|maintenance}` (motif pour maintenance). Libération d'un lit toujours via « nettoyage ».

## Phase 8 — compte hospitalier (propositions)
- `GET /health/admissions/{id}/account` : factures, totaux (facturé, part patient, encaissé, dû patient, dû organismes), jours à facturer.
- `POST …/admissions/{id}/room-days` : crée la facture des jours manquants (source `room:<admission>:<jour>`, unique côté base) et marque les jours — transaction unique, idempotent.
- `POST …/admissions/{id}/discharge` (issue, note, `exceptionReason?`) : vérifie jours facturés + solde, ferme le séjour et met le lit en nettoyage — transaction unique ; 409 `room_days_unbilled` / `balance_due`; exception réservée à une permission dédiée, auditée côté serveur. Calendrier civil : fuseau de l'établissement (CERO ID CORE).
