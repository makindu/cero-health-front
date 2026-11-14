# Phase 2 — Patients, accueil et orientation (mode local)

Données persistantes dans IndexedDB (mode `VITE_LOCAL_MODE=true`). Les règles sont des fonctions pures testées
(`patients/local-rules.ts`, `appointments/local-rules.ts`, `nursing/local-rules.ts`) ; les services les appliquent et
vérifient les permissions (`assertPermission`) avant d'écrire, avec une entrée d'audit par écriture.

## Patients
- Création : nom (≥ 2 car.), sexe et date de naissance obligatoires (jamais de valeur par défaut inventée), date non future (jour civil local).
- Numéro de dossier : généré `DOS-LOC-AAAA-NNNN` (continu, jamais réutilisé) ou saisi ; **un numéro déjà attribué est refusé** (409), même écrit autrement (`dos-0001` = `DOS 0001`).
- Téléphone en doublon : avertissement existant, enregistrement possible (un foyer peut partager un numéro).
- Modification : un doublon hérité ne bloque pas la correction ; seul un *changement* de numéro est contrôlé.
- Fusion : motif obligatoire ; les doublons sont **désactivés et reliés** (`mergedInto`), jamais supprimés ; leurs rendez-vous et passages au triage sont rattachés au dossier conservé.
- Recherche d'un patient par les autres modules : identifiant, numéro de dossier ou nom exact. Plusieurs correspondances = refus, jamais de choix au hasard ; dossier inactif/fusionné = refus.

## Rendez-vous
Pas de chevauchement du praticien (409), pas de double rendez-vous du patient, pas avant aujourd'hui. Transitions contrôlées par `NEXT_ACTIONS` :
programmé → confirmé → arrivé → en attente → en consultation → terminé ; annulation/report avec motif ; absence. Arrivée enregistrée uniquement le jour du rendez-vous.
Un patient déjà dans la file (arrivé, attente, consultation) ne peut pas « arriver » une seconde fois. L'historique conserve acteur, date, motif et ancien créneau.

## Accueil sans rendez-vous et orientation
Identification → motif → degré d'urgence → destination. **Immédiate, très urgente et urgente passent obligatoirement par le triage** (refus aussi côté service). Orientation « service » : passage créé directement « arrivé ». La date de dernière visite du dossier est mise à jour à l'arrivée effective.

## États de la file (correspondance avec la demande)
| Demandé | Implémenté |
|---|---|
| arrivé | rendez-vous `arrived` |
| en attente | `waiting` |
| orienté | destination enregistrée (triage ou service) à la création du passage |
| en triage | triage `inTriage` |
| en attente de consultation | rendez-vous `waiting` / triage `inCare` (envoyé en soins) |
| en consultation | `inProgress` |
| terminé | `done` / triage `discharged` ou `transferred` |
Écart connu : l'état « orienté » n'est pas un statut distinct (aucun écran n'en a besoin tant qu'il n'y a pas de file par service dédiée).

## Triage et constantes vitales
Circuit imposé : attente → triage → soins → transfert ou sortie. Constantes : au moins une valeur ; bornes de **plausibilité** (faute de frappe), pas de seuils cliniques ; aucune interprétation ni diagnostic ; valeurs affichées telles que saisies.

## Limites connues
- Contrôles de conflit en « lecture puis écriture » (transactions séparées) : sûr pour un poste unique, non garanti si deux onglets réservent le même créneau au même instant (le verrou transactionnel arrive avec la caisse et les lits).
- La création de rendez-vous demande toujours le patient en texte (identifiant, n° de dossier ou nom exact) ; un sélecteur de patient viendra avec la refonte des formulaires.
- Pas encore de file *par service* avec tableau dédié (les listes filtrables par service existent).
