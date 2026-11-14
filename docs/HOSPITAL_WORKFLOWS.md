# Parcours hospitalier (cible du mode local)

Accueil → orientation/triage → [caisse : frais de consultation] → consultation → [examens : caisse → prélèvement → analyse →
validation → retour au dossier] → [ordonnance → pharmacie] → (hospitalisation : lit → suivi → compte → sortie) → caisse.

| Phase | Contenu | État |
|---|---|---|
| 1 | Audit, couche de données locale, argent, rôles, bandeau, sauvegarde | **Livrée (à valider navigateur)** |
| 2 | Patients, accueil, orientation, files par service, anti-doublon | **Livrée (à valider navigateur)** — voir PHASE2_RECEPTION.md |
| 3 | Tarification, factures, caisse, reçus, validité des frais de consultation, assurances/mutuelles/abonnements | À faire |
| 4 | Consultation médicale | Faite (à rebrancher sur le stockage local) |
| 5 | Prescription et laboratoire | À faire |
| 6 | Pharmacie (prescription ≠ dispensation ≠ administration) | À faire |
| 7 | Hospitalisation, chambres, lits | À faire |
| 8 | Compte hospitalier, paiements, sortie | À faire |
| 9 | Scénarios de bout en bout (5 parcours + 12 scénarios de couverture) | À faire |

Règles transverses : un cas urgent passe par le triage ; une prescription seule ne crée jamais de consommation facturable ;
le lit n'est libéré qu'après la sortie administrative puis passe en nettoyage ; aucune transaction n'est supprimée (contrepassation).

## Phase 3 — état
Livré (mode local) : moteur de tarification, factures avec instantané des règles, grand livre (paiement, contrepassation, remboursement, annulation, crédit, règlement et rejet d'organisme), validité des frais de consultation, assurances/mutuelles/abonnements, catalogue, écrans Facturation / Caisse / Assurances et tarifs, impression facture et reçu. Détails et limites : `docs/PHASE3_BILLING.md`.
À relier ensuite : consultation → frais, prescriptions d'examens → caisse (Phase 5), pharmacie → facture (Phase 6), séjour → compte hospitalier (Phases 7-8).
