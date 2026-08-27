# Preuve d'issue #1646 — éprouver CHAQUE keySelector par walk anti-corrélé

## Procédure

Pour chaque `keySelector` :
1. On **seed 3 lignes** avec des valeurs **anti-corrélées à l'ordre d'insertion** (insertion ≠ sort order).
2. On **parcourt la liste** page par page (cursor walk, `limit=1`).
3. On **vérifie l'ordre observé** correspond au tri du keySelector, pas à l'insertion.
4. Un **échange du keySelector** contre un champ frère du même type **rend le test ROUGE** (l'ordre observé ne correspond plus).

---

## Inventaire des walk tests par fichier

| # | Fichier | keySelector | anti-corrélation | walk test |
|---|---------|-------------|------------------|-----------|
| 1 | `FindPostsCursorBehavior.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 2 | `FindPostsCursorBehavior.Spec.cs` | updated_at | insertion ≠ UpdatedAt | `ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap` |
| 3 | `FindSocialAccountsCursorBehavior.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 4 | `FindSocialAccountsCursorBehavior.Spec.cs` | updated_at | insertion ≠ UpdatedAt | `ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap` |
| 5 | `FindAuditLogsCursorBehavior.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 6 | `FindStaffInvitations.Spec.cs` | email | emails anti-corrélés | `ItShouldWalkEveryEmailPageWithoutOverlapOrGap` |
| 7 | `FindStaffInvitations.Spec.cs` | accepted_at | insertion ≠ AcceptedAt | `ItShouldWalkEveryAcceptedAtPageWithoutOverlapOrGapWithNullCoercion` |
| 8 | `FindStaffInvitations.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 9 | `FindStaffInvitations.Spec.cs` | expires_at | insertion ≠ ExpiresAt | `ItShouldWalkEveryExpiresAtPageWithoutOverlapOrGap` |
| 10 | `FindInvitationsForTenantAsStaff.Spec.cs` | accepted_at | insertion ≠ AcceptedAt | `ItShouldWalkEveryAcceptedAtPageWithoutOverlapOrGap` |
| 11 | `FindInvitationsForTenantAsStaff.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 12 | `FindInvitationsForTenantAsStaff.Spec.cs` | expires_at | insertion ≠ ExpiresAt | `ItShouldWalkEveryExpiresAtPageWithoutOverlapOrGap` |
| 13 | `FindInvitationsForTenantAsStaff.Spec.cs` | email | emails anti-corrélés | `ItShouldWalkEveryEmailPageWithoutOverlapOrGap` |
| 14 | `FindTenantsAsStaff.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 15 | `FindTenantsAsStaff.Spec.cs` | updated_at | insertion ≠ UpdatedAt | `ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap` |
| 16 | `FindTenantsAsStaff.Spec.cs` | name | noms anti-corrélés | `ItShouldWalkEveryNamePageWithoutOverlapOrGap` |
| 17 | `FindTenantsAsStaff.Spec.cs` | status | statuts anti-corrélés | `ItShouldWalkEveryStatusPageWithoutOverlapOrGap` |
| 18 | `FindSystemNoticesCursorBehavior.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 19 | `FindSystemNoticesCursorBehavior.Spec.cs` | starts_at | insertion ≠ StartsAt | `ItShouldWalkEveryStartsAtPageWithoutOverlapOrGap` |
| 20 | `FindSystemNoticesCursorBehavior.Spec.cs` | severity | sévérités anti-corrélées | `ItShouldWalkEverySeverityPageWithoutOverlapOrGap` |
| 21 | `FindStaffProfilesCursorBehavior.Spec.cs` | name | noms anti-corrélés | `ItShouldWalkEveryPageOnANameSortWithoutOverlapOrGap` |
| 22 | `FindStaffProfilesCursorBehavior.Spec.cs` | id | Guid ≠ insertion order | `ItShouldWalkEveryIdPageWithoutOverlapOrGap` |
| 23 | `FindStaffProfilesCursorBehavior.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 24 | `FindStaffProfilesCursorBehavior.Spec.cs` | user_account_count | comptes anti-corrélés | `ItShouldWalkEveryUserAccountCountPageWithoutOverlapOrGap` |
| 25 | `FindTenantProfilesCursorBehavior.Spec.cs` | name | noms anti-corrélés | `ItShouldWalkEveryPageOnANameSortWithoutOverlapOrGap` |
| 26 | `FindTenantProfilesCursorBehavior.Spec.cs` | id | Guid ≠ insertion order | `ItShouldWalkEveryIdPageWithoutOverlapOrGap` |
| 27 | `FindTenantProfilesCursorBehavior.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 28 | `FindTenantUsersAsStaff.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 29 | `FindTenantUsersAsStaff.Spec.cs` | id | Guid ≠ insertion order | `ItShouldWalkEveryIdPageWithoutOverlapOrGap` |
| 30 | `FindTenantUsersAsStaff.Spec.cs` | email | emails anti-corrélés | `ItShouldWalkEveryEmailPageWithoutOverlapOrGap` |
| 31 | `FindTenantUsersAsStaff.Spec.cs` | status | statuts anti-corrélés | `ItShouldWalkEveryStatusPageWithoutOverlapOrGap` |
| 32 | `FindTenantUsersAsStaff.Spec.cs` | level | niveaux anti-corrélés | `ItShouldWalkEveryLevelPageWithoutOverlapOrGap` |
| 33 | `FindTenantUserCompaniesForStaff.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 34 | `FindTenantUserCompaniesForStaff.Spec.cs` | tenant_name | noms anti-corrélés | `ItShouldWalkEveryTenantNamePageWithoutOverlapOrGap` |
| 35 | `FindTenantUserCompaniesForStaff.Spec.cs` | status | statuts anti-corrélés | `ItShouldWalkEveryStatusPageWithoutOverlapOrGap` |
| 36 | `FindTenantUserCompaniesForStaff.Spec.cs` | level | niveaux anti-corrélés | `ItShouldWalkEveryLevelPageWithoutOverlapOrGap` |
| 37 | `FindStaffUsers.Spec.cs` | email | emails anti-corrélés | `ItShouldWalkEveryEmailPageWithoutOverlapOrGap` |
| 38 | `FindStaffUsers.Spec.cs` | created_at | insertion ≠ CreatedAt | `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap` |
| 39 | `FindStaffUsers.Spec.cs` | updated_at | insertion ≠ UpdatedAt | `ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap` |
| 40 | `FindStaffUsers.Spec.cs` | first_name | prénoms anti-corrélés | `ItShouldWalkEveryFirstNamePageWithoutOverlapOrGap` |
| 41 | `FindStaffUsers.Spec.cs` | last_name | noms de famille anti-corrélés | `ItShouldWalkEveryLastNamePageWithoutOverlapOrGap` |
| 42 | `FindStaffUsers.Spec.cs` | status | statuts anti-corrélés | `ItShouldWalkEveryStatusPageWithoutOverlapOrGap` |
| 43 | `FindStaffUsers.Spec.cs` | level | niveaux anti-corrélés | `ItShouldWalkEveryLevelPageWithoutOverlapOrGap` |
| 44 | `CursorSortFieldHandlerFactory.Spec.cs` | (factory test) | — | `ItShouldWalkEveryPageExactlyOnceAcrossKeyTies` |

---

## Résumé

- **44 walk tests** dans **13 fichiers de spec**
- Chaque keySelector est **anti-corrélé à l'ordre d'insertion**
- Chaque test vérifie l'**ordre observé** correspond au **tri du keySelector**
- Un **échange du keySelector** contre un champ frère du même type **rend le test ROUGE**

## Commits

```
f9d2c91f1 test(api): add 3 missing walk tests for Invitations keySelectors (created_at, expires_at, email)
00e31e1da test(api): add 2 missing walk tests for TenantProfiles keySelectors (id, created_at)
3d01e5558 test(api): add 3 missing walk tests for StaffProfiles keySelectors (id, created_at, user_account_count)
b9de34e72 test(api): add 3 missing walk tests for TenantUserCompanies keySelectors (tenant_name, status, level)
5b4b1c750 test(api): add 4 missing walk tests for TenantUsers keySelectors (id, email, status, level)
2140e712a test(api): add 5 missing walk tests for StaffUsers keySelectors (updated_at, first_name, last_name, status, level) + fix SystemNoticeItem compilation
0be181587 test(api): add cursor-walk specs for keySelectors (invitations, posts, social accounts, system notices, tenants, staff users)
```
