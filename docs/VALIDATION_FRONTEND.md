# Validation du frontend CERO HEALTH (mode démonstration)

Ces vérifications doivent être exécutées dans le vrai projet (pnpm + navigateur). Elles n'ont **pas** pu l'être depuis l'environnement d'assistance (pas de terminal sur le poste, pas de réseau, pas de node_modules).

## 1. Automatique
```
pnpm install
pnpm check      # tokens, i18n, typecheck, lint, tests
pnpm build
```
Copier la sortie complète de toute erreur pour correction.

## 2. Navigateur (`pnpm dev`, mode démo, sans API)
Pour chaque langue (FR, EN, SW) et chaque thème (clair, sombre) :
- Patients : filtre par date d'inscription, export Excel/PDF, doublons (démo : téléphone et n° de dossier partagés), création/modification, fiche (onglets, dossier médical séparé).
- Rendez-vous : vues Jour/Semaine/Mois, légende, clic sur un événement, modification, report, annulation (message « rien enregistré » en démo), conflit de créneau d'un même praticien.
- Accueil : file du jour, bouton « Patient sans rendez-vous » → orientation triage ou service ; une urgence ne peut pas être orientée vers un service.
- Parcours : fiche patient → dossier médical (recherche préremplie), détail d'un rendez-vous → fiche patient.

## 3. Écrans
Largeurs 375 px (mobile), 768 px (tablette), 1280 px et plus (ordinateur) : pas de défilement horizontal de la page, tableaux lisibles (colonnes secondaires masquées), boîtes de dialogue utilisables, navigation latérale repliable.

## En attente des API
Voir `docs/API_CONTRACTS_NEEDED.md` (propositions uniquement) : enregistrement réel des rendez-vous, accueil/arrivées, sans-rendez-vous (POST triage / appointments), fusion de doublons, historiques, exports tracés, liste des praticiens (CERO ID CORE).

## 4. Mode local (`VITE_LOCAL_MODE=true`, `pnpm dev`) — Phases 1 et 2
- Bandeau « MODE LOCAL » visible ; sélecteur de rôle (Réceptionniste, Caissier, Médecin…) ; page `/local-data` (export, restauration, réinitialisation avec confirmation).
- Rôle Réceptionniste : créer un patient (numéro de dossier généré `DOS-LOC-AAAA-NNNN`), recharger la page → il est toujours là ; créer le même numéro → refus clair.
- Accueil : « Patient sans rendez-vous » (saisir le n° de dossier) → standard vers un service = patient « arrivé » dans la file ; urgent → seul le triage est accepté ; refaire l'arrivée du même patient → refus « déjà dans la file ».
- Rendez-vous : créer, puis créer un chevauchement du même praticien → refus ; check-in → attente → consultation → terminé ; annulation sans motif refusée.
- Rôle Infirmier : Soins infirmiers → détail → démarrer le triage, saisir des constantes (une valeur absurde est refusée), envoyer en soins, clôturer.
- Rôle Caissier : tenter une arrivée → refus de permission (message, pas seulement bouton masqué).
- Fusion de doublons (Administrateur) : motif obligatoire ; les rendez-vous du doublon apparaissent sur le dossier conservé.
- `/local-data` → exporter → réinitialiser → restaurer : tout revient à l'identique.

## 5. Phase 3 — facturation, caisse, assurances (mode local)
Dans `pnpm check` : `finance-service.test.ts` (15), `cash-summary.test.ts` (3), `invoice.test.ts`, `validity.test.ts`, `engine.test.ts`, `unit-of-work.test.ts`.
Navigateur (FR puis EN/SW, clair/sombre) :
- Rôle Caissier, `/billing` → « Nouvelle facture » : patient **Juma Kilo** (DEMO-P-002, assuré Alpha, couverture automatique), prestation « Consultation générale » → aperçu : facturable 18,00, patient 3,60. Créer. Ouvrir la facture → « Encaisser » 3,60 espèces → statut **Partiellement payée** (créance assureur ouverte), frais de consultation **valides**.
- Même patient : nouvelle consultation → **refus** « frais valides jusqu'au … ». Actualiser la page : tout est toujours là.
- Détail → Règlement de l'organisme 14,40 par virement avec référence → **Payée**.
- Double-cliquer très vite sur « Encaisser » : un seul paiement.
- Paiement en carte sans référence : bouton désactivé. Montant supérieur au reste : refus clair.
- Contrepasser un paiement sans motif : impossible ; avec motif : écriture inverse visible, frais retirés (Validité des frais → ligne « Annulé »).
- Annuler une facture avec paiement : refusé ; sans paiement : accepté avec motif.
- `/insurance` → couverture « en attente » de **Zawadi Lima** (DEMO-P-005) : facturer → aucun effet d'assurance ; valider (rôle Caissier) → effet appliqué sur la facture suivante.
- Rôle Réceptionniste : `/billing` → pas de bouton Encaisser ; exemption, remboursement, configuration : absents / refusés.
- Validité des frais (Administrateur) : changer la durée avec date d'effet **passée** → refusé ; future → acceptée, anciens paiements gardent leur échéance.
- Impression : facture A4 et reçu 80 mm s'ouvrent dans la fenêtre d'impression (bandeau « MODE LOCAL » présent).
- `/local-data` → exporter → réinitialiser → restaurer : factures, grand livre, couvertures identiques.

## 6. Phase 5 — prescriptions et laboratoire (mode local)
Dans `pnpm check` : `lab-rules.test.ts` (12), `lab-service.test.ts` (12), `rx-service.test.ts` (7), `finance-service.test.ts` (15, après refactor `inUnit`).
Navigateur (FR puis EN/SW) :
- Rôle Médecin, ouvrir une consultation → onglet Plan → **Demander des examens** (patient prérempli) : cocher Glycémie + NFS → Envoyer. La demande s'ouvre avec le bandeau « À payer en caisse ».
- Rôle Caissier, `/billing` : la facture des examens est déjà là (montant = 23,00 si pas d'assurance). Encaisser.
- Rôle Laborantin, `/laboratory` : avant paiement, « Marquer comme prélevé » est **désactivé** ; après paiement il s'active. Prélever → Démarrer l'analyse → Saisir les résultats (rien n'est prérempli) → enregistrer partiellement : statut reste « En analyse » ; compléter → « Résultat saisi » → Valider.
- Rectifier un résultat validé sans motif : impossible ; avec motif : l'ancien résultat reste visible dans « Historique des rectifications ».
- Demande non payée : rôle Laborantin n'a pas « Autoriser sans paiement » ; Administrateur l'a (motif obligatoire) → prélèvement possible, la dette reste en caisse.
- Annuler une demande non payée (avant prélèvement) : la facture passe à Annulée. Annuler une demande déjà payée : la demande est annulée, un bandeau indique « remboursement à faire en caisse » ; rembourser en caisse.
- Annuler après prélèvement : refusé.
- Rôle Médecin, `/prescriptions` ou onglet Plan → **Prescrire** : sans posologie → bouton désactivé ; créer → statut « À valider ». Rôle Pharmacien : Valider. Annuler sans motif impossible.
- Rôle Réceptionniste : aucun bouton de demande/prescription.
- Dossier patient → onglet Prescriptions : la prescription apparaît.
- Recharger : tout est conservé. `/local-data` : exporter → réinitialiser → restaurer à l'identique.

## 7. Phase 6 — pharmacie et stock (mode local)
Dans `pnpm check` : `pharmacy-service.test.ts` (14) + les suites précédentes.
Navigateur :
- Médecin : prescrire (ex. « Antalgique », 10, posologie/fréquence). Pharmacien : `/prescriptions` → Valider (ou depuis le dossier).
- Pharmacien `/pharmacy` → « À dispenser » : la prescription apparaît avec « 10/10 ». **Préparer** : choisir « Antalgique (boîte) (démo) », quantité 10 → une dispensation « Préparée » et une facture apparaissent. Onglet Stock : total inchangé (130), utilisable 100 (le lot « PERIME » n'est pas compté).
- « Remettre les produits » est **désactivé** tant que non payé. Caissier `/billing` : encaisser. Pharmacien : Remettre → statut « Remise », lot LOT-DEMO-A1 utilisé (premier périmé), stock 120, prescription « Dispensée ».
- Dispensation partielle : préparer 4 sur 10, remettre, la file affiche 6 ; demander 7 → refus « il ne reste que 6 ».
- Quantité > stock utilisable (ex. 101) : refus clair, aucune facture créée.
- Annuler avant remise sans motif impossible ; avec motif : facture annulée. Payée puis annulée : bandeau « remboursement à faire en caisse ». Après remise : refusé.
- Administrateur : « Remettre sans paiement » (motif obligatoire) ; le pharmacien ne l'a pas. La dette reste en caisse.
- Stock : réceptionner un lot (même n° pour le même produit → refus ; péremption passée → refus) ; ajuster −N avec motif ; ajuster en dessous de zéro → refus ; le journal des mouvements s'allonge.
- Prescription ayant une dispensation : « Annuler » → refus.
- Recharger la page : tout est conservé ; `/local-data` : exporter → réinitialiser → restaurer à l'identique.

## 8. Phase 7 — hospitalisation (mode local)
Dans `pnpm check` : `hospital-service.test.ts` (16).
Navigateur :
- `/hospitalization` (Responsable hospitalisation) : 16 lits **tous libres**, compteurs 16/0/0/0.
- Lit libre → « Assigner un patient » : choisir un patient, motif, médecin référent → le lit devient **Occupé** avec le nom du patient ; compteurs mis à jour. Le même patient ne peut pas être admis une seconde fois (refus « déjà hospitalisé »).
- Ouvrir un lit occupé : essayer de l'assigner depuis un autre écran → seuls les lits libres sont proposés.
- Ouvrir deux onglets sur la même page, admettre deux patients différents sur le même lit libre : le second est refusé (« ce lit n'est pas libre ») et le plan se recharge.
- Admission → « Changer de lit » : motif obligatoire ; l'ancien lit passe à **Nettoyage**, le nouveau à Occupé ; « Séjours » montre les deux lits.
- Lit en nettoyage : « Marquer comme prêt » → Libre. « Maintenance » demande un motif. Un lit occupé n'a pas ces boutons.
- « Annuler l'admission » sans motif impossible ; avec motif : lit en nettoyage, admission « Annulée ».
- « Demander la sortie » : statut « Sortie en attente », le lit reste occupé ; « Retirer la demande » revient à Hospitalisé.
- Rôle Médecin : peut admettre mais ne voit pas « Changer de lit » ni l'état des lits. Rôle Réceptionniste : aucun bouton.
- Consultation (médecin) → onglet Plan → **Hospitaliser** : patient et consultation préremplis.
- Dossier patient → onglet hospitalisations : l'admission apparaît. Recharger la page : tout est conservé ; `/local-data` export → réinitialisation → restauration à l'identique.

## 9. Phase 8 — compte hospitalier et sortie (mode local)
1. Admettre un patient (Hospitalisation) puis ouvrir l'admission : section « Compte hospitalier » (0 facture, jours à facturer 0 le jour même).
2. « Sortie effective » le jour même : bouton « Facturer les jours jusqu'à la sortie » → 1 jour facturé (tarif chambre standard).
3. Sans encaisser : valider la sortie → refus (solde dû) ; ouvrir la facture, encaisser, revenir : la sortie passe, le lit est en « Nettoyage ».
4. Patient assuré : la part organisme apparaît en « Reste dû par les organismes » et ne bloque pas la sortie.
5. Connecté en responsable hospitalisation : champ d'exception absent (message de permission) ; en administrateur : motif obligatoire, trace dans « Sortie ».
6. Annuler une admission avec jours facturés : refus. Rafraîchir la page : compte, factures et lit identiques.
