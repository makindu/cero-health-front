# Phase 9 — Visites (tour de salle) et consommations des patients hospitalisés

Mode local (IndexedDB, comme les autres modules). L'API correspondante existe déjà (CERO HEALTH, Lot 10) : le branchement
consiste à remplacer `visit-service.ts` par un client HTTP qui expose la **même interface** (`visits.ledger`, `recordVisit`,
`reverse`, `bill`, `autoBill`).

## Parcours

1. **Fiche d'admission → « Visites et consommations » → Nouvelle visite** : type (tour de salle / soins) + lignes (produit ou
   prestation, quantité). Aucun prix n'est saisi ; la saisie ne facture rien et ne sort rien du stock.
2. **Erreur de saisie** : bouton *Contre-passer* (motif obligatoire, quantité partielle possible). La ligne d'origine reste visible.
   Impossible sur du déjà facturé : annuler d'abord la facture (la consommation redevient « à facturer »).
3. **Facturation automatique** : à la *demande de sortie* puis à la *sortie effective*. Les consommations nettes sont regroupées par
   prestation en une facture ; les produits sortent du stock (premier périmé, premier sorti), une seule fois par consommation.
4. **Échec de la facturation automatique** (ex. stock insuffisant) : ni la demande de sortie ni la sortie ne sont bloquées ; les lignes
   restent « à facturer » et le bouton *Facturer maintenant* permet le rattrapage.
5. **Réduction** (bouton *Facturer maintenant*) : permission `health.billing.discount`, motif obligatoire, plafond 50 % (configurable),
   appliquée au prix unitaire du tarif privé (demi vers le haut).
6. **Sortie** : la facture des consommations s'ajoute au compte hospitalier ; si elle crée un solde dû, la sortie est refusée MAIS la
   facture reste au compte (paiement, crédit autorisé ou exception motivée comme pour les jours de chambre).

## Permissions (mode local)

| Code | Rôles de démonstration |
|---|---|
| `health.visits.view` | médecin, infirmier, responsable hospitalisation |
| `health.visits.record` | médecin, infirmier, responsable hospitalisation |
| `health.consumptions.reverse` | médecin, infirmier, responsable hospitalisation |
| `health.billing.discount` | responsable hospitalisation |
| facturation manuelle | `health.discharges.validate` (responsable hospitalisation) |

Correspondance API : `health.visits.view` ↔ `health.visits.read`.

## Données locales (ajout seul)

`health-hospital-visits`, `health-hospital-consumptions` (consommations ET contre-écritures), `health-hospital-consumption-billings`.
Aucune donnée de démonstration. Le stock et les factures sont ceux des modules pharmacie et finance.

## Correspondance avec l'API

| Écran / action | Route API |
|---|---|
| Liste des visites | `GET /api/health/v1/admissions/{id}/visits` |
| Nouvelle visite | `POST /api/health/v1/admissions/{id}/visits` `{visit_type, lines:[{catalog_item_id, quantity}]}` |
| Registre des consommations | `GET /api/health/v1/admissions/{id}/consumptions` |
| Contre-passer | `POST /api/health/v1/admissions/{id}/consumptions/{cid}/reverse` `{reason, quantity?}` |
| Facturer (manuel, réduction) | `POST /api/health/v1/admissions/{id}/actions/bill-consumptions` `{discount_bp?, discount_reason?}` |
| Facturation automatique | effet de `actions/request-discharge` et `actions/discharge` ; la réponse porte `meta.consumptions` |

Codes d'erreur API ↔ clés `business.visit.*` : `health.visit.caregiver_required`, `…admission_not_active` (notActive),
`health.consumption.already_billed`, `already_reversed`, `over_reversal`, `reason_required`, `discount_forbidden`, `discount_too_high`,
`discount_reason_required`, `health.billing.nothing_to_bill`, `health.consumption.insufficient_stock`, `health.admission.has_consumptions`.

## Limites assumées

- Le stock sort à la facturation ; une contre-écriture ne le remet pas en rayon (ajustement d'inventaire par le pharmacien).
- La réduction s'applique au tarif privé : une tarification négociée par contrat reste prioritaire (mode local).
- L'estimation « à facturer » est au tarif privé, avant couverture.
- Pas de saisie de signes vitaux/soins cliniques ici : seulement ce qui est consommé et facturable.

## Tests

`visit-rules.test.ts` (règles pures) et `visit-service.test.ts` (base en mémoire : saisie, contre-écritures, stock FEFO, réduction,
facturation automatique à la demande de sortie et à la sortie, échec non bloquant, annulation d'admission).

## Volet clinique de la visite (4 étapes)

Une visite enregistre aussi le déroulé clinique, dans l'ordre où le médecin le conduit :

1. **Plaintes du malade** — « aucune plainte aujourd'hui » ou texte (nouveaux symptômes, évolution). Tout soignant autorisé à enregistrer une visite.
2. **Examen / observations** — évolution par rapport à l'examen précédent (amélioration, stable, aggravation, éléments nouveaux) + constats. Droit `health.visits.clinical`.
3. **Conclusion = diagnostic** — pas de diagnostic sans examen. Droit `health.visits.clinical`.
4. **Plan** — pas de plan sans diagnostic. Décision de traitement (maintenir / modifier-ajouter / arrêter), refaire des examens de laboratoire, envisager la sortie, précisions. Au moins une décision.

Chaque étape est facultative mais s'enchaîne ; le volet est écrit une seule fois avec la visite (ajout seul : une correction = nouvelle visite). Aucun texte clinique n'est placé dans le journal d'audit.

**Texte enrichi** : plaintes, observations de l’examen et précisions du plan utilisent l’éditeur du module Consultations (gras, listes, tableaux). Le contenu est stocké en document JSON filtré par liste blanche (jamais du HTML) et affiché via `renderDocToHtml` (texte échappé). Les anciennes saisies en texte simple restent lisibles.

**Examens et ordonnances** : depuis une visite de l'historique clinique, « Demander des examens » et « Prescrire » ouvrent les dialogues des modules Laboratoire et Prescriptions, avec la visite comme référence (`consultationId` = identifiant de la visite). La visite affiche ensuite les numéros des demandes et ordonnances rattachées. Aucune donnée n'est dupliquée. La **sortie** reste une demande distincte (section dédiée) : le plan l'enregistre comme intention, il ne sort pas le patient.

Correspondance API (à venir) : `clinical` dans `POST admissions/{admission}/visits`, permission `health.visits.clinical`.
