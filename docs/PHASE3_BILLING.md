# Phase 3 — Tarification, facturation, caisse, assurances (mode local)

> Tout est **local à l'appareil** (IndexedDB). Rien n'est envoyé à CERO ID CORE, CERO UZISHA ou à un serveur.
> Données fictives marquées « (démo) ». Aucun organisme, tarif ou contrat réel.

## Couches
| Couche | Fichiers | Rôle |
|---|---|---|
| Argent | `core/money` | Entiers en unités mineures, points de base, arrondi « moitié vers le haut », répartition sans perte |
| Tarification (pure) | `core/pricing` | Moteur : droits à la date, couverture principale/complémentaire, tarif négocié, franchise, plafonds, quotas, abonnement |
| Facturation (pure) | `core/billing/invoice.ts` | Facture, grand livre, soldes, statut dérivé, paiement/contrepassation/remboursement/annulation/crédit/règlement/rejet |
| Validité des frais (pure) | `core/billing/validity.ts` | Mois calendaires, fin de mois, non rétroactif, exemption tracée |
| Atomicité | `core/local/unit-of-work.ts` | Plusieurs collections + audit dans UNE transaction (tout ou rien) |
| Services | `modules/finance/finance-service.ts` | Opérations métier, permissions vérifiées **dans le service** |
| Écrans | `modules/billing`, `modules/cash`, `modules/insurance`, `modules/finance` | Facturation, caisse, assurances et tarifs, fiche patient |

## Règles appliquées (et testées)
- Montant de couverture = **taux × tarif négocié** (18 USD à 80 % → assureur 14,40 / patient 3,60). La somme des parts = le facturable, toujours.
- Une couverture **n'ouvre des droits qu'une fois validée** (validation tracée : qui, quand, note). Créée → « en attente » → aucun effet.
- Un abonné n'est **pas** couvert à 100 % d'office : seules gratuités, catégories incluses et réductions de son contrat.
- Complémentaire : seulement si le contrat principal l'autorise **et** que le complémentaire peut l'être ; sur le reste à charge dans le contrat.
- Facture : instantané figé des règles de chaque ligne (organisme, contrat, taux, tarif négocié, franchise, plafonds, justification). Changer un contrat ou un tarif ne modifie jamais une facture existante.
- Statut **dérivé du grand livre**, jamais saisi : en attente de paiement, partiellement payée, payée, crédit autorisé, annulée. « Payée » = part patient soldée **et** créances d'organismes réglées.
- Créance d'organisme ≠ recette de caisse : la caisse patient et les règlements d'organismes sont totalisés séparément.
- Pas de suppression : contrepassation (motif obligatoire, une seule fois), remboursement (≤ encaissé), annulation (refusée s'il existe un paiement ou un règlement), crédit autorisé (permission dédiée, motif).
- Anti double paiement : même identifiant de soumission = un seul paiement. Surpaiement refusé. Référence obligatoire hors espèces.
- Anti double facturation : une prestation d'origine (`module:ref`) ne se facture qu'une fois (sauf facture annulée).
- Frais de consultation : validité accordée quand la **part patient** de la facture contenant la consultation est soldée ; retirée (ligne marquée « annulée », jamais supprimée) si le paiement est contrepassé/remboursé ou la facture annulée. Nouvelle consultation refusée tant que valide (échéance incluse). Changement de durée **non rétroactif**. Exemption : permission `health.billing.exempt`, motif obligatoire, tracée.
- Plafonds, franchise, quotas, gratuités se cumulent par **épisode de soins** (identifiant d'épisode saisi à la facture).

## Permissions (ajoutées)
`billing.refund / cancel / reverse / credit / exempt / settle / configure`, `insurance.view / manage / validate / authorize`.
Réceptionniste : voir + gérer assurances. Caissier : encaisser, règlements d'organismes, valider les couvertures. Cadre de service : crédit autorisé. Administrateur : tout (remboursement, annulation, contrepassation, exemption, configuration).
Les refus sont émis par le **service** (pas seulement par le bouton masqué).

## Écrans
- **Facturation** : indicateurs, liste filtrable, nouvelle facture avec **aperçu du prix et justification**, détail (lignes, parts, organismes, grand livre, actions), impression facture A4 et reçu thermique 80 mm.
- **Caisse** : écritures du jour par caissier, totaux par mode, règlements d'organismes à part. **La clôture de caisse n'est pas implémentée** (dit sur l'écran).
- **Assurances et tarifs** : tableau de bord (assurés actifs, membres de mutuelle, abonnements, validations en attente, rejets, créances par organisme, consommé par couverture), onglets couvertures / organismes / contrats / abonnements / catalogue / validité des frais.
- **Fiche patient → Facturation** : validité des frais, couvertures, factures.

## Limites connues (honnêtes)
- Navigateur : non vérifié par moi. Les tests tournent dans un environnement de test minimal (mémoire), pas IndexedDB réel ni lancement du navigateur.
- Jour civil de l'établissement = jour civil **de l'appareil** (le fuseau de l'établissement viendra de CERO ID CORE).
- Les constantes de l'ordre de calcul dépendent des 12 scénarios du moteur ; les cas rares (devise différente par contrat, plusieurs abonnements) sont refusés ou ignorés explicitement plutôt que devinés.
- Une autorisation préalable accordée **après** la facture ne la modifie pas : annuler (si aucun paiement) puis refacturer.
- Pas encore de lien automatique consultation → facture, examens → caisse, pharmacie → facture (Phases 4-link, 5, 6) : la facture se crée depuis l'écran Facturation.
- Le tableau de bord général affiche encore un compteur de démonstration en mode démo ; en mode local il n'est pas relié au grand livre (Phase 9).
- Concurrence entre deux onglets : les écritures sont sérialisées dans la base, mais un écran ouvert peut afficher un état périmé jusqu'au rechargement.
- Swahili à relire par un locuteur natif.
