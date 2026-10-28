# Audit — triage des racines « Portfolio »

- **Date** : 2026-10-28
- **Tip audité** : `4fa02baf2` (`develop`)
- **Question** : les 15 issues ouvertes dont le titre commence par « Portfolio » sont-elles encore
  d'actualité ? Lesquelles garder ? Par quoi commencer pendant une passe d'outillage ?
- **Méthode** : chaque affirmation a été confrontée au code au tip (`git show HEAD:…`, greps,
  listings de modules, migrations), jamais à la description de l'issue. Les commentaires
  « Portfolio consolidation » du 2026-08-31 ont servi de carte des enfants absorbés, pas de preuve.

## Résultat en une ligne

Sur 15 racines, **2 sont entièrement livrées**, **1 est devenue obsolète dans sa forme**, **1 a été
matériellement avancée par cette session** et **11 restent légitimement ouvertes**. Le problème
n'est donc pas « trop d'issues » : c'est que trois d'entre elles ne décrivent plus l'état du dépôt,
et que six sont des plans dont aucune phase n'a démarré.

## Tableau de triage

| #    | Sujet                                        | Verdict au tip                | Preuve décisive                                                                                                                                                                                                                     | Décision                                                                    |
| ---- | -------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 359  | Front — cohérence des données après mutation | **Livré**                     | Règle écrite (`docs/guides/front/conventions.md` §« Mutation Invalidation Coherence »), 82 `invalidateQueries` dans `lib/query`, garde `mutation-invalidation.guard.test.ts` qui rougit si un module n'invalide aucune clé de liste | **Fermer**                                                                  |
| 631  | Publication et planification                 | **Livré**                     | `IPublishProvider` + providers, 12 handlers Publishing, `DispatchDuePostsJob` seedé, `Publication`/`PublicationSchedule` + journal de tentatives, front calendar/drafts/history/queue ; enfants #647/#1531/#2013 fermés             | **Fermer**                                                                  |
| 198  | Couverture de tests API                      | **Obsolète dans sa forme**    | Checklist manuelle à 7 cases cochées sur ~180, alors que le dépôt compte 329 `*.Spec.cs` / 2 568 `ItShould` pour 157 mappings — des cases restées décochées sont couvertes                                                          | **Scinder** : fermer la checklist, garder un contrôle machine endpoint→spec |
| 1498 | Authentification et sécurité de session      | **Partiel → avancé ici**      | `POST /auth/revoke-session` existait et était testé, mais aucun appel front (`grep revokeSession apps/front/src` = 0) et un reset de mot de passe ne tuait aucune session                                                           | **Garder, réduire**                                                         |
| 906  | Front — architecture i18n                    | **Partiel**                   | Mécanique livrée (`fallbackLng: false`, `staticData.i18nNamespaces`, préchargement SSR), mais `common` fait 1 383 feuilles (66 % des clés) et les namespaces `tenants`/`profiles`/`dashboard` n'existent pas                        | **Garder**                                                                  |
| 1160 | Analyse statique lean (anti-slop)            | **Partiel**                   | 10 des 15 règles à `error` ; les 5 restantes sont `off` et ont **augmenté** depuis la mesure d'août (ex. `no-runtime-typeof` 340 → 558). Dernier barreau : 2026-08-26                                                               | **Garder**                                                                  |
| 1699 | Exécution CI, sharding, fiabilité            | **Partiel**                   | Le runner « report-all » (32 commandes) et le sharding vitest 4× sont livrés ; le contrat de pruning du 2026-09-05 ne l'est pas (`just ci-full` rejoué en clôture, #1947/#1949 ouverts)                                             | **Garder**                                                                  |
| 1706 | Jobs, ordonnanceur, fiabilité                | **Partiel**                   | Invariants de file prouvés (pas de double enqueue, requeue avec backoff, leases) ; `misfire`/`DisallowConcurrent` = 0 occurrence, aucun test de tir réel                                                                            | **Garder**                                                                  |
| 1889 | Architecture des gardes (course PR×PR)       | **Ouvert, mécanisme disparu** | La garde de fraîcheur a été ajoutée puis **supprimée comme morte** (#1966 → #2056, −486 lignes) ; ruleset sans `strict_required_status_checks_policy`, pas de merge queue                                                           | **Garder**                                                                  |
| 1962 | Intégrité des tests et des preuves           | **Ouvert**                    | Aucun contrôle ne compare les noms de tests entre base et head ; la PR #2004 a été fermée sans merge                                                                                                                                | **Garder**                                                                  |
| 1127 | Parité produit tenant                        | **Partiel**                   | Posts/publication/settings/account livrés ; Billing et Calendar n'ont que des permissions, plusieurs écrans restent en lecture seule                                                                                                | **Garder (P1 produit)**                                                     |
| 365  | Cycle de vie et rétention des tenants        | **Ouvert**                    | Plan D1–D8 rédigé ; aucune permission `restore`, aucune variable de rétention, enfants tous ouverts                                                                                                                                 | **Garder**                                                                  |
| 1051 | Flags et capacités plateforme                | **Ouvert**                    | `flags.ts` lit toujours `import.meta.env` au chargement ; aucun `FeatureFlag` côté API, aucune migration                                                                                                                            | **Garder**                                                                  |
| 160  | Plan de contrôle staff (impersonation)       | **Partiel**                   | Service et modèle `sessions` présents ; aucun endpoint, aucune permission, aucune UI, `ImpersonationEnded` émis nulle part                                                                                                          | **Garder (P3)**                                                             |
| 1474 | Marketing public                             | **Ouvert**                    | Aucune route marketing ; `MarketingRoutePath = '/' \| '/login' \| '/signup'`                                                                                                                                                        | **Garder (P3)**                                                             |

## Ordre de priorité pour une passe d'outillage

1. **#1962 — intégrité des tests.** C'est le seul défaut de la liste qui rend les autres gardes
   mentaux : supprimer les tests d'une garde est aujourd'hui invisible. Une tranche d'un script
   (comparer les **noms** de cas entre `git show <base>:<fichier>` et le head) referme l'invariant.
2. **#1498 — sécurité de session.** Traité ici (voir plus bas) : c'était le seul P0 dont la moitié
   du travail existait déjà et dont le reste tenait en quelques dizaines de lignes.
3. **#1160 — dernier barreau anti-slop.** Les 5 règles restantes dérivent ; un barreau _scopé_ sur
   trois répertoires (5 sites) redémarre le cliquet sans nettoyage repo-wide.
4. **#1889 — course PR×PR.** Deux options minuscules : `strict_required_status_checks_policy`
   (réglage) ou ré-atterrir la garde de fraîcheur depuis `c47cc1fe8` et la brancher dans `classify`.
5. **#1699 — rééquilibrage e2e (#1949).** Configuration + script, aucune ligne produit.

Les six issues produit (#1127, #365, #1051, #160, #1474, #906) sont des épics : elles ne doivent pas
être traitées comme des tâches, et leur priorité est déjà portée par leur label `P*`.

## Ce que cette session a livré sur #1498

Le trou réel n'était pas l'API — elle savait déjà révoquer une session — mais les deux chemins qui
laissent un jeton survivre à une déconnexion :

1. `clearSession` (front) ne faisait que sérialiser un `Set-Cookie` vide. Il appelle maintenant
   `POST /auth/revoke-session` pour chaque jeton présenté par le cookie, en best-effort borné à 3 s :
   une API injoignable ne bloque pas la déconnexion.
2. `ResetPassword` ne tuait aucune session : un jeton volé avant le changement de mot de passe
   restait valide. Le handler révoque désormais toutes les sessions de l'utilisateur
   (`ISessionService.RevokeAllSessionsForUserAsync`), en une seule instruction.

Reste ouvert sur #1498, volontairement scindé : l'action staff « révoquer la session d'un
utilisateur » et l'audit de ces révocations (`AuditLog` n'a aucune action `session.*`).
