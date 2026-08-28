# Preuve d'issue #1646 — ronde 2 : preuves par mutation de CHAQUE keySelector

## Procédure

Pour chaque `keySelector` :
1. **Muter** le code de production : échanger le `keySelector` contre un champ frère du même type.
2. **Exécuter** le test de parcours correspondant.
3. **Capturer** la sortie ROUGE (échec du test).
4. **Restaur**er le `keySelector` original.
5. **Capturer** la sortie VERTE (test qui passe).

---

## Posts — `PostService.cs`

### 1. `created_at` (PostService.cs:175)

- **keySelector original:** `p => p.CreatedAt`
- **Mutation:** `p => p.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓ (test failed — order mismatch at index 1)

### 2. `updated_at` (PostService.cs:183)

- **keySelector original:** `p => p.UpdatedAt`
- **Mutation:** `p => p.CreatedAt`
- **Test:** `ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓ (test failed — order mismatch at index 0)

---

## SocialAccounts — `SocialAccountService.cs`

### 3. `created_at` (SocialAccountService.cs:179)

- **keySelector original:** `a => a.CreatedAt`
- **Mutation:** `a => a.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 4. `updated_at` (SocialAccountService.cs:187)

- **keySelector original:** `a => a.UpdatedAt`
- **Mutation:** `a => a.CreatedAt`
- **Test:** `ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

---

## AuditLogs — `AuditLogQueryService.cs`

### 5. `created_at` (AuditLogQueryService.cs:133)

- **keySelector original:** `auditLog => auditLog.CreatedAt`
- **Mutation:** `auditLog => auditLog.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

---

## StaffInvitations — `InvitationQueryService.cs` (Staff)

### 6. `created_at` (InvitationQueryService.cs:229)

- **keySelector original:** `inv => inv.CreatedAt`
- **Mutation:** `inv => inv.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 7. `expires_at` (InvitationQueryService.cs:237)

- **keySelector original:** `inv => inv.ExpiresAt`
- **Mutation:** `inv => inv.CreatedAt`
- **Test:** `ItShouldWalkEveryExpiresAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 8. `email` (InvitationQueryService.cs:245)

- **keySelector original:** `inv => inv.Email`
- **Mutation:** `inv => inv.Token`
- **Test:** `ItShouldWalkEveryEmailPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 9. `accepted_at` (InvitationQueryService.cs:254)

- **keySelector original:** `inv => inv.AcceptedAt ?? DateTime.MinValue`
- **Mutation:** `inv => inv.ExpiresAt`
- **Test:** `ItShouldWalkEveryAcceptedAtPageWithoutOverlapOrGapWithNullCoercion`
- **ROUGE :** ✓

---

## TenantInvitations — `InvitationQueryService.cs` (Tenant)

### 10. `created_at` (InvitationQueryService.cs:392)

- **keySelector original:** `inv => inv.CreatedAt`
- **Mutation:** `inv => inv.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 11. `expires_at` (InvitationQueryService.cs:400)

- **keySelector original:** `inv => inv.ExpiresAt`
- **Mutation:** `inv => inv.CreatedAt`
- **Test:** `ItShouldWalkEveryExpiresAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 12. `email` (InvitationQueryService.cs:408)

- **keySelector original:** `inv => inv.Email`
- **Mutation:** `inv => inv.Token`
- **Test:** `ItShouldWalkEveryEmailPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 13. `accepted_at` (InvitationQueryService.cs:417)

- **keySelector original:** `inv => inv.AcceptedAt ?? DateTime.MinValue`
- **Mutation:** `inv => inv.ExpiresAt`
- **Test:** `ItShouldWalkEveryAcceptedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

---

## SystemNotices — `SystemNoticeService.cs`

### 14. `created_at` (SystemNoticeService.cs:155)

- **keySelector original:** `n => n.CreatedAt`
- **Mutation:** `n => n.StartsAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 15. `starts_at` (SystemNoticeService.cs:163)

- **keySelector original:** `n => n.StartsAt`
- **Mutation:** `n => n.CreatedAt`
- **Test:** `ItShouldWalkEveryStartsAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 16. `severity` (SystemNoticeService.cs:171)

- **keySelector original:** `n => n.Severity`
- **Mutation:** `n => NoticeSeverity.Warning` (constant — no same-type sibling exists on SystemNotice)
- **Test:** `ItShouldWalkEverySeverityPageWithoutOverlapOrGap`
- **ROUGE :** ✓

---

## StaffProfiles — `StaffProfileQueryAsStaffService.cs`

### 17. `created_at` (StaffProfileQueryAsStaffService.cs:151)

- **keySelector original:** `p => p.CreatedAt`
- **Mutation:** `p => p.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 18. `name` (StaffProfileQueryAsStaffService.cs:141)

- **keySelector original:** `p => p.Name`
- **Mutation:** `p => p.Description ?? string.Empty`
- **Test:** `ItShouldWalkEveryPageOnANameSortWithoutOverlapOrGap`
- **ROUGE :** ✓

### 19. `user_account_count` (StaffProfileQueryAsStaffService.cs:161)

- **keySelector original:** `p => p.UserAccountProfiles.Count`
- **Mutation:** `p => (int)p.Scope`
- **Test:** `ItShouldWalkEveryUserAccountCountPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 20. `id` — **NON-PROVABLE** (documented limitation)

- **keySelector original:** `p => p.Id ?? Guid.Empty`
- **Issue:** No same-type (Guid) sibling field exists on Profile with distinct values per row. `TenantId` and `ProjectId` are both null for staff profiles, so `?? Guid.Empty` resolves identically for all seeded rows, and the secondary `idSelector` (Id) breaks ties identically.
- **Test:** `ItShouldWalkEveryIdPageWithoutOverlapOrGap`
- **Note:** The test still passes with the swap (GREEN), so it's not a valid mutation proof.

---

## TenantProfiles — `TenantProfileQueryAsStaffService.cs`

### 21. `created_at` (TenantProfileQueryAsStaffService.cs:224)

- **keySelector original:** `p => p.CreatedAt`
- **Mutation:** `p => p.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 22. `name` (TenantProfileQueryAsStaffService.cs:213)

- **keySelector original:** `p => p.Name`
- **Mutation:** `p => p.Description ?? string.Empty`
- **Test:** `ItShouldWalkEveryPageOnANameSortWithoutOverlapOrGap`
- **ROUGE :** ✓

### 23. `id` — **NON-PROVABLE** (documented limitation)

- **keySelector original:** `p => p.Id ?? Guid.Empty`
- **Issue:** Same as StaffProfiles id — `TenantId` is identical for all seeded rows.
- **Test:** `ItShouldWalkEveryIdPageWithoutOverlapOrGap`
- **Note:** Test passes with the swap (GREEN).

---

## TenantAsStaff — `TenantAsStaffService.cs`

### 24. `created_at` (TenantAsStaffService.cs:296)

- **keySelector original:** `t => t.CreatedAt`
- **Mutation:** `t => t.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 25. `updated_at` (TenantAsStaffService.cs:304)

- **keySelector original:** `t => t.UpdatedAt`
- **Mutation:** `t => t.CreatedAt`
- **Test:** `ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 26. `name` (TenantAsStaffService.cs:312)

- **keySelector original:** `t => t.Name`
- **Mutation:** `t => t.LegalName ?? string.Empty`
- **Test:** `ItShouldWalkEveryNamePageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 27. `status` (TenantAsStaffService.cs:320)

- **keySelector original:** `t => t.Status`
- **Mutation:** `t => TenantStatus.Active` (constant — no same-type sibling exists on Tenant)
- **Test:** `ItShouldWalkEveryStatusPageWithoutOverlapOrGap`
- **ROUGE :** ✓

---

## StaffUsers — `StaffUserQueryService.cs`

### 28. `created_at` (StaffUserQueryService.cs:112)

- **keySelector original:** `ua => ua.User.CreatedAt`
- **Mutation:** `ua => ua.User.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 29. `updated_at` (StaffUserQueryService.cs:122)

- **keySelector original:** `ua => ua.User.UpdatedAt`
- **Mutation:** `ua => ua.User.CreatedAt`
- **Test:** `ItShouldWalkEveryUpdatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 30. `email` (StaffUserQueryService.cs:132)

- **keySelector original:** `ua => ua.User.Email`
- **Mutation:** `ua => ua.User.FirstName ?? string.Empty`
- **Test:** `ItShouldWalkEveryEmailPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 31. `first_name` (StaffUserQueryService.cs:142)

- **keySelector original:** `ua => ua.User.FirstName ?? string.Empty`
- **Mutation:** `ua => ua.User.LastName ?? string.Empty`
- **Test:** `ItShouldWalkEveryFirstNamePageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 32. `last_name` (StaffUserQueryService.cs:152)

- **keySelector original:** `ua => ua.User.LastName ?? string.Empty`
- **Mutation:** `ua => ua.User.FirstName ?? string.Empty`
- **Test:** `ItShouldWalkEveryLastNamePageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 33. `status` (StaffUserQueryService.cs:162)

- **keySelector original:** `ua => ua.User.Status`
- **Mutation:** `ua => UserStatus.Suspended` (constant — no same-type sibling exists on User)
- **Test:** `ItShouldWalkEveryStatusPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 34. `level` (StaffUserQueryService.cs:172)

- **keySelector original:** `ua => ua.Level`
- **Mutation:** `ua => AccountLevel.Admin` (constant — no same-type sibling exists on UserAccount)
- **Test:** `ItShouldWalkEveryLevelPageWithoutOverlapOrGap`
- **ROUGE :** ✓

---

## TenantUsers — `TenantUserQueryService.cs`

### 35. `email` (TenantUserQueryService.cs:127)

- **keySelector original:** `x => x.User.Email`
- **Mutation:** `x => x.User.FirstName ?? string.Empty`
- **Test:** `ItShouldWalkEveryEmailPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 36. `created_at` (TenantUserQueryService.cs:154)

- **keySelector original:** `x => x.User.CreatedAt`
- **Mutation:** `x => x.User.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 37. `status` (TenantUserQueryService.cs:136)

- **keySelector original:** `x => x.User.Status == UserStatus.Suspended ? 2 : x.Status == AccountStatus.Suspended ? 1 : 0`
- **Mutation:** `x => (int)x.Level`
- **Test:** `ItShouldWalkEveryStatusPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 38. `level` (TenantUserQueryService.cs:145)

- **keySelector original:** `x => x.Level`
- **Mutation:** `x => AccountLevel.Admin` (constant — no same-type sibling exists on UserAccount)
- **Test:** `ItShouldWalkEveryLevelPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 39. `id` — **NON-PROVABLE** (documented limitation)

- **keySelector original:** `x => x.UserId`
- **Issue:** No same-type (Guid) sibling with distinct values. `TenantId` is identical for all seeded rows.
- **Test:** `ItShouldWalkEveryIdPageWithoutOverlapOrGap`
- **Note:** Test passes with the swap (GREEN).

---

## TenantUserCompanies — `TenantUserCompanyQueryService.cs`

### 40. `tenant_name` (TenantUserCompanyQueryService.cs:125)

- **keySelector original:** `ua => ua.Tenant.Name`
- **Mutation:** `ua => ua.Tenant.LegalName ?? string.Empty`
- **Test:** `ItShouldWalkEveryTenantNamePageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 41. `created_at` (TenantUserCompanyQueryService.cs:182)

- **keySelector original:** `ua => ua.Account.CreatedAt`
- **Mutation:** `ua => ua.Account.UpdatedAt`
- **Test:** `ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 42. `status` (TenantUserCompanyQueryService.cs:144)

- **keySelector original:** `ua => ua.User.Status == UserStatus.Suspended ? 2 : ua.Account.Status == AccountStatus.Suspended ? 1 : 0`
- **Mutation:** `ua => (int)ua.Account.Level`
- **Test:** `ItShouldWalkEveryStatusPageWithoutOverlapOrGap`
- **ROUGE :** ✓

### 43. `level` (TenantUserCompanyQueryService.cs:163)

- **keySelector original:** `ua => ua.Account.Level`
- **Mutation:** `ua => AccountLevel.Admin` (constant — no same-type sibling exists on UserAccount)
- **Test:** `ItShouldWalkEveryLevelPageWithoutOverlapOrGap`
- **ROUGE :** ✓

---

## Résumé

| Service | Total keySelectors | PROVÉS (ROUGE) | NON-PROVABLES |
|---------|-------------------|----------------|---------------|
| Posts | 2 | 2 | 0 |
| SocialAccounts | 2 | 2 | 0 |
| AuditLogs | 1 | 1 | 0 |
| StaffInvitations | 4 | 4 | 0 |
| TenantInvitations | 4 | 4 | 0 |
| SystemNotices | 3 | 3 | 0 |
| StaffProfiles | 4 | 3 | 1 (id) |
| TenantProfiles | 3 | 2 | 1 (id) |
| TenantAsStaff | 4 | 4 | 0 |
| StaffUsers | 7 | 7 | 0 |
| TenantUsers | 5 | 4 | 1 (id) |
| TenantUserCompanies | 4 | 4 | 0 |
| **Total** | **43** | **40** | **3** |

### Limitations documentées

Les 3 keySelectors `id`/`UserId` de type `Guid` ne peuvent pas être prouvés par échange avec un champ frère parce qu'aucun autre champ `Guid` n'existe sur les entités correspondantes avec des valeurs distinctes par ligne. Le swap produit un key identique pour toutes les lignes (ex: `Guid.Empty`), et le trie secondaire par `idSelector` restaure l'ordre identique, laissant le test passer (VERT).

### TODO (suite)

- [ ] Ajouter des tests d'égalité sur les clés de tri (sort keys)
- [ ] Ajouter des vérifications d'exacte cardinalité
- [ ] Envisager des tests de mutation pour les keySelectors `id` avec des données de test distinctes par ligne (ex: assigner des `TenantId` distincts)
- [ ] Commit et push incrémental vers `lane/wt-1646`
