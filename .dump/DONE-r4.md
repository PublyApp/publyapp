# DONE-r4 — round 4 : les tests « walk » de pagination par clé couvrent le critère de tri

**Issue :** #1593 — round 4 (`fix-brief-r4.md`)
**Branche :** `lane/wt-220`
**Date :** 2026-08-27
**Statut :** TERMINÉ

## Objectif

Rendre les 11 tests de parcours multi-page (13 méthodes) de pagination par clé **non
aveugles au critère de tri**, en ensemencant des valeurs distinctes anti-corrélées sur le
champ trié et en assertant la séquence observée. Fournir une preuve ROUGE par service
(échange `keySelector` → champ frère de même type) et une exécution VERTE propre.

## Travail réalisé

- 11 fichiers `*CursorBehavior.Spec.cs` / `*Find*.Spec.cs` mis à jour :
  - ensemencement de `CreatedAt`/`AcceptedAt`/`Email`/`Name` anti-corrélés (ordre
    d'insertion ≠ ordre de tri) ;
  - ancrage des dates via la technique deux phases (insert, puis re-save `Modified`) car
    l'intercepteur d'audit écrase `CreatedAt` sur une entité nouvellement ajoutée ;
  - assertion de la séquence observée : valeur filaire (`CreatedAt`/`Email`/`Name`) ou
    valeur résolue en base par `Id` quand l'item filaire ne l'expose pas (SocialAccount,
    Tenant, TenantUser via `User`, TenantUserCompany via `Account`, invitations).
- Preuve ROUGE : échange de chaque `keySelector` de production vers un champ frère de même
  type → **13/13 échecs** (le unique pass initial était un flake de run parallèle,
  re-vérifié rouge en isolation). Source restaurée (`git checkout`).
- Preuve VERTE propre : **13/13 passés**.

## Preuves

- `.dump/proof-r4-tri.md` — tableau par service + relevés VERT (13/13) et ROUGE (13/13).
- Exécution de référence :
  - VERTE : `Failed: 0, Passed: 13, Total: 13`
  - ROUGE (mutation `keySelector`) : `Failed: 13, Passed: 0, Total: 13`

## Critères d'acceptation du brief — conformité

- [x] Valeurs anti-corrélées ensemencées sur le champ trié (pas seulement aléatoires).
- [x] Séquence observée assertée (valeur renvoyée ou résolue en base), pas l'ordre d'insertion.
- [x] Preuve ROUGE par service via échange `keySelector` → champ frère de même type.
- [x] Arbre propre VERT avant commit.
- [x] Documents en français (`proof-r4-tri.md`, `DONE-r4.md`).

## Notes

- `TenantUser` et `TenantUserCompany` trient par `User.CreatedAt` / `Account.CreatedAt`
  (pas `Account.CreatedAt` seul) — l'assertion résout la bonne table.
- `SocialAccount`, `Tenant`, invitations : l'item filaire n'expose pas la date triée ;
  l'assertion résout la valeur en base pour ne pas dépendre d'une exposition accidentelle.
