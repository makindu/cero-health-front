# Phase 7 — Hospitalisation, chambres et lits (mode local)

> MODE LOCAL — données enregistrées uniquement sur cet appareil. Aucune synchronisation serveur.
> Chambres et lits fictifs ; aucune donnée clinique.

## Modèle
- **Chambre** (`Room`) : service, code, type (standard / privée), prestation « jour de chambre » du catalogue (`ROOM-STD` / `ROOM-PRI`) — facturée par le compte hospitalier (phase 8).
- **Lit** (`Bed`) : `free | occupied | cleaning | maintenance`, `admissionId` ssi occupé.
- **Admission** : patient, service, motif et médecin référent **saisis**, sortie prévue, **séjours successifs** (un par lit, avec motif de transfert), demande de sortie, annulation tracée.
- Amorçage fictif : 4 services × (1 chambre standard à 3 lits + 1 chambre privée à 1 lit) = 16 lits, **tous libres** (aucun lit « occupé » sans admission réelle).

## Invariant « zéro double occupation »
Un lit est occupé ⇔ exactement une admission active y a son séjour courant ; une admission active occupe exactement un lit ; un patient a au plus une admission active. L'admission et l'occupation du lit s'écrivent dans **la même transaction** ; les unités de travail sont sérialisées, donc deux admissions simultanées sur le même lit (ou deux admissions du même patient) : **une seule réussit** (testé avec `Promise.allSettled`). `findViolations` vérifie l'invariant et est appelé après chaque scénario de test.

## Règles
- Admission : lit **libre** uniquement (pas occupé, en nettoyage ou en maintenance) ; motif et médecin référent obligatoires ; sortie prévue non passée ; patient existant et non fusionné.
- **Transfert** : motif obligatoire, nouveau lit libre, l'ancien passe en **nettoyage** (jamais directement libre), historique des séjours conservé.
- **Annulation** (erreur de saisie) : motif obligatoire, séjour fermé, lit en nettoyage, patient de nouveau admissible.
- Lit : nettoyage → libre ; libre/nettoyage → maintenance (motif obligatoire) → libre ; un lit occupé ne se modifie pas à la main.
- **Demande de sortie** : le lit reste occupé ; révocable. La **sortie effective** (bilan financier, libération du lit) est faite en phase 8 avec le compte hospitalier.
- Permissions dans le service : admission/annulation = `admissions.create` ; transfert/état des lits = `beds.assign` ; demande de sortie = `discharges.validate`.
- Isolation par établissement.

## Interface
`/hospitalization` : plan des lits (compteurs, par service et chambre, icône + libellé), onglet admissions (recherche, filtre, pagination), détail (séjours, actions). Depuis une consultation : bouton **Hospitaliser** (patient et consultation préremplis). Dossier patient : historique des hospitalisations.
Fichiers : `hospital-rules.ts`, `hospital-service.ts`, `collections.ts`, `hospital.ts`, `use-hospital.ts`, `BedBoard`, `AdmitDialog`, `AdmissionDetail`, `StatusBadges`, `HospitalizationPage`, `PatientAdmissions`. Tests : `hospital-service.test.ts` (16).

## Limites assumées
> Mise à jour Phase 8 : le compte hospitalier et la sortie effective sont maintenant implémentés (voir PHASE8_ACCOUNT.md).

- Pas de sortie effective ni de facturation des jours de chambre (phase 8).
- Pas de contrôle de mixité/âge par service (pédiatrie, maternité) : à définir avec l'hôpital.
- Une chambre = des lits indépendants (pas de réservation de lit à l'avance, pas de file d'attente d'admission).
- Les observations/soins au lit relèvent des soins infirmiers (non implémentés ici).
- Anciens fichiers `hospitalization/data.ts` et `BedMap.tsx` conservés (démo, tableau de bord) mais plus utilisés par la page.
- Le plan se rafraîchit à chaque action ; une autre fenêtre ouverte peut montrer un état périmé jusqu'au prochain rechargement (un refus recharge le plan).
