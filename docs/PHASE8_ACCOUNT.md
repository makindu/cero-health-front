# Phase 8 — Compte hospitalier, paiements, sortie (mode local)

## Principe
Le compte d'une admission n'est pas une nouvelle structure financière : c'est la **vue** des factures du patient créées depuis l'admission (jours de chambre, laboratoire, pharmacie, consultations…) sur le grand livre existant. Les paiements se font dans la caisse/facturation habituelle ; le compte se rafraîchit (portée de cache `finance`).

## Jours de chambre
- Convention : le jour d'admission compte, le jour de sortie ne compte pas, minimum un jour. Séjour en cours : seuls les jours **écoulés** (jusqu'à hier) sont facturables ; pour la sortie : comme si le patient sortait aujourd'hui.
- Un jour est imputé à la chambre du dernier séjour dont le début est ≤ ce jour (le jour d'un transfert est facturé au **nouveau** lit).
- « Facturer les jours de chambre » crée **une facture** (une ligne par jour, article du tarif de la chambre via le moteur de prix, couverture/assurance appliquée normalement). Chaque jour est enregistré dans `billedDays` (jour → facture) et porte une source `room:<admission>:<jour>` : aucune double facturation, opération idempotente.
- Facture et marquage des jours sont atomiques. Une admission avec jours facturés ne peut plus être annulée (`hasBilledDays`).

## Sortie effective (atomique)
Conditions : admission active ; tous les jours de chambre (comme si sortie aujourd'hui) facturés ; solde **patient** nul (un crédit autorisé en caisse compte comme soldé ; une facture annulée ne débloque rien). La part due par les organismes **ne bloque pas** et reste une créance, jamais un encaissement.
Exception : permission `health.discharges.exception` (admin) + motif obligatoire ; tracée dans `admission.discharge.exception` et l'audit ; la dette reste ouverte en caisse.
Effets : séjour clos (issue : normale, transfert vers un autre établissement, contre avis, décès), lit → nettoyage.

## Fichiers
`account-service.ts` (+test), `AccountSection.tsx`, règles dans `hospital-rules.ts` (`billableDays`, `markDaysBilled`, `dischargeAdmission`), `finance-service.ts` (`inUnit.patientInvoices`).

## Limites
Convention de jour = jour civil de l'appareil ; pas de forfaits ni de supplément par acte infirmier ; l'administration des soins n'est pas implémentée ; le décès ne déclenche aucun document officiel ; pas de remboursement automatique si la facture de chambre est corrigée après paiement (contre-écriture manuelle en facturation).
