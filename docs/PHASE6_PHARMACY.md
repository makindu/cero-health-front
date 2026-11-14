# Phase 6 — Pharmacie : prescrire ≠ dispenser ≠ administrer (mode local)

> MODE LOCAL — données enregistrées uniquement sur cet appareil. Aucune synchronisation serveur.
> Stock et lots de démonstration fictifs.

## Les trois actes sont séparés
| Acte | Où | Trace |
|---|---|---|
| Prescrire | Médecin, `/prescriptions` | prescripteur, date, lignes saisies par lui |
| **Dispenser** | Pharmacien, `/pharmacy` | dispensation, lots utilisés, mouvements de stock, facture |
| Administrer | Soins infirmiers | **hors de cette phase** (non implémenté, non simulé) |

## Flux
1. Une prescription **validée** entre dans « À dispenser » avec le reste à dispenser par ligne.
2. **Préparer** : le pharmacien choisit *lui-même* le produit du stock pour chaque ligne (aucune correspondance automatique libellé → produit) et la quantité. La dispensation (`prepared`) **et sa facture** sont créées dans la même transaction. Le stock ne bouge pas.
3. La caisse encaisse (`/billing`).
4. **Remettre** : paiement vérifié (soldé, ou crédit autorisé, ou exception tracée), puis dans UNE transaction : sortie des lots en **FEFO** (premier périmé, premier sorti), mouvements de stock, dispensation `dispensed`, et prescription `dispensed` quand toutes les lignes sont remises.

## Règles
- Les **lots périmés ne sont jamais dispensés** (un lot expirant aujourd'hui reste utilisable, pas demain). Un lot périmé de démonstration le montre.
- Quantité dispensée + préparée ≤ quantité prescrite, par ligne (dispensation partielle possible, reste affiché).
- Stock insuffisant, produit hors catalogue pharmacie ou inactif : refus, rien n'est enregistré (ni dispensation ni facture).
- **Exception de paiement** : permission `health.pharmacy.exception` (administrateur), motif obligatoire, tracée ; la dette reste en caisse.
- **Annulation** avant remise seulement ; facture impayée annulée atomiquement, sinon « remboursement à faire en caisse ». Après remise : refusée.
- Une prescription ayant une dispensation (non annulée) ne peut plus être annulée.
- **Stock** : réception de lot (n° de lot unique par produit, quantité entière > 0, péremption non passée), ajustement avec motif (jamais négatif). Chaque entrée/sortie écrit un mouvement ; invariant testé : somme des mouvements d'un lot = sa quantité.
- Facturation : sources `pharmacy:<dispensation>:<ligne>` (anti double facturation) ; tarification complète (couverture, exclusions du contrat, abonnement).
- Isolation par établissement (stock, lots, dispensations).

## Fichiers
`pharmacy-rules.ts` (pur), `pharmacy-service.ts` (unité de travail, permissions dans le service), `collections.ts` (lots/mouvements amorcés, dispensations), `pharmacy.ts`, `use-pharmacy.ts`, `PharmacyPage`, `PrepareDialog`, `DispensationDetail`, `StockTab`, `StatusBadges`. Tests : `pharmacy-service.test.ts` (14).

## Limites assumées
- `/inventory` (stock général, UZISHA) reste sur la démonstration : le stock **pharmacie** local est distinct et n'est pas encore relié à CERO UZISHA (contrat à définir).
- Retour de produits / reprise de stock après remise : non implémenté.
- Seuils minimaux, alertes de rupture, prix d'achat, fournisseurs : non implémentés.
- Pas de contrôle clinique (interactions, allergies, doses) : hors périmètre, aucune aide à la décision.
- Les produits prescrits sont du texte libre ; le rapprochement avec un produit du catalogue est un acte du pharmacien.
- Catalogue pharmacie : 2 produits d'amorçage (antalgique, antibiotique) ; en ajouter via `/insurance` → Catalogue (catégorie pharmacie), puis réceptionner un lot.
- Les anciens fichiers `prescriptions/PrescriptionDetail.tsx`, `columns.tsx`, `data.ts` ne servent plus qu'au tableau de bord (comptage de démonstration).
