# Règles métier retenues

## Tarification (tarifs négociés + pourcentage)
1. Tarif privé de référence → 2. tarif négocié du contrat → 3. couverture % **calculée sur le tarif négocié** → 4. part patient →
5. franchise, ticket modérateur, plafonds, exclusions, quotas.
Exemple : privé 20, négocié 18, 80 % → assureur 14,40, patient 3,60.

## Ordre de calcul par ligne de facture
Droits valides à la date de la prestation → couverture principale → service/acte → tarif négocié → exclusions/franchise/plafond →
part principale → part complémentaire **seulement si autorisée par les deux contrats** → solde patient → créances et dû patient
enregistrés séparément. **Somme des parts ≤ montant facturable.**

## Couvertures
Plusieurs possibles, **une seule principale** par prise en charge. Aucune double couverture automatique sans règle explicite.
Une couverture n'est « confirmée » qu'après validation tracée.

## Abonnements
Indépendants des assurances. Contrôle de validité automatique ; avantages = prestation incluse, réduction ou quota. Un abonné n'est
**pas** couvert à 100 % par défaut.

## Comptabilité
Facturé ≠ encaissé ≠ pris en charge. Une **créance assureur n'est jamais un encaissement**. Facture validée = immuable
(instantané des règles) ; correction par annulation/contrepassation autorisée et tracée.

## Validité des frais de consultation
Configurable par établissement, en mois calendaires (règles de fin de mois), dates civiles de l'établissement, non rétroactive
lors d'un changement de configuration, historique des périodes, exemptions soumises à permission et tracées.

## Argent
Entiers en unités mineures, points de base, arrondi demi-haut déterministe, répartition par plus grand reste.

## Phase 5 — examens et prescriptions
- Toute demande d'examens est facturée à sa création (même transaction) : pas de demande sans facture.
- Prélèvement conditionné au paiement de la part patient (ou crédit autorisé, ou exception motivée, permissionnée et tracée) ; une facture annulée ne débloque jamais.
- Les résultats sont saisis par le laboratoire, jamais générés ; un résultat validé ne se modifie que par rectification motivée qui conserve l'ancien.
- Annulation d'un examen seulement avant prélèvement ; un paiement déjà encaissé reste à rembourser en caisse (jamais de remboursement silencieux).
- Prescrire ≠ dispenser ≠ administrer ; posologie et fréquence obligatoires, saisies par le prescripteur, aucune suggestion automatique.

## Phase 6 — dispensation et stock
- Dispenser n'est ni prescrire ni administrer. La remise exige un paiement soldé (ou crédit autorisé, ou exception permissionnée et tracée).
- La dispensation, sa facture, la sortie de stock et le passage de la prescription à « dispensée » sont atomiques.
- Sortie de stock FEFO ; jamais de lot périmé, jamais de stock négatif ; chaque variation est un mouvement tracé (somme des mouvements = quantité du lot).
- On ne dispense jamais plus que prescrit ; une prescription dispensée ou ayant une dispensation ne s'annule pas.

## Phase 7 — hospitalisation
- Un lit = un patient ; un patient = une admission active. Garanti par la transaction admission + occupation du lit, et vérifié par `findViolations`.
- Un lit libéré passe par le nettoyage ; seuls les lits libres sont admissibles.
- Tout transfert et toute annulation ont un motif et conservent l'historique des séjours.
- La sortie effective dépend du compte hospitalier (phase 8) ; la demande de sortie ne libère pas le lit.

## Phase 8 — compte hospitalier
- Jours de chambre : admission comptée, sortie non comptée, minimum un jour ; tarif via le moteur de prix ; jamais facturés deux fois.
- La sortie effective exige jours facturés et solde patient réglé (ou crédit autorisé, ou exception permissionnée + motif tracée). La part des organismes ne bloque pas.
- Une admission avec jours facturés ne s'annule pas ; un lit libéré passe par le nettoyage.

## Frais de consultation (précision)
- Le paiement d'une consultation générale (CONS-GEN) **ou spécialisée** (CONS-SPE) ouvre la période de validité. Non rétroactif : une facture déjà encaissée avant ce changement n'ouvre rien. Un refus précise « aucun paiement » ou « validité expirée ».
