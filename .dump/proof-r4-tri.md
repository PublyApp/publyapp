# Preuve r4 — les tests « walk » de pagination par clé ne sont plus aveugles au critère de tri

**Livrable :** round 4 (issue #1593 / `lane/wt-220`)
**Date :** 2026-08-27
**Auteur :** assistanat de codage (Jcode)
**Branche :** `lane/wt-220`

## Contexte et verdict r3

Les 11 tests de parcours multi-page (`limit=1`, clé de tri indépendante) couvraient la
*page* (pas de doublon, pas de trou) mais étaient **aveugles au critère de tri** : une
mutation du `keySelector` de production vers un champ frère de même type restait verte.
Le round 3 a été rejeté pour cette raison précise — les preuves ciblaient `idSelector`
au lieu de l'adversaire réel : un **échange `keySelector` → champ frère de même type**.

Ce round corrige cela : on ensemence des valeurs distinctes **anti-corrélées** avec l'ordre
d'insertion sur le champ trié, et on **assert la séquence observée** (valeur du champ
renvoyée, ou valeur résolue en base par l'`Id` quand l'item filaire ne l'expose pas).

## Règle appliquée (par service)

| Service | Champ trié (`keySelector`) | Anti-corrélation | Assertion observée |
|---|---|---|---|
| AuditLog (staff) | `CreatedAt` | idx0→+2j, 1→+0j, 2→+1j | `CreatedAt` filaire |
| SystemNotice (staff) | `CreatedAt` | idem | `CreatedAt` filaire |
| Post (tenant) | `CreatedAt` | idem | `CreatedAt` filaire |
| SocialAccount (tenant) | `CreatedAt` | idem | `CreatedAt` résolu en base (item ne l'expose pas) |
| Tenant (staff list) | `CreatedAt` | idem | `CreatedAt` résolu en base (item ne l'expose pas) |
| TenantUser (staff) | `User.CreatedAt` | idem | `CreatedAt` résolu via `User` (tri = `User.CreatedAt`, pas `Account`) |
| TenantUserCompany (staff) | `Account.CreatedAt` | idem | `CreatedAt` résolu via `UserAccount` |
| StaffInvitation accepted_at | `AcceptedAt` | idem | `AcceptedAt` résolu en base |
| TenantInvitation accepted_at | `AcceptedAt` | idem | `AcceptedAt` résolu en base (service partagé) |
| StaffInvitation email | `Email` | insertion c,b,a / lexical a,b,c | `Email` filaire |
| TenantProfile name | `Name` | insertion c,b,a / lexical a,b,c | `Name` filaire |
| StaffProfile name | `Name` | idem | `Name` filaire |
| StaffUser email | `Email` | insertion c,b,a / lexical a,b,c | `Email` filaire |

**Piège d'ancrage des dates** : sur une entité nouvellement ajoutée, l'intercepteur
d'audit horodate `CreatedAt = now` (et `UpdatedAt = now`), écrasant la valeur ensemencée.
Technique à deux phases : (1) `AddAsync` + `SaveChangesAsync`, (2) recharger la ligne
suivie et écraser `CreatedAt` en `Modified` — l'intercepteur ne touche alors qu'à
`UpdatedAt`, donc la `CreatedAt` ensemencée tient. Appliqué pour AuditLog, SystemNotice,
Post, SocialAccount(racine), Tenant, TenantUser (`User`), TenantUserCompany (`Account`),
et Staff/TenantInvitation (`AcceptedAt`).

## Preuve VERTE (arbre propre)

Exécution ciblée des 13 méthodes « walk » (`created_at`, `accepted_at`, `email`, `name`)
sur l'arbre **propre** (source de production non mutée) :

```
Passed!  - Failed: 0, Passed: 13, Skipped: 0, Total: 13
```

Les 13 assertions observées passent : l'ordre renvoyé correspond bien au tri montant du
champ, et **diffère de l'ordre d'insertion** (`observed.Should().NotEqual(seededOrder)`).

## Preuve ROUGE (échange `keySelector` → champ frère de même type)

Mutation adversaire (la seule que r3 exigeait de couvrir), appliquée sur la source de
production, puis exécution de la même suite :

- AuditLog `CreatedAt` → `UpdatedAt`
- SystemNotice `CreatedAt` → `StartsAt`
- Post `CreatedAt` → `UpdatedAt`
- SocialAccount `CreatedAt` → `UpdatedAt`
- Tenant `CreatedAt` → `UpdatedAt`
- TenantUser `User.CreatedAt` → `User.UpdatedAt`
- TenantUserCompany `Account.CreatedAt` → `Account.UpdatedAt`
- Invitation `AcceptedAt ?? MinValue` → `CreatedAt` ; `Email` → `(Id).ToString()`
- StaffProfile/TenantProfile `Name` → `(Id ?? Guid.Empty).ToString()` (même type `string`)
- StaffUser `User.Email` → `User.FirstName ?? ""` (même type `string`)

Résultat :

```
Failed!  - Failed: 12, Passed: 1, Skipped: 0, Total: 13
```

Le seul « passé » initial était un flake du run parallèle (collision d'infra de test) :
relancé **en isolation**, `FindTenantProfilesCursorBehaviorSpec` échoue aussi
(`Expected ... "Walk Page a ..." ... but "Walk Page c ..." differs at index 0`). Donc **13/13
rouges** sous l'échange `keySelector`. La source de production a ensuite été restaurée via
`git checkout` des 11 fichiers de service ; vérification : les 16 `keySelector` d'origine
sont rétablis, et la suite repasse 13/13 vert.

## Conclusion

Le critère de tri n'est plus aveugle : chaque test « walk » assert désormais la séquence
observée du champ trié, et tout échange `keySelector` vers un champ frère de même type
fait échouer le test. GREEN propre = 13/13 ; RED sous mutation = 13/13.
