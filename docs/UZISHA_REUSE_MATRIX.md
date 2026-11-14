# UZISHA — analyse de réutilisation (archives de `references/`, Laravel 8)

| Élément UZISHA | Décision | Raison |
|---|---|---|
| Authentification (user_name / user_password / enterprise_id, Sanctum Bearer, sessions appareils, audit de connexion) | **Ne pas réutiliser côté HEALTH** | L'identité passe par CERO ID CORE ; pas de login parallèle. |
| Entreprise (`enterprise_id`, en-tête `X-Enterprise-Id`) | **À confirmer** | Correspondance avec « établissement » HEALTH inconnue. |
| Rôles/permissions (Spatie, teams) | **À confirmer** | Format des permissions à aligner avec ID CORE. |
| Stock, produits, fournisseurs, mouvements | **Candidat à la réutilisation** (phase 5, via `uzishaClient`) | Besoin explicite : lier HEALTH à l'application de stock existante. Routes à confirmer (`routes/api.php` absent). |
| Ventes / caisse / factures | **À évaluer** | Recouvrement possible avec facturation HEALTH ; ne pas dupliquer sans décision. |
| Réponses hétérogènes (tableaux bruts, paginateurs Laravel) | Absorbées par `adaptiveNormalizer` | Le reste du frontend ne voit qu'un `ApiResult` normalisé. |

Aucune API UZISHA n'est modifiée. Le client `uzishaClient` n'est utilisé que pour des fonctionnalités réellement réutilisées.
