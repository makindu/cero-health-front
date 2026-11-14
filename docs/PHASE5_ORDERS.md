# Phase 5 — Prescriptions et laboratoire (mode local)

> MODE LOCAL — données enregistrées uniquement sur cet appareil. Aucune synchronisation serveur.
> Données de démonstration fictives. Aucune valeur médicale n'est jamais proposée ni calculée par l'application.

## Principe
Une demande d'examens **crée sa facture dans la même transaction** : les examens apparaissent donc d'eux-mêmes à la caisse (`/billing`), avec la tarification complète (tarif négocié, couverture, abonnement). Il n'existe jamais de demande sans facture, ni de facture sans demande (test : « aucune demande orpheline »).

## Laboratoire (`modules/laboratory`)
| Fichier | Rôle |
|---|---|
| `lab-rules.ts` | Règles pures : statuts, accès au prélèvement, saisie, validation, rectification, annulation |
| `lab-service.ts` | Unité de travail atomique (collection `health-lab-orders-local`), permissions vérifiées dans le service |
| `lab.ts`, `use-lab.ts` | Instance locale et hooks TanStack Query (invalide aussi les écrans financiers) |
| `LaboratoryPage`, `LabOrderDetail`, `NewLabOrderDialog`, `LabStatusBadge` | Interface |

Flux : `requested → collected → inProgress → resultEntered → validated` ; `cancelled` possible **avant le prélèvement uniquement**.

Règles :
- **Barrière de paiement** : le prélèvement exige part patient soldée (ou nulle), **ou** crédit autorisé en caisse, **ou** exception tracée. Une facture annulée ne débloque jamais.
- **Exception** : permission dédiée `health.laboratory.exception` (administrateur uniquement dans la démo), motif obligatoire, acteur et date tracés ; la dette reste ouverte en caisse.
- **Résultats** : valeur, unité, valeurs de référence, interprétation et commentaire sont **saisis par le laborantin**. Rien n'est prérempli. Un enregistrement partiel reste « en analyse » ; il passe à « résultat saisi » quand chaque examen a une valeur.
- **Validation** : traçée (qui, quand). Saisie et validation sont tracées séparément.
- **Rectification** d'un résultat validé : motif obligatoire ; l'ancien résultat est **conservé** dans l'historique.
- **Annulation** : motif obligatoire ; facture non payée annulée dans la même transaction ; si un paiement existe, la demande est annulée mais le remboursement reste **à faire en caisse** (indiqué sur la demande).
- Les examens viennent du catalogue financier (catégorie laboratoire, actifs). Sources de facturation `laboratory:<demande>:<code>` : anti double facturation.

## Prescriptions (`modules/prescriptions`)
`rx-rules.ts`, `rx-service.ts` (collection `health-prescriptions-local`), `rx.ts`, `use-rx.ts`, `PrescriptionsPage`, `NewRxDialog`, `RxDetail`, `PatientPrescriptions`.
- Lignes : produit, quantité entière > 0, **posologie et fréquence obligatoires**, durée et instructions optionnelles — toutes saisies par le prescripteur. Aucune suggestion, aucun contrôle d'interaction ni de dose (pas d'aide à la décision clinique).
- Statuts : `toValidate → validated`, `cancelled` (motif obligatoire).
- **Prescrire n'est pas dispenser** : aucune dispensation, aucun stock, aucune facture pharmacie ici (Phase 6). Le bouton n'existe pas et l'écran le dit.

## Depuis la consultation
Onglet « Plan » : boutons **Demander des examens** et **Prescrire** (patient et consultation préremplis), visibles si la consultation n'est pas verrouillée et si la permission existe.

## Limites assumées
- La pharmacie (`/pharmacy`) lit encore l'ancienne collection de démonstration `health-prescriptions` : elle **ne voit pas** les prescriptions créées en Phase 5. Migration en Phase 6 (dispensation = transaction prescription + stock + facture).
- Le catalogue financier passe à `health-catalog-items-v2` pour amorcer 3 examens supplémentaires (créatininémie, urine, grossesse) : les modifications faites au catalogue de démonstration avant cette version ne sont pas reprises (les factures existantes gardent leur instantané).
- Quatre-yeux non imposé : le même utilisateur peut saisir et valider (le rôle laborantin a la validation) ; les deux acteurs sont tracés.
- Pas de valeurs de référence automatiques par âge/sexe, pas de calcul de délai de rendu.
- Les dialogues de la consultation créent la demande mais ne la rattachent pas encore dans le dossier clinique (affichage dans l'historique du patient : à faire).
- Navigateur non encore vérifié par moi : checklist section 6 de `VALIDATION_FRONTEND.md`.
