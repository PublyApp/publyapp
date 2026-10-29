# 2026-10-29 analysis — C# / .NET semantic duplication inventory (DUP-CSHARP-1)

**Scope.** `apps/api/Modules/**` (Handlers, Services, Entities, Endpoints, Validators, Permissions,
Jobs), `apps/api/Lib/**`, `apps/api/Infrastructure/**`, `apps/api/Data/**`. `Migrations/`,
`bin/`, `obj/` and the generated `ResponseKeys.g.cs` are excluded by construction. `*.Spec.cs`
(322 files) is excluded from the *families*: test code repeats on purpose, and a clone between two
specs is not debt. 640 production files / 88 750 lines under those roots; 966 `.cs` files / 207 780
lines in the whole project.

**Question.** Where does `apps/api` express the *same meaning* twice? Not where does it contain the
same characters twice — a brace-matched clone report answers the second question only. Generated
code, EF configuration boilerplate and two handlers that legitimately differ by scope all produce
clone blocks, and none of them is debt.

This is the C# half of `docs/records/2026-10-29-analysis-semantic-duplication.md` (DUP-SURVEY-1,
issue #2250), which excluded `apps/api` because the JS tools cannot see it.

## Method — leads, then judgement

Nothing below is a tool's conclusion. Five mechanical passes produced *candidates*; every candidate
was opened and read before it was classified. The tooling is hand-rolled (a 60-line Python
normaliser, not Roslyn), which bounds what it can see — see "What this survey does not cover".

1. **Repeated declaration names** — 1 604 non-spec type/method declarations grouped by name across
   files (`Success` ×70, `NotFound` ×34, `CursorNotFound` ×15, `InvalidSortId` ×15, …).
2. **Repeated method bodies** — every method body normalised (comments and string contents stripped,
   all local identifiers alpha-renamed to `v0..vN`) then hashed: 2 342 methods → 174 groups of ≥2,
   of which 62 span ≥2 files.
3. **Repeated statement windows** — 7-normalised-line sliding windows across the tree, keeping only
   windows containing `if(`/`return`/`await` and not dominated by declarations: 654 window groups
   spanning ≥3 files.
4. **Pairwise similarity** — per-file multiset of normalised statements, Jaccard over every pair
   inside each layer (Handlers, Services, Entities, Endpoints, Lib). This is what ranks the mirrored
   handlers below and what proves the *service* layer is **not** duplicated (next paragraph).
5. **Repeated string literals and constants** — every string literal of 4–80 characters grouped by
   occurrence count (`"23505"` ×39 in 20 files, `"application/problem+json"` ×20, `"Invalid tenant
   ID"` ×22, …), plus the repo's own analyzer set (`packages/lint-cs`), whose PUBLY0001–0012 rules
   already cover inline validation chains, uncached body getters, staff-handler service variants and
   namespace discipline. The build is 0 warnings on the base commit, so **no analyzer has an open
   finding to lead from** — the analyzers were used as a map of what the repo already considers a
   defect, not as a source of candidates.

The judgement the tools cannot make went in three directions:

- **the layer is the single owner** — `CursorPaginatedQuery`/`OffsetPaginatedQuery` *are* the
  pagination contract; the query-DTO getters in eight handlers are a copy of something the base
  class already owns, so the copy is the defect and the base class is the home.
- **two copies are two product surfaces** — `SuspendTenantUserAsStaff` (membership) and
  `SuspendTenantUserIdentityForStaff` (global identity) rhyme and are not the same operation;
  `PermissionFilter`/`TenantPermissionFilter` rhyme *and are* the same policy (class C).
- **the guide already sanctioned it** — `docs/guides/patchfield-pattern.md` prescribes a per-handler
  getter per clearable field, which is why B2 is inventory and not a fix.

Class definitions and default verdicts are the packet brief's:

| Class | Meaning | Default verdict |
|---|---|---|
| **A — duplicated type** | the same type/record/enum declared in ≥2 places | merge into one home |
| **B — duplicated pure helper** | the same function body (or trivially renamed) in ≥2 places | merge into one module |
| **C — mirrored handler/component** | a handler or filter copied across scopes/verbs, drifting already | merge only if the drift is not intentional |
| **D — duplicated constant/config** | the same list/map/literal repeated | merge into one source |
| **E — coincidental similarity** | looks alike, means different things | keep, say why |

## Inventory at a glance

| Class | Families | Fixed here | Deferred | Kept (E/intentional) |
|---|---|---|---|---|
| A — duplicated type | 6 | 0 | 6 | 0 |
| B — duplicated pure helper | 12 | **2** | 10 | 0 |
| C — mirrored handler/filter | 8 | 0 | 8 | 0 |
| D — duplicated constant/config | 6 | 0 | 6 | 0 |
| E — coincidental similarity | 8 | 0 | 0 | 8 |
| **Total** | **40** | **2** | **30** | **8** |

Weight, not count, is what matters. `B1` (71 copies of the authenticated-principal guard, already
drifted into six message spellings), `A1` (96 result unions, 311 members, 34 `NotFound` declarations)
and `C6` (ten RFC 7807 result classes that differ only in a status code) are worth more than the
other 37 entries combined. They are ranked accordingly.

The layer distribution is the survey's most useful single measurement:

| Layer | Files in layer | Files compared¹ | Pairs at ≥0.30 similarity | Top pair |
|---|---|---|---|---|
| Handlers | 161 | 136 | **197** (11 at ≥0.60, 5 at ≥0.70) | 0.88 — bulk suspend/reactivate tenant-user companies |
| Endpoints | 23 | 13 | 3 (0.30–0.34) | 0.34 — the two tenant-as-staff user endpoint files |
| Entities | 82 | 17 | 1 (0.40) | `JobQueueItem` / `JobDeadLetter` |
| Lib | 118 | 50 | 1 (0.52) | `PermissionFilter` / `TenantPermissionFilter` |
| **Services** | 67 | 59 | **0** | 0.225 — `StaffProfileAsStaffService` / `TenantProfileAsStaffService` |

¹ files with more than 40 normalised statements; a 20-line DTO or a one-handler endpoint file cannot
reach 0.30 Jaccard with anything and is compared only in the declaration/literal passes.

The service layer — the layer a reviewer expects to be the worst — shares at most 22 % of its
normalised statements with any other service, and that 22 % is EF query-idiom (`from … where …
select`, `FirstOrDefaultAsync`, null guards), not a copied algorithm. The duplication of this
codebase lives in **handlers** (the preamble/dispatch shape repeated per operation) and in **Lib**
(the RFC 7807 and permission machinery), not in the domain services.

---

## A — duplicated types

### A1 — the service result union, 96 times, with the pagination failures duplicated 30 times · **DEFER (highest-value A)**

| | |
|---|---|
| Files | 44 service files declare 96 `public abstract record *Result` unions carrying 311 nested `sealed record` members. The pagination pair is the reproducible part: `CursorNotFound` ×15 at `Modules/Publishing/Services/PublicationListService.cs:49` · `PublicationService.cs:153` · `Modules/Invitations/Services/InvitationService.cs:169,:179` · `Modules/Tenants/Services/TenantAsStaffService.cs:146` · `Modules/Posts/Services/PostService.cs:87` · `Modules/Profiles/Services/TenantProfileQueryAsStaffService.cs:30` · `StaffProfileQueryAsStaffService.cs:31` · `Modules/Users/Services/TenantUserQueryService.cs:16` · `TenantUserCompanyQueryService.cs:19` · `StaffUserQueryService.cs:21` · `Modules/SystemNotices/Services/SystemNoticeService.cs:65` · `Modules/SocialAccounts/Services/SocialAccountService.cs:25` · `Modules/AuditLogs/Services/TenantActivityQueryService.cs:24` · `AuditLogQueryService.cs:37`; `InvalidSortId` ×15 at the matching sites (`:171`, `:181`, `:149`, `:91`, `:32`, `:107`, `:31`, `:36`, `:20`, `:23`, `:25`, `:69`, `:27`, `:28`, `:41`). |
| What it means | Every `Find*` service invents its own discriminated union for the *same* three cursor-pagination outcomes — `Success`, `InvalidSortId(string SortId)`, `CursorNotFound(string Cursor)` — because C# has no way to compose two records into one union. The duplication is not cosmetic: 29 handler sites pattern-match `…Result.CursorNotFound` and 29 match `…Result.InvalidSortId`, each mapping to the same `TypedProblems.BadRequest("Invalid sort_id: …")` / `("Invalid cursor")`, and 33 sites end with `throw new InvalidOperationException("Unhandled result type")`. |
| Drift already present | `Modules/Publishing/Services/PublicationService.cs:153` declares `CursorNotFound()` **parameterless** while the other 14 carry `string Cursor`. Eight of the fifteen wrap the parameter across lines (`Modules/Tenants/Services/TenantAsStaffService.cs:146`, `Modules/Posts/Services/PostService.cs:87`, `Modules/Users/Services/{TenantUser,StaffUser,TenantUserCompany}QueryService.cs`, `Modules/SystemNotices/Services/SystemNoticeService.cs:65`, `Modules/AuditLogs/Services/{TenantActivity,AuditLog}QueryService.cs`); the rest are one-liners. Bare `NotFound` is declared as `record NotFound;` (16 spots) and as `record NotFound();` (18 spots) in the same tree. |
| Verdict | **defer** |
| Single home (to create) | `apps/api/Lib/Results/PaginationFailures.cs` — the two records shared by every cursor list, plus a `Failure → IResult` mapping helper (`PaginationFailures.ToProblem(failure)`). Per-domain unions stay where they are. |
| Why defer | A single record cannot derive from two unions, so sharing the *record* forces every union to either become an interface or expose the shared failure as a member of a common interface (`IPaginationFailure`) — a design decision with 29 handler call sites, not a rename. Doing it half-way (adding the shared records while leaving the 29 dispatch blocks) would add a fourth spelling of the same failure rather than remove one. |
| Fix sketch | 1) `Lib/Results/PaginationFailures.cs` with `public sealed record CursorInvalid(string Cursor) : IPaginationFailure;` and `SortIdInvalid(string SortId)`. 2) Each `Find*Result` union gains `: IPaginationFailure` on its two members (or replaces them with the shared records where the union is not serialized). 3) The 29 dispatch pairs collapse to one `if (failure is IPaginationFailure p) return PaginationFailures.ToProblem(p);` per handler. 4) `throw new InvalidOperationException("Unhandled result type")` stays — it is the exhaustiveness assertion, not duplication. |
| Risk | Medium. The unions are the compile-time contract between services and handlers, and `[ProducesResponseType]`-style OpenAPI metadata is derived from `Results<…>`; the shared interface must not change the *generic* result type parameters or the generated client changes shape. Do the pagination pair first, measure, and only then decide about the other 92 unions. |

### A2 — the cursor/offset pagination query types, and their validators · **DEFER**

| | |
|---|---|
| Files | `apps/api/Lib/CursorPaginatedQuery.cs` (66 lines) vs `apps/api/Lib/OffsetPaginatedQuery.cs` (72 lines); `apps/api/Lib/Validation/CursorPaginatedQueryValidator.cs` vs `OffsetPaginatedQueryValidator.cs`. A third partial copy lives at `Modules/Publishing/Handlers/Tenant/FindScheduledPublicationsForTenant.cs:42-53` (`GetLimit`). |
| What it means | `cursor` vs `page` is the only real difference. `Limit`, `SortId`, `SortOrder` properties are declared identically, and `GetLimit()` (`CursorPaginatedQuery.cs:33-45` / `OffsetPaginatedQuery.cs:17-29`) is character-identical, `GetSortId()` identical, `GetSortOrder()` identical (18 normalised lines each). The validators repeat three of their four rules verbatim — `limit`, `sort_id`, `sort_order`, same `PaginationPredicates` call and same message strings. |
| Verdict | **defer** |
| Single home (to create) | an abstract `PaginatedQuery` in `Lib` holding `Limit`/`SortId`/`SortOrder` + their three getters; `CursorPaginatedQuery` and `OffsetPaginatedQuery` keep only their discriminator (`cursor` / `page`). The validators get one `PagedQueryValidator<T>` base plus the discriminator rule. |
| Why defer | `[FromQuery]` binding on an inherited property works in minimal APIs, but the *wire contract* is exactly what these classes declare: a base class must not leak `sort_id`/`sort_order` into the scheduled-publications list, whose own doc comment (`FindScheduledPublicationsForTenant.cs:21-27`) rejects inheriting `CursorPaginatedQuery` for precisely that reason. The merge needs the base to be free of any wire name that a subclass would not want — i.e. it needs a decision about `cursor`/`page` living outside the base, which is a small design change with an OpenAPI diff. |
| Cost to fix | ~90 lines in two files, 3 duplicated rules in two validators, and one call site for the scheduled list. |
| Risk | Low mechanically; the OpenAPI document must be diffed (`apps/api/openapi.json` + `just generate-client`) because `[FromQuery]` property inheritance ordering determines parameter order in the generated client. |

### A3 — the bulk-action outcome record, three declarations · **DEFER**

| | |
|---|---|
| Files | `Modules/Profiles/Services/ProfileBulkActionResults.cs:11` (`BulkProfileActionResult`) + `:5` (`BulkProfileActionFailedItem`) vs `Modules/Users/Services/UserService.cs:61` (`BulkStaffUserActionResult`) + `:56` (`BulkStaffUserFailedItem`) vs `Modules/Invitations/Services/InvitationService.cs:80` (`BulkCreateTenantInvitationsResult`) + `:73` (`BulkCreateTenantInvitationsFailedItem`). |
| What it means | `(int SucceededCount, int FailedCount, List<TFailedItem> FailedItems)` declared three times, with `TFailedItem` always `(Guid Id, string Error|string Reason)` (+ `int Index` for invitations). Three service layers express the same bulk outcome, and the four handlers that return them (`BulkSuspendStaffUsers`, `BulkReactivateStaffUsers`, `BulkDeleteStaffUsers`, `Bulk*TenantProfilesAsStaff`, …) therefore return three near-identical response shapes. |
| Verdict | **defer** |
| Single home (to create) | `apps/api/Lib/Results/BulkActionResults.cs` — `BulkActionResult<TFailure>` + `BulkActionFailure(Guid Id, string Error)`. |
| Why defer | The generic type is new; making the invitations variant fit needs a decision about `Index` (a positional key, not an id), and `BulkProfileActionFailedItem` is already on the wire. |
| Risk | Low. These are plain DTO records; the only care is that `FailedItems` ordering and the `Index` field stay as they are, since the front renders "3 of 10 failed" from them. |

### A4 — `InvitationScope` ≡ `AccountScope`, and the invariant that guards them · **DEFER**

| | |
|---|---|
| Files | `Modules/Invitations/Entities/Invitation.cs:307-311` (`InvitationScope`) vs `Modules/Users/Entities/UserAccount.cs:280-284` (`AccountScope`) — both `Staff = 0, Tenant = 1, Project = 2`; `Invitation.ValidateInvitationType()` at `Invitation.cs:187-213` vs `UserAccount.ValidateAccountType()` at `UserAccount.cs:110-140` — the same three-case switch enforcing the same rule ("staff ⇒ no tenant/project id; tenant ⇒ tenant id, no project id; project ⇒ both"). |
| What it means | "Which scope is this row, and do its foreign keys agree" is one domain rule expressed on two rows with two enums and two validators, byte-identical apart from the enum name and the noun in each message. |
| Verdict | **defer** |
| Single home (to create) | one `EntityScope` enum (or `AccountScope` reused) in `Data`/`Lib`, plus `ScopeInvariants.Validate(scope, tenantId, projectId, string noun)`. |
| Why defer | Both enums are on the wire (`InvitationScope` appears in invitation payloads, `AccountScope` in auth payloads) and both are EF-mapped columns. Merging renames an OpenAPI enum and a `JsonStringEnumConverter` value, so it is an API-contract change, not a C# refactor. |
| Risk | High for the enum, low for the validator. The validator could be shared today with a `(int scope, Guid? tenantId, Guid? projectId, string noun)` signature and no contract change; the enum should stay split unless a deliberate contract migration is on the table. |

### A5 — the bulk-ids request body, 11 declarations and 20 identical rules · **DEFER**

| | |
|---|---|
| Files | 11 handler files declare a `[Required] public JsonElement XIds` body with a `GetXIds()` parser: `BulkSuspendStaffUsers.cs:16-34`, `BulkReactivateStaffUsers.cs:16-34`, `BulkDeleteStaffUsers.cs:16-34`, `BulkSuspendTenantsAsStaff.cs`, `BulkReactivateTenantsAsStaff.cs`, `BulkDeleteTenantsAsStaff.cs`, `BulkDeleteStaffProfiles.cs`, `BulkDeleteTenantProfilesAsStaff.cs`, `BulkRevokeStaffInvitations.cs`, `BulkRemoveTenantUsersAsStaff.cs`, `BulkRemoveTenantUserCompaniesForStaff.cs`. 20 validators call `MustBeRequiredGuidArray(fieldName:, itemName:, maxCount:)`. 15 handlers declare a `public List<Guid> Get*Ids()` used once in `Handle`. |
| What it means | "A body that is a JSON array of ids, validated as 1..100 guids, parsed to `List<Guid>`" is one meaning declared 11 times with three different nouns, and one validator call repeated 20 times with two string arguments. |
| Verdict | **defer** |
| Single home (to create) | `apps/api/Lib/Validation/BulkIds.cs` — `BulkIdsBody` (or `BulkIds` + a source-generated getter) with a companion `BulkIdsBodyValidator` base, keeping `[Required]`/OpenAPI metadata identical. |
| Why defer | The body type is what the OpenAPI schema and the generated Kiota client are built from; collapsing 11 top-level types into one shared type changes the generated TypeScript model names (`BulkSuspendStaffUsersBody` → `BulkIdsBody`), which is a client contract change for a cosmetic win. |
| Risk | Medium, and it is a client-shape risk, not a runtime one. If the generated client names matter (they do today: each body is a distinct model), the honest fix is the shared *validator* base only. |

### A6 — the cursor list `Find*Args` / `Find*Filters` records · **DEFER (low value)**

| | |
|---|---|
| Files | `Modules/Invitations/Services/InvitationService.cs:18-31` (`FindTenantInvitationsFilters`, `FindTenantInvitationsArgs`) · `:33-39` (`FindStaffInvitationsArgs`) · `Modules/Users/Services/StaffUserQueryService.cs` · `TenantUserQueryService.cs` · `Modules/Tenants/Services/TenantAsStaffService.cs:130-141` · `Modules/Posts/Services/PostService.cs` · `Modules/Profiles/Services/*QueryAsStaffService.cs` — one `Find*Args` per list endpoint, each repeating `Guid Cursor; int? Limit; string? SortId; SortOrder SortOrder` plus one domain filter record. |
| What it means | The paging prefix of every list argument is the same four members; only the filter shape differs. It is the argument-side twin of A2, and it inherits A2's fix. |
| Verdict | **defer** (fold into A2 — a shared `PagedArgs` record composed by each `Find*Args`) |
| Single home (to create) | `Lib/PagedArgs.cs` (`Guid Cursor`, `int? Limit`, `string? SortId`, `SortOrder SortOrder`), embedded as a property or flattened by each domain args record. |
| Risk | Low. These records are internal service contracts; nothing is serialized. The only cost is touching every `new Find*Args(...)` call site (~30). |

---

## B — duplicated pure helpers

Ranked by cost of leaving them.

### B1 — the authenticated-principal guard, 71 copies, already drifted into six spellings · **DEFER (highest-value B)**

| | |
|---|---|
| Files | 71 sites across 10 modules — Users 19, Profiles 11, Publishing 9, Posts 9, SocialAccounts 8, Jobs 5, Invitations 4, Tenants 3, SystemNotices 2, Uploads 1. Representative: `Modules/Invitations/Handlers/Staff/RevokeInvitationForStaff.cs:26-33`, `Modules/Invitations/Handlers/Staff/RevokeInvitationForTenantAsStaff.cs:27-33`, `Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs:386-392`, `Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs:280-287`, `Modules/Posts/Handlers/Tenant/FindPostsForTenant.cs:57-63`, `Modules/Posts/Handlers/Tenant/CreatePostForTenant.cs:96-102`, `Modules/Jobs/Handlers/Staff/RequeueDeadLetterForStaff.cs:73-79`. |
| What it means | Every staff handler re-asserts `authContext.AccountStaff is not null` and every tenant handler re-asserts `authContext.AccountTenant is not null`, throwing `InvalidOperationException` with an "impossible state" message that tells the next reader which middleware is missing. It is one invariant — *the endpoint is behind the permission filter, so the principal exists* — copy-typed 71 times. |
| Drift already present | 53 sites build the message across two lines (`"Staff account not found in auth context. "` + `"Ensure the endpoint has .WithPermission() middleware."`, and the tenant equivalent with `.WithTenantPermission(...)`), and 17 write it on one line with three different suffixes (9 × `".WithPermission()."`, 5 × `".WithPermission() middleware."`, 3 × `".WithTenantPermission(...) middleware."`). One outlier (`Modules/Profiles/Handlers/Staff/CreateStaffProfile.cs:190`, `"User ID not found in auth context"`) names a different field entirely. Three sites carry a `// IMPOSSIBLE STATE: Staff endpoint without staff account` comment and the other 68 do not. |
| Verdict | **defer** |
| Single home (to create) | `apps/api/Lib/Extensions/RequestAuthContextExtensions.cs` — `GetRequiredStaffAccount(this IRequestAuthContext)` / `GetRequiredTenantAccount(...)`, i.e. the same "safe accessor" shape as the existing `GetRequiredId()` (219 call sites) but for the principal. |
| Why defer | `IRequestAuthContext` exists (`Lib/RequestAuthContext.cs:5-18`) but has no safe accessor; the home is a new file in an existing concept, which the brief puts on the inventory side. |
| Fix sketch | Add the two extensions with the *longest* message (the two-line form — it is the one that names the right middleware for each scope). Replace 71 `var account = authContext.AccountStaff; if (account is null) { throw … }` blocks with `var account = authContext.GetRequiredStaffAccount();`. Mechanical: the variable is always named `account` or `staffAccount`/`tenantAccount`, and the throw is never caught. |
| Risk | Low at runtime (the branch is unreachable behind the filters) but not zero: the guard is the only defence if a future endpoint forgets `.WithPermission()`, and a shared accessor must throw the same exception type with a scope-appropriate message, or the failure becomes harder to diagnose. Do it module by module and keep `account is null` as the assertion in the accessor. |

### B2 — the `PatchField<T>` body-getter block, 8 handlers and 2 byte-identical private helpers · **DEFER (guide-sanctioned)**

| | |
|---|---|
| Files | 8 body DTOs, 25 field getters: `Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs:85-116` (8 getters + `_GetPatchFieldString`) · `Modules/Settings/Handlers/Tenant/UpdateTenantSettingsForTenant.cs:52-83` (7 + the same `_GetPatchFieldString`) · `Modules/Profiles/Handlers/Staff/UpdateStaffProfile.cs:24-110` (4 + `_GetClearableString` at `:87`) · `Modules/Profiles/Handlers/Staff/UpdateTenantProfileAsStaff.cs:26-107` (4 + the same `_GetClearableString` at `:84`) · `Modules/Users/Handlers/Staff/UpdateStaffUser.cs:21-62` · `Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs:42-90` · `Modules/Users/Handlers/Staff/UpdateTenantUserIdentityForStaff.cs:25-76` · `Modules/Account/Handlers/Tenant/UpdateAccountProfileForTenant.cs:24-74`. 188 `PatchField<…>` usages in the tree. |
| What it means | Each clearable PATCH field gets a hand-written `ValueKind` switch: `Undefined → Absent`, `Null → Set(null)` (or a throw when the field is required), `String → Set(GetValueAsString())`, the five non-string kinds → `InvalidOperationException`, `_ → ArgumentOutOfRangeException`. `_GetClearableString(JsonElement, string)` is **byte-identical** in the two profile handlers, and `_GetPatchFieldString(JsonElement)` is **byte-identical** in the two tenant handlers — the same helper reinvented twice and then copied once more. |
| Why it is not a defect | `docs/guides/patchfield-pattern.md` §"Layer 1" *prescribes* the per-handler getter and prints the switch as the template. The duplication is the documented pattern, so a fix must change the guide in the same commit or the next reader re-adds the copy. |
| Verdict | **defer** |
| Single home (to create) | `apps/api/Lib/PatchFieldExtensions.cs` — `PatchFieldString(JsonElement element, string fieldName, bool canClear, string? message = null)` and the same for Guid/DateTime; the guide's Layer 1 then reads `public PatchField<string?> GetIcon() => this.Icon.ToPatchFieldString(nameof(this.Icon), canClear: true);`. |
| Cost to fix | ~60 lines of new helper (home = `Lib/PatchField.cs`, where `PatchField<T>` already lives), 25 getter bodies → 25 one-liners, 2 private statics deleted, and the guide's Layer-1 snippet replaced. |
| Risk | Medium, and it is a *policy* risk: the three semantics (omit / clear / set) and the required-field throw must be expressible by the parameters, or the helper becomes a bug factory. The `Null → throw` case (`UpdateStaffProfile.GetName`) and the `Null → Set(null)` case (`GetDescription`) differ only by `canClear`, which is the right knob; the *messages* differ per field today, so the helper needs the field name and an optional message override. Note also that `docs/guides/patchfield-pattern.md`'s "Validator Pattern for Clearable Fields" section still teaches an inline `.Must(…).Must(…)` chain plus a private `_BeValidDateTimeOrUndefined`, which PUBLY0005 (`InlineFluentValidationChainAnalyzer`) forbids and `JsonElementRules` replaced — the guide's validator section is stale and should be corrected even if the getter merge is not done. |

### B3 — the cursor-parse precondition, 14 handlers · **DEFER**

| | |
|---|---|
| Files | 14 files contain `"Invalid cursor"`: `Modules/Users/Handlers/Staff/FindStaffUsers.cs:108-119`, `Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`, `Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs`, `FindInvitationsForTenantAsStaff.cs`, `Modules/Profiles/Handlers/Staff/FindStaffProfiles.cs`, `FindTenantProfilesAsStaff.cs`, `FindTenantProfileUsersAsStaff.cs`, `FindStaffProfileUsers.cs`, `Modules/Posts/Handlers/Tenant/FindPostsForTenant.cs:71-79`, `Modules/Jobs/Handlers/Staff/FindDeadLettersForStaff.cs`, `FindJobQueueItemsForStaff.cs`, `FindSystemJobDefinitionsForStaff.cs`, `Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs`, `FindTenantActivityForStaff.cs`. |
| What it means | `var cursor = q.GetCursor(); var cursorGuid = Guid.Empty; if (!string.IsNullOrEmpty(cursor)) { if (!Guid.TryParse(cursor, out cursorGuid)) { return TypedProblems.BadRequest("Invalid cursor", ResponseKeys.BadRequest); } }` — thirteen lines, fourteen times, byte-identical apart from the query variable name. `CursorPaginatedQuery.GetCursor()` (`Lib/CursorPaginatedQuery.cs:13-19`) returns the raw string through an identity `if (this.Cursor is null) return null; return this.Cursor;`, i.e. the class that owns the cursor deliberately does **not** parse it, so every handler does. |
| Verdict | **defer** |
| Single home | `apps/api/Lib/CursorPaginatedQuery.cs` — the class already exists and already owns the cursor; add `bool TryGetCursorId(out Guid cursorId)` (and `IResult? TryValidateCursor()`) so the "invalid cursor" problem is produced once. |
| Why defer | It is a new member on the base class rather than a new file, but it changes the *handler* shape for 14 handlers and would make `CursorPaginatedQuery` depend on `TypedProblems` (a `Lib` → `Lib` dependency, currently avoided). The lower-risk variant is a static `CursorParse.Validate(query)` helper in `Lib/Validation`, which is a new home. |
| Risk | Low. Note the empty-string case is deliberately not a failure (both `null` and `""` mean "first page"); a shared helper must preserve that, and must not silently accept `Guid.Empty` as a real cursor. |

### B4 — "is this a unique-constraint violation?", 12 classifiers and 39 `"23505"` literals · **DEFER**

| | |
|---|---|
| Files | Private classifiers: `Modules/Users/Services/AccountService.cs:620` and `Modules/Users/Services/CreateStaffUserService.cs:195` (both `_IsUniqueConstraintViolation`, same body incl. the `user_accounts` table-name check) · `Modules/Invitations/Services/InvitationAcceptanceService.cs:418` · `Modules/Tenants/Services/TenantAsStaffService.cs:604` · `Modules/Profiles/Services/TenantProfileAsStaffService.cs:850,:1058` · `Modules/Posts/Handlers/Tenant/AttachPostImageForTenant.cs:433`. Inline `when` filters re-expressing it: `Modules/Messaging/Services/EmailLogWriter.cs:179`, `Modules/Publishing/Services/PublishNowService.cs:243`, `PublicationRetryService.cs:132`, `PublicationStatusTransitionService.cs:445`, `RenditionService.cs:135`, `Modules/Permissions/Seeders/PermissionSeeder.cs:61,:76`, `Lib/Seeding/BulkSeeder.cs:55`. |
| What it means | 34 `catch (DbUpdateException …)` sites, 20 files, 39 occurrences of the SQLSTATE literal `"23505"`. Each site re-writes `ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505"` and, in about half, re-checks the constraint/table name with its own `OrdinalIgnoreCase` comparison. The classification is one meaning — *the INSERT lost a race against an existence check* — expressed twelve times in four different shapes (private static, inline `when`, table-name check, constraint-name check). |
| Verdict | **defer** |
| Single home (to create) | `apps/api/Lib/Utils/DbErrorUtils.cs` — `IsUniqueViolation(Exception ex, string? table = null, string? constraint = null)` + `const string UniqueViolationSqlState = "23505"`. `Lib/Utils` already houses `DateUtils`, `LikePatternUtils`, `CryptoUtils`; this is the same kind of leaf. |
| Why defer | The home does not exist; `Lib/Utils` has no DB-error utility today, so the fix creates the file the brief forbids creating. |
| Risk | Low mechanically, medium semantically: two sites check the *table* (`user_accounts`) and four check the *constraint* name, and the two are not interchangeable (`PostgresException.ConstraintName` is null when the violation is a primary-key conflict). A shared helper must offer both selectors and keep `SqlState` case-sensitive. |
| Note | `Lib/Seeding/BulkSeeder.cs:55` is the only site that already names the check in a sentence of its own, which is what a shared helper's doc comment should say. |

### B5 — query-DTO and body-DTO getters: search ×8, CSV status lists ×4, id arrays ×15 · **DEFER**

| | |
|---|---|
| Files | `GetSearchNormalized()` ×8 — `Modules/Users/Handlers/Staff/FindStaffUsers.cs:32`, `Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs:34`, `Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs:27`, `Modules/Posts/Handlers/Tenant/FindPostsForTenant.cs:22`, `Modules/Profiles/Handlers/Staff/FindStaffProfiles.cs:20`, `FindStaffProfileUsers.cs:33`, `FindTenantProfilesAsStaff.cs:21`, `FindTenantProfileUsersAsStaff.cs:34` (8-9 normalised lines each, identical: `null` → null, `Trim()`, empty → null). `GetStatusesOrNull()`/`GetLevelsOrNull()` ×5 — `FindStaffUsers.cs:41`, `FindTenantsAsStaff.cs:43`, `FindStaffInvitations.cs:20`, `FindInvitationsForTenantAsStaff.cs:35,:61` (split on `,`, trim, parse each, empty set → null). `Get*Ids()` body/query parsers ×15. `_ParseUserIds`/`_ParseUserAccountIds`/`_ParseProfileIds` ×3 — `Modules/Profiles/Handlers/Staff/ResolveStaffProfileUserAssignments.cs:20`, `ResolveTenantProfileUserAssignmentsAsStaff.cs:21`, `Modules/Users/Handlers/Staff/UpdateStaffUserProfiles.cs:21`. |
| What it means | "Trim-and-treat-empty-as-absent", "comma-separated enum set", and "JSON array of guids" are three parsing conventions, re-implemented in every list handler that needs them (this is the C# analogue of the TS survey's B2 `normalizeString`, 28 copies). The `GetSearchNormalized` family is *character-identical* in all 8 files; the status/level family differs only in the enum it parses. |
| Verdict | **defer** |
| Single home (to create) | `apps/api/Lib/Validation/QueryParsing.cs` (or extend the existing `PaginationPredicates` home with `ParseCsvSet<TEnum>(string? raw, Func<string, TEnum?> parse)` and `TrimToNull(string?)`). |
| Why defer | New home. The 8 `GetSearchNormalized` copies could be deleted today in favour of one `static` extension, but the enum-set and id-array variants each carry a `Func<…>` and the two bulk-id conventions (`List<Guid>` vs `IReadOnlySet<Guid>`) must not be collapsed silently. |
| Risk | Low. The trim convention is uniform and the parsers are pure; the only care is that the empty-set → `null` (not empty set) convention is preserved, because the services branch on `null` to mean "no filter". |

### B6 — the CSV formula-injection escaper, twice, in two export handlers · **DEFER**

| | |
|---|---|
| Files | `Modules/Users/Handlers/Staff/ExportTenantUsersAsStaff.cs:246-270` (`_EscapeCsv` + `_StartsWithFormulaTrigger`) vs `Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs:286-316` (the same two functions, same behaviour, same comment). |
| What it means | A **security control** — neutralise `=`, `+`, `-`, `@` after leading whitespace/control characters, then quote fields containing `"`/`,`/newline — written twice for the two CSV exports (tenant users, audit logs). This is the family where drift is a vulnerability, not a smell: a fix applied to one export (a new trigger character, a new bypass) leaves the other exploitable. |
| Verdict | **defer** |
| Single home (to create) | `apps/api/Lib/Utils/CsvUtils.cs` — `EscapeCsvField(string)` (which contains the formula-trigger scan) so the two exports cannot diverge. |
| Why defer | No CSV utility exists in `Lib/Utils`; the home is new. |
| Risk | Low mechanically (the two bodies are identical today), high in consequence if forgotten: pair the extraction with the two existing export specs so the formula-injection case is pinned once for both. |

### B7 — the provider payload string reader, four byte-identical copies · **FIXED**

| | |
|---|---|
| Files | `Modules/Publishing/Providers/MastodonPublishProvider.cs:425`, `Modules/Publishing/Providers/DiscordWebhookPublishProvider.cs:240`, `Modules/SocialAccounts/Providers/Discord/DiscordWebhookClient.cs:63`, `Modules/SocialAccounts/Providers/Mastodon/MastodonClient.cs:181` — four `private static string? _String(JsonElement payload, string name)` with **character-identical** bodies (8 lines: object check, `TryGetProperty`, string kind check, non-blank check, `?: null`), called 16 times. |
| What it means | "Read a non-blank string property out of a provider's JSON envelope, or null" — the exact accessor `Lib/Extensions/JsonElementExtensions.cs` exists to hold (it already holds `GetValueAsString`, `…OrNull`, `GetValueAsGuid…`, `GetValueAsInt32…`, `GetValueAsDateTime…`). Four provider clients could not see it because it was a private static in each. |
| Verdict | **merge** |
| Single home | `apps/api/Lib/Extensions/JsonElementExtensions.cs` — new `GetStringPropertyOrNull(this JsonElement payload, string name)` (line 260), guard-clause form of the same four checks. |
| Fix | The four private `_String` helpers are deleted; their 16 call sites become `body.GetStringPropertyOrNull("id")` etc.; `using PublyApp.Api.Lib.Extensions;` added to the four files. Five assertions added to `Lib/Extensions/JsonElementExtensions.Spec.cs` (present value, absent property, non-string, blank string, non-object payload) so the shared helper is pinned where it now lives. |
| Risk | Low. The bodies were identical before the change, the new helper preserves all four checks and returns the same `null`, and the provider specs (`MastodonPublishProvider.Spec.cs`, `DiscordWebhookPublishProvider.Spec.cs`, `MastodonClient.Spec.cs`) exercise the call sites. |

### B8 — `JsonElementExtensions`' nullable/duplicate overload pairs, 7 pairs · **FIXED**

| | |
|---|---|
| Files | `apps/api/Lib/Extensions/JsonElementExtensions.cs` — before: 16 methods where 14 came in 7 `JsonElement` / `JsonElement?` pairs, and each `JsonElement?` overload re-implemented the same `ValueKind` switch with `?.`/`.Value.` substituted: `GetValueAsString` (now `:9`/`:28`), `GetValueAsStringOrNull` (`:41`/`:47`), `GetValueAsBoolean` (`:67`/`:71`), `GetValueAsGuid` (`:91`/`:110`), `GetValueAsGuidOrNull` (`:126`/`:154`), `GetValueAsInt32OrNull` (`:184`/`:190`), `GetValueAsDateTimeOrNull` (`:226`/`:232`). |
| What it means | The nullable overload's *only* real difference is "an absent `JsonElement?` behaves like `Undefined`". Each copy therefore repeated the 8-arm switch (or the two-throw string/guid form) with the same messages, the same `ArgumentOutOfRangeException` fallback, and a slightly different `element?.ValueKind` in the exception argument. Two of the pairs (`GetValueAsStringOrNull`, `GetValueAsBoolean`) had *identical* semantics; two (`GetValueAsGuid`, `GetValueAsDateTimeOrNull`) differed only in which message a `Null`/`Undefined` produced. |
| Verdict | **merge** |
| Single home | the value-typed overload in the same file — the `JsonElement?` overload becomes a null-check plus a delegation. |
| Fix | 7 nullable bodies replaced by delegation (`element is null ? null : element.Value.X(propertyName)`), except `GetValueAsString` (`element is not { } value` → same throw) and `GetValueAsGuid` (keeps the `Null`/`Undefined → "is not a guid"` message before delegating, because the value overload says `"must be a guid"` there). The `[CallerArgumentExpression]` parameter is passed explicitly, so every exception message and its caller-expression still name the original call site. Net: 366 → 287 lines. |
| Risk | Low: no signature changed, no enum arm changed, and the property-name argument is forwarded. The one visible difference is that four unreachable `ArgumentOutOfRangeException` arms (`_ => …`) are gone from the nullable overloads — they were unreachable because all eight `JsonValueKind` values are covered, and the delegation still reaches the value overload's identical fallback. `JsonElementExtensions.Spec.cs` covers both `GetValueAsGuidOrNull` overloads (17 tests) and was green after the change. |

### B9 — staff-account creation re-implemented inside `CreateStaffUserService` · **DEFER**

| | |
|---|---|
| Files | `Modules/Users/Services/AccountService.cs:103-140` (`CreateStaffAccountAsync`) + `:227` (`HasStaffAccountAsync`) + `:340` (`HasTenantOrProjectAccountsAsync`) vs `Modules/Users/Services/CreateStaffUserService.cs:141-167` (`_CreateStaffAccountAsync`) + `:169` + `:182` + `:195` (`_IsUniqueConstraintViolation`). Both files are in the same folder and both return the **same** `CreateStaffAccountResult` record (`AccountService.cs:13-17`). |
| What it means | The staff/tenant mutual-exclusivity rule and the "insert a staff account, detach and report on a lost race" sequence exist twice. `CreateStaffUserService` cannot call `AccountService` because it owns its own transaction — the file says so (`CreateStaffUserService.cs:53-56`: "intentionally accepts the full user input and owns its own transaction so user+account writes and the verification-job enqueue commit atomically"). The *write* is genuinely different; the two read predicates and the error classifier are not. |
| Verdict | **defer** |
| Single home | the two predicates should be queries on the DbContext-scoped layer both services already share (an `IUserAccountQueries`-style leaf, or `static` extensions over `AppDbContext`), leaving each service its own transaction and its own insert. The classifier folds into B4. |
| Why defer | It needs a new leaf service (or a `Lib` extension over `AppDbContext`), and the repo forbids services depending on services — the correct home is a shared query extension, which does not exist. |
| Risk | Medium, and worth stating plainly: this is a *business rule* (a user is staff XOR tenant/project) with two implementations. A third account scope added to one copy and not the other would let an account violate the invariant. Fix it before touching either service again, and let the existing `CreateStaffUserService.Spec.cs` + `AccountService` callers prove behaviour is unchanged. |

### B10 — the upload handlers' two helper pairs · **DEFER (low value)**

| | |
|---|---|
| Files | `Modules/Posts/Handlers/Tenant/AttachPostImageForTenant.cs:244` (`_FormatBytes`) and `:250` (`_ValidationFailure`) vs `Modules/Uploads/Handlers/Staff/CreateStaffUpload.cs:111` (`_FormatBytes`) and `:114` (`_ValidationFailure`). |
| What it means | The two upload entry points each built the same "human-readable byte size for an error message" and the same "validation problem result with field errors" helper. Low volume (12 and 9 normalised lines), but `_ValidationFailure` is the builder of a 422 body, i.e. a contract-shaped helper in a handler. |
| Verdict | **defer** |
| Single home (to create) | `_FormatBytes` → `Lib/Utils` (there is no size formatter today); `_ValidationFailure` → `Lib/ProblemResults/TypedProblems.cs`, which is already the single home for problem construction. |
| Risk | Very low. `_ValidationFailure` should be the first of the two to move: it is the one whose drift would change a 422 payload. |

### B11 — service micro-duplications: three one-liner queries, three homes · **DEFER (low value)**

| | |
|---|---|
| Files | `Modules/Publishing/Services/PublishTargetService.cs:96` and `Modules/SocialAccounts/Services/SocialAccountService.cs:434` (`_LoadProjectLinksAsync`, 20 normalised lines, same include/projection); `Modules/Users/Services/UserService.cs:101` and `Modules/Users/Services/TenantUserIdentityService.cs:317` (`GetUserByEmailAsync`, 11); `Modules/Tenants/Services/TenantService.cs:23` and `Modules/Tenants/Services/TenantAsStaffService.cs:220` (`GetTenantByIdAsync`, 14). |
| What it means | Three "load this entity by its natural key, applying the same filters" queries, each implemented in two services of the same module. The `GetTenantByIdAsync` pair is the interesting one: the *staff* variant is the one that includes suspended tenants, and the pair is the reason `PUBLY0007` (StaffHandlerServiceVariantAnalyzer) exists — a staff handler that calls the base method silently hides suspended rows. |
| Verdict | **defer** |
| Single home (to create) | a per-module query extension (`Modules/Tenants/Services/TenantQueries.cs`), which is the same shape B9 needs. |
| Risk | Low mechanically; medium for the tenants pair, because "includes suspended" is a security-relevant difference that must be encoded in the method *name* (`GetTenantByIdIncludingSuspendedAsync` already exists at `TenantService.cs:37` — the base name is the trap). |

### B12 — sort/limit parsing lives in three places · **DEFER**

| | |
|---|---|
| Files | `Lib/Validation/PaginationPredicates.cs:11` (`BeValidNullableSort`) / `:36` (`BeValidNullableLimit`) — *validators*; `Lib/CursorPaginatedQuery.cs:47` (`GetSortOrder`) / `:33` (`GetLimit`) and `Lib/OffsetPaginatedQuery.cs:35` / `:17` — *parse*; `Modules/Publishing/Handlers/Tenant/FindScheduledPublicationsForTenant.cs:42` — a third `GetLimit` that deliberately does not inherit `CursorPaginatedQuery`. |
| What it means | "`sort_order` is `asc`/`desc`" and "`limit` is an int ≥ 1" are each expressed as a predicate (for the 422 path) and as a parse (for the 200 path), and the parse is written three times. The two formulations can disagree — `BeValidNullableSort` accepts `null` and is case-insensitive; `GetSortOrder` treats `null` as `Desc` and throws `ArgumentException` (which becomes a 500, not a 422) if the two ever diverge. |
| Verdict | **defer** |
| Single home | `Lib/Validation/PaginationPredicates.cs` — extend it from predicates to `TryParseLimit/TryParseSortOrder` returning the value, and have both query classes and the scheduled handler call it. |
| Risk | Low. This is the cheapest of the deferred items and the one with the clearest correctness payoff: one place decides what `sort_order` means, so the validator and the parser cannot drift. |

---

## C — mirrored handlers and components

### C1 — `PermissionFilter` and `TenantPermissionFilter`: one authorization policy, two files, self-documented mirror · **DEFER (highest-value C)**

| | |
|---|---|
| Files | `apps/api/Lib/Filters/PermissionFilter.cs` (215 lines) vs `apps/api/Lib/Filters/TenantPermissionFilter.cs` (176 lines). 67 normalised statements shared, Jaccard **0.52** — the highest cross-file similarity in `Lib`. |
| What it means | The same policy: both constructors (`Permission[]` and `Func<HashSet<string>, bool>`), the same argument validation, the same `InvokeAsync` skeleton — resolve the principal, throw if absent, **bypass for `AccountLevel.Admin`**, resolve effective permissions, early-return `Forbidden("User has no permissions")` when the set is empty, evaluate the custom checker or AND the required keys, then `Forbidden("User does not have the necessary permissions")`, with the same two `ResponseKeys.UserDoesNotHaveTheNecessaryPermissions`. Only three things differ: which principal (`AccountStaff` vs `AccountTenant`), the tenant's extra `TenantId` guard, and the permission service call (`GetPermissionsAsync(userId)` vs `GetTenantPermissionsAsync(userId, tenantId)`). The extension-method classes (`WithPermission` / `WithTenantPermission`, four overloads each) are also mirrored. |
| Drift admission, in the code | `TenantPermissionFilter.cs:50` contains a security comment that says it "mirrors the staff Admin bypass in PermissionFilter.cs:41-46" — a code-pointer comment is an acknowledgement that the two must be kept in sync by hand. |
| Verdict | **defer** |
| Single home | a shared `PermissionFilterBase` in the same folder: the ctor pair, the admin bypass, the two forbidden responses, and a template `InvokeAsync` calling three abstract members (`ResolvePrincipal`, `ResolvePermissions`, `GuardPrincipal`) implemented by the two subclasses. The wire behaviour, the filter registration and both `.WithXPermission` extension sets stay where they are. |
| Why defer | The merge touches **authorization** on every staff and tenant route, and the two filter classes have their own specs (`TenantPermissionFilter.Spec.cs`; the staff filter is covered indirectly). A mistake here is a security regression, so it needs its own packet with the specs as the proof, not a ride-along on a survey. |
| Risk | Medium-high. The permissions are resolved through two different service methods with different profile-derived semantics (`GetPermissionsAsync` vs `GetTenantPermissionsAsync`), and the tenant filter adds the `TenantId` guard whose absence is a cross-tenant leak. Extract mechanically, keep both classes' public surface and both specs green, and do not "unify" the two permission-service calls. |

### C2 — the suspend/reactivate/delete handler families · **DEFER**

| | |
|---|---|
| Files (pair, Jaccard) | `Modules/Users/Handlers/Staff/BulkSuspendTenantUserCompaniesForStaff.cs` ↔ `BulkReactivateTenantUserCompaniesForStaff.cs` **0.88** · `Modules/Profiles/Handlers/Staff/UnassignTenantProfilePermissionAsStaff.cs` ↔ `AssignTenantProfilePermissionAsStaff.cs` **0.87** · `AssignTenantProfileUserAsStaff.cs` ↔ `UnassignTenantProfileUserAsStaff.cs` **0.78** · `Modules/Users/Handlers/Staff/BulkSuspendStaffUsers.cs:45-84` ↔ `BulkReactivateStaffUsers.cs:45-84` **0.74** (39 identical body lines — guard, `GetUserIds`, service call, `logger.IsEnabled` + `LogInformation`, `auditLogService.LogAsync` with the same `Details` anonymous object, `TypedResults.Ok`) · `Modules/Users/Handlers/Staff/SuspendTenantUserAsStaff.cs` ↔ `ReactivateTenantUserAsStaff.cs` **0.73** · `ReactivateTenantUserIdentityForStaff.cs` ↔ `SuspendTenantUserIdentityForStaff.cs` **0.68** · `Modules/Tenants/Handlers/Staff/BulkReactivateTenantsAsStaff.cs` ↔ `BulkDeleteTenantsAsStaff.cs` **0.68** · `SuspendStaffUser.cs` ↔ `ReactivateStaffUser.cs` **0.68** · `Modules/Invitations/Handlers/Staff/RevokeInvitationForStaff.cs` ↔ `RevokeInvitationForTenantAsStaff.cs` **0.67**. |
| What it means | Every reversible lifecycle operation is written twice — once per direction — and each copy differs from its twin in exactly four places: the service method name, the audit action constant, the log sentence, and (sometimes) the success payload type. This is the single largest family in the codebase by volume: 11 pairs at ≥0.60, all of them in `Handlers/Staff`. |
| Verdict | **defer** |
| Single home (to create) | a per-operation-shape helper in the handler layer — e.g. `LifecycleHandler.RunAsync(service, auditAction, logSentence, …)` — or, more honestly for the bulk pair, one parameterised handler per domain with an enum direction. |
| Why defer | The four differing values are exactly the product decision (which audit action is emitted matters to the audit trail), and the handlers are `static async Task<Results<…>>` entry points referenced by `MapPost(…, X.Handle)`; collapsing them changes the endpoint surface or invents a delegate layer. |
| Risk | Medium. The audit action and log sentence are the *reason* the copies exist; a generic runner must take them as parameters, not infer them. The 0.88 pair (bulk suspend/reactivate tenant-user companies) is the safest first experiment: same request shape, same response type, same audit target. |

### C3 — `UpdateStaffProfile` and `UpdateTenantProfileAsStaff`: body, validator and getters identical · **DEFER**

| | |
|---|---|
| Files | `Modules/Profiles/Handlers/Staff/UpdateStaffProfile.cs` (206 lines) vs `UpdateTenantProfileAsStaff.cs` (284 lines), Jaccard **0.55**, 108 shared normalised statements. |
| What it means | `UpdateStaffProfileBody` and `UpdateTenantProfileAsStaffBody` declare the same four `JsonElement` fields and the same four `PatchField` getters (B2), including the byte-identical `_GetClearableString`; their validators declare the same four rules with the same arguments (`MustBePatchFieldStringWithLength("Name", 2, 100, trim: true)`, `…MaxLength("Description", 500, trim: true)`, `…InSet("Icon", ProfileStyleValidationRules.Icons)`, `…InSet("Tone", …Tones)`); both handlers then run the same "no fields to update" guard. Only the route scope, the audit block and the response type differ — the tenant copy additionally builds a `changedFields` dictionary for the audit log (nothing else in the tree does, so it is not itself a family). |
| Verdict | **defer** (the *component* merge is wrong; the body/validator merge is right) |
| Single home | one `UpdateProfileBody` + `UpdateProfileBodyValidator` in `Modules/Profiles/Validation`, imported by both handlers; the two handlers keep their own route plumbing and audit. The handlers legitimately differ (tenant profile updates are audited with a field diff, staff profile updates are not). |
| Why defer | The body type is on the wire and named in the generated client for both endpoints; sharing it changes two OpenAPI model names. That is the same objection as A5, and it is the reason the TS survey's C4 ("keep the two drawers, extract the schema") is the right precedent — here the schema is the body DTO, and it is the *client-visible* part. |
| Risk | Low runtime risk, medium review risk: two endpoints whose bodies are the same type is a contract simplification that the owner should approve once for all four profile/user PATCH bodies, not per handler. |

### C4 — the four identity/profile update handlers · **DEFER (with C3)**

| | |
|---|---|
| Files | `Modules/Users/Handlers/Staff/UpdateStaffUser.cs:21-62`, `UpdateTenantUserAsStaff.cs:42-90`, `UpdateTenantUserIdentityForStaff.cs:25-76`, `Modules/Account/Handlers/Tenant/UpdateAccountProfileForTenant.cs:24-74`. |
| What it means | Four handlers update "the person's name/avatar", all four declaring the same three getters (`GetFirstName`, `GetLastName`, `GetAvatarUrl`) with the same semantics — 13 getter copies for three fields — and the same "no fields to update" guard. Two of them (`UpdateTenantUserAsStaff`, `UpdateTenantUserIdentityForStaff`) are the *same operation* offered at two route scopes (tenant membership vs global identity, see E6), which is why the getter family is four-wide. |
| Verdict | **defer** (the getters fold into B2's `PatchFieldExtensions`; the handlers stay) |
| Single home | `Lib/PatchFieldExtensions` (B2) for the getters; no handler merge. |
| Risk | Low. This entry exists so that B2's fix is scoped correctly: the 13 getters are spread over four handlers, two of which are deliberate scope twins. |

### C5 — the six cursor-paginated list handlers · **DEFER**

| | |
|---|---|
| Files | `Modules/Users/Handlers/Staff/FindStaffUsers.cs` (172 lines), `Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs` (177), `Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs` (228), `Modules/Profiles/Handlers/Staff/FindTenantProfilesAsStaff.cs` (115), `Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs` (259), `Modules/Jobs/Handlers/Staff/FindDeadLettersForStaff.cs` (129). |
| What it means | Every list endpoint repeats the same seven-step sequence: query DTO extending `CursorPaginatedQuery` → `GetSearchNormalized` + a status/level CSV getter → a validator extending `CursorPaginatedQueryValidator<T>` with an allowed-value set → cursor precondition (B3) → five `Get*()` calls → the `Find*Args` record (A6) → dispatch on the union (A1) with the same `InvalidSortId`/`CursorNotFound` mapping. What differs is genuine: the filters, the columns, the sort specs. |
| Verdict | **defer** (the *parts* are A1, A2, A6 and B3/B5; the *sequence* is the architecture) |
| Single home | no new handler abstraction. Resolve A1/A2/A6/B3/B5 and this entry shrinks without a `ListHandler` base class. |
| Why not a `ListHandler<T>` | The repo's list-page guide (`docs/guides/list-pages-search-filter-cursor-pagination.md`) deliberately keeps the filter/column/action decisions at the slice; a generic list handler would move 15 lines of sequence into a base class and take the filter wiring with it. |
| Risk | Low, because the recommendation is *not* to build the abstraction. |

### C6 — the RFC 7807 result family: ten classes, ten factories, one meaning · **DEFER (highest-value C by line count)**

| | |
|---|---|
| Files | `apps/api/Lib/ProblemResults/App*HttpResult.cs` ×10 (`AppBadRequest`, `AppUnauthorized`, `AppForbidden`, `AppNotFound`, `AppConflict`, `AppPayloadTooLarge`, `AppValidationProblem`, `AppTooManyRequests`, `AppProviderUnavailable`, `AppInternalServerError`; 38–50 lines each, 735 lines for the folder including `TypedProblems.cs` 208 and the two metadata types). |
| What it means | Nine of the ten classes are the same class: a private `AppProblemDetails` field, a `sealed` ctor, an `ExecuteAsync` that sets `Instance`, writes `traceId`, sets `StatusCode` + `ContentType = "application/problem+json"`, `WriteAsJsonAsync`, and a `PopulateMetadata` that adds `ProducesAppProblemMetadata(<the one status code>)`. The only per-class data is the **status code**; the tenth, `AppValidationProblemHttpResult`, is the same skeleton carrying `ValidationProblemDetails` and emitting `ProducesValidationProblemMetadata` instead of a per-status `ProducesAppProblemMetadata`. `TypedProblems.cs` then repeats the same 15-line factory body ten times, again with only the status code and default title changing. |
| Verdict | **defer** — but this is the family to fix first after the survey |
| Single home | `Lib/ProblemResults/AppProblemHttpResult.cs` — one `sealed class AppProblemHttpResult : IResult, IEndpointMetadataProvider` taking `(int statusCode, AppProblemDetails details, IReadOnlyDictionary<string,string[]>? errors = null, int? retryAfterSeconds = null)`, plus `ProducesAppProblemMetadata` parameterised by the status code it already takes. `TypedProblems.BadRequest/NotFound/…` stay as the public API (generated call sites depend on their return types for `Results<…>`), each becoming a one-line `new AppProblemHttpResult(StatusCodes.Status404NotFound, …)`. |
| Why defer | The per-status `App*HttpResult` **types** appear in every handler's `Results<Ok<T>, AppBadRequestHttpResult, …>` signature — that is the OpenAPI metadata mechanism, and collapsing ten types into one changes how `ProducesAppProblem` metadata is emitted if not done exactly. It is a mechanical change but it touches ~90 handler signatures. |
| Cost to fix | one new class + ten thin subclasses (or ten `ProducesAppProblem(…)` call sites), seven `ExecuteAsync` bodies deleted, ten factory bodies → ten one-liners; ~250 lines removed with no contract change *if* the subclasses are kept as named types. |
| Risk | Medium. The invariant that must not move: `401` only for invalid session (frontend logs out on it), `422` must carry `errors`, `traceId` must be on every problem body. Keep the ten names, delete the ten bodies: that is the low-risk 80 % (a `protected` base `ExecuteAsync` + a per-class `StatusCode` constant), and it needs no handler change at all. |

### C7 — `ServiceRegistration` and `ServiceValidator` private helpers · **DEFER (low value)**

| | |
|---|---|
| Files | `Lib/ServiceRegistration.cs:407` and `Lib/DI/ServiceValidator.cs:205` — the same `private static Type _GetRequiredServiceInterface(DiscoveredService)` (9 lines, same exception message); `ServiceValidator.cs:215` adds `_GetRequiredServiceKey`, `ServiceRegistration` reaches for the interface one from `:382` and `:388`. |
| What it means | Two files in `Lib`/`Lib/DI` validate the same `[Service]` discovery output and each holds its own "the interface must be resolved" assertion. |
| Verdict | **defer** |
| Single home | a method on `DiscoveredService` itself (`service.RequiredInterface()`) — the record already carries the nullable field, so the assertion belongs to it. |
| Risk | Very low. Rank last: the failure mode is a duplicated exception message, not a behaviour difference. |

### C8 — the staff and tenant invitation email job handlers · **DEFER**

| | |
|---|---|
| Files | `Modules/Invitations/Jobs/StaffInvitationEmailJobHandler.cs` (83 lines) vs `TenantInvitationEmailJobHandler.cs` (94 lines) — `diff` after normalising the scope noun is 6 hunks: one `Include(i => i.Tenant)`, one extra `tenant_missing` eligibility branch, and the template call's extra arguments. |
| What it means | Two `EmailJobHandlerBase<TPayload>` subclasses that override the same two members (`PrepareAsync`, `ResolveTerminalIdentityAsync`) and both re-assert the **same four-part eligibility predicate** — `invitation.IsDeleted \|\| invitation.IsRevoked() \|\| invitation.IsAccepted() \|\| invitation.IsExpired(DateTime.UtcNow)` (`StaffInvitationEmailJobHandler.cs:53-56`, `TenantInvitationEmailJobHandler.cs:55-58`). |
| Verdict | **defer** (the handlers stay; the predicate moves) |
| Single home | `Modules/Invitations/Entities/Invitation.cs` already owns `CanBeAccepted()`, `IsPending()`, `IsAccepted()`, `IsRevoked()`, `IsExpired(utcNow)` — add `IsEligibleForDeliveryEmail(DateTime utcNow)` and have both handlers call it. |
| Why defer | It is a one-method addition to an existing entity, but the two handlers also carry the deliberate payload differences (tenant name, account level, template signature), so the family is inventory: extract the predicate, not the handler. |
| Risk | Low. The predicate is an *eligibility gate for a queued email*; a divergence between the staff and tenant flows means one of them can email a revoked invitation. Extracting it is a correctness improvement, not just tidiness. |

---

## D — duplicated constants and config

### D1 — the permission declaration chain, 105 times in 25 files · **DEFER**

| | |
|---|---|
| Files | 25 `Modules/*/Permissions/*.cs` files; 105 `this.VERB = Permission` assignments; 211 `.SetTranslation(...)` calls. Example: `Modules/Posts/Permissions/PostPermissionsForTenant.cs:14-115` (six permissions × ~17 lines). |
| What it means | Each permission repeats the same five-part chain: `Permission.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { this.KeyPrefix, "view" }))` → `.SetTranslation(English, new PermissionTranslation { Name, Description })` → `.SetTranslation(French, …)`. Two of those three parts are pure duplication of what `Permission` already does: `CreateTenantPermission` (`Modules/Permissions/Entities/Permission.cs:96-110`) already joins the scope prefix and **already accepts a `Dictionary<string, PermissionTranslation>`** (`:98`), so the `string.Join(KeySeparator, …)` and the two chained `SetTranslation` allocations are the caller re-implementing the factory. Only the EN/FR strings are data. |
| Verdict | **defer** |
| Single home | `Modules/Permissions/Entities/Permission.cs` — `Permission.Tenant(string keyPrefix, string verb, string nameEn, string descriptionEn, string nameFr, string descriptionFr)` (and the Staff/Tenant/Project variants), i.e. one call per permission instead of a 17-line chain. |
| Why defer | 105 call sites × 25 files is a large mechanical diff whose only value is line count at the declaration site; the *keys* are already single-sourced (they are built from `KeyPrefix` + verb, and `AppPermissions` (`Lib/AppPermissions.cs`) only instantiates the classes — no second key list exists). |
| Risk | Low. The wire keys must stay `tenant.<prefix>.<verb>` and the translations must stay byte-identical; the factory's `ToLowerInvariant()` is already applied. Note the repo already prefers the derive-don't-duplicate direction: `AuditActionsRegistry` (`Modules/AuditLogs/Entities/AuditActionsRegistry.cs:10-25`) reflects over `AuditActions` precisely so a new constant needs no second registration — that is the model to follow here. |

### D2 — the route constant and its `*Fn` twin, 87 pairs · **DEFER**

| | |
|---|---|
| Files | 87 `static string *Fn(…)` helpers across 16 `Modules/*/Routes.*.cs` files; example `Modules/Posts/Routes.Posts.cs:21-38`: `public const string GetById = "/{postId}"` immediately followed by `public static string GetByIdFn(string postId) { return $"/{postId}"; }`, then the same pair for `Update`, `Delete`, `AttachImage`. |
| What it means | The same route template is written twice per operation — as a `const` for `MapGet` and as an interpolated function for building a URL (audit links, `Location` headers, emails). The two spellings must stay in sync, and nothing checks that `GetByIdFn` interpolates the same shape as `GetById`. |
| Verdict | **defer** |
| Single home | the existing pair can collapse to one declaration: `public static string GetById(string postId) => $"/{postId}";` plus `MapGet(Routes.Posts.ForTenant.GetById("{postId}"), …)`-style usage — or keep the const and derive the function (`GetById.Replace("{postId}", postId)`) so the template exists once. |
| Why defer | 87 pairs across 16 files, and the route constants are consumed by endpoint mapping in ~90 places; the mechanical change is large and the drift it prevents is caught at runtime (a wrong `Location` header) rather than at compile time today. |
| Risk | Low per pair, medium in aggregate: a wrong replacement breaks a redirect or an audit link silently. Do it one module per commit, with the endpoints' own specs. Also note these 16 files all sit under `Modules/*/` but declare `namespace PublyApp.Api.Lib.Routes`, which is why each carries `#pragma warning disable IDE0130` (`Modules/Posts/Routes.Posts.cs:1`) — the same suppression, 16 times (see D6). |

### D3 — `"application/problem+json"` in 20 files · **DEFER**

| | |
|---|---|
| Files | 20 production files contain the literal, including all ten `Lib/ProblemResults/App*HttpResult.cs`, `Lib/Extensions/CustomExceptionHandler.cs`, `Lib/Extensions/OpenApiExtensions.cs`, `Lib/Extensions/ResponseCompressionExtensions.cs`, `Lib/Filters/CheckSessionHeaderFilter.cs`, and the endpoint metadata helpers. |
| What it means | The RFC 7807 media type is a contract value written out at every place that produces or recognises a problem response. One typo in one file silently changes a content type. |
| Verdict | **defer** |
| Single home | `Lib/ProblemResults/AppProblemDetails.cs` (or a `ProblemMediaTypes` static) — `public const string ContentType = "application/problem+json";`, referenced everywhere. This one is genuinely cheap and should ride along with C6. |
| Risk | Very low. Only strings move; no behaviour can change. |

### D4 — EF configuration literals: `"is_deleted = false"` ×7, `"now()"` ×8, `"uuidv7()"` ×7 · **DEFER**

| | |
|---|---|
| Files | e.g. `Modules/Posts/Entities/PostMediaAssetConfiguration.cs:12` and `PostSegmentConfiguration.cs:12` (`HasFilter("is_deleted = false")`), `Modules/Publishing/Entities/PublicationSegmentResultConfiguration.cs`, `Modules/Jobs/Entities/*Configuration.cs` (`now()`, `uuidv7()`), `Data/DbContext/AppDbContext.cs` (`uuidv7()`). |
| What it means | The soft-delete filter predicate and the two Postgres default expressions are written as literals in every `IEntityTypeConfiguration` that needs them. A change to the soft-delete convention (e.g. adding a temporal predicate) means editing seven files. |
| Verdict | **defer** (low value, and see E1) |
| Single home | `Data/` — `public const string LiveRowsFilter = "is_deleted = false";`, `UuidV7Default`, `NowDefault`. |
| Why defer | The strings are compile-time constants inside EF configuration classes; extracting them is safe but the payoff is small and `Migrations/` snapshot text must not change (it will not — these literals feed the model, and the same string produces the same model). |
| Risk | Low, with one trap: the exact filter string appears in generated migration SQL snapshots, so any whitespace change would look like a schema change to the expand/contract gate. Keep the constants byte-identical to today's literals. |

### D5 — the endpoint operation name, written twice in 86 mappings (73 of them identical) · **DEFER**

| | |
|---|---|
| Files | 24 `Modules/*/Endpoints/*.cs` files, 86 `Map{Verb}(Routes.…, Handler.Handle)` mappings; 73 of them follow with `.WithName("Handler")` where the string is **exactly** the handler class name (`Modules/Posts/Endpoints/PostEndpointsForTenant.cs:33-34` → `CreatePostForTenant.Handle` / `.WithName("CreatePostForTenant")`). The 13 that differ are all in `Modules/Tenants/Endpoints/TenantEndpointsForStaff.cs`, where the operation name is deliberately shorter than the handler (`CreateTenantAsStaff` → `WithName("CreateTenant")`). |
| What it means | The operation id — which becomes the generated Kiota client's method name — is declared once as the handler type and once as a string literal. Renaming a handler leaves the literal behind, and nothing catches it. |
| Verdict | **defer** |
| Single home | `nameof` — `.WithName(nameof(CreatePostForTenant))`. For the 13 deliberate cases the literal must stay: the shorter tenant operation names are a client-contract decision, not an accident. |
| Why defer | 73 edits across 20 files; zero runtime risk but a large diff whose only guarantee is "the string equals the type name". It is a good `dotnet format`-style follow-up, not part of a survey. |
| Risk | None if done with `nameof` (the resulting string is identical). Do **not** "normalise" the 13 differing names — that would rename public client methods. |

### D6 — the same suppression, sixteen times: `#pragma warning disable IDE0130` · **DEFER (report as adjacent evidence)**

| | |
|---|---|
| Files | 16 `Modules/*/Routes.*.cs` files begin with `#pragma warning disable IDE0130 // Namespace does not match folder structure` / `namespace PublyApp.Api.Lib.Routes;` / `#pragma warning restore IDE0130` (e.g. `Modules/Posts/Routes.Posts.cs:1-3`). |
| What it means | Not a semantic duplication of code, but a duplicated *decision*: sixteen files chose the same exception to the repo's namespace/folder rule (IDE0130 is `WarningsAsErrors` in `Directory.Build.props:16`). The single home for the rule's exception would be the file location (`apps/api/Lib/Routes/Posts.cs`), not sixteen identical pragma triples. |
| Verdict | **defer** — recorded because the packet forbids adding pragmas and this is where they already are. Nothing in this survey adds or removes one. |
| Single home | move the sixteen files under `Lib/Routes/` and delete the pragmas; `just`/CI need no change because the route constants are referenced by `using PublyApp.Api.Lib.Routes;`. |
| Risk | Low, but not free: the move renders every `docs/`/code comment that names `Modules/<X>/Routes.<X>.cs` stale (the doc-links guard exempts `docs/records/` but not guides). Do it as a pure `git mv` with no content change. |

---

## E — coincidental similarity (keep, with the reason)

| # | Files | Why it is *not* duplication |
|---|---|---|
| E1 | `Modules/Posts/Entities/PostSegmentConfiguration.cs` and `PostMediaAssetConfiguration.cs` (28 normalised lines shared, both `IEntityTypeConfiguration<PostChild>`) | The two tables are different (segments vs media assets) and the configuration is EF's own required per-entity boilerplate. A generic `ConfigurePostChild<T>` would need reflection or expression-tree surgery to keep the `HasDatabaseName`/`HasFilter` literals, and the entity pipeline (`PostSegment` vs `PostMediaAsset`) is where the differences will grow. Keep; the *literals* are D4. |
| E2 | The 16 `Routes.*.cs` partial classes with nested `ForStaff`/`ForTenant` classes (`Routes.Posts.ForTenant.Create`, …) | This is the module-contributes-to-one-partial-class pattern the routing guide prescribes (`Lib/Routes/Routes.cs:1-14` is the anchor). The nesting is the route taxonomy; merging the nested classes would flatten the scope split that the conventions require. Keep (D6 covers the one wart, the pragma). |
| E3 | The 25 `*PermissionsFor*` classes (`PostPermissionsForTenant`, `AnalyticsPermissionsForTenant`, …) | Same shape, different data: every file is a distinct slice's permission catalogue with distinct EN/FR copy. The shared part is the chain (D1); the *content* is the slice's own product surface. Merging the classes into one table would move 105 permission declarations into a single 2 000-line file and lose the per-slice `KeyPrefix` type-safety. |
| E4 | The enum→wire formatters: `Modules/Posts/Entities/Post.cs:53` (`PostWire.FormatStatus`), `Modules/SocialAccounts/Services/SocialAccountService.cs:99` (`SocialAccountWire.FormatStatus`) and `:107` (`FormatCredentialType`), `Modules/Publishing/Entities/PublicationFailureCategory.cs:30` (`Format`), `Modules/Publishing/Entities/Publication.cs:53` (`FormatStatus`), `Modules/Publishing/Lib/PostStatusDerivation.cs:32` (`FormatPostStatus`), `Modules/Invitations/Entities/Invitation.cs:256` (`GetPersistedStatusDescription`), `Modules/Tenants/Entities/Tenant.cs:60` (`GetStatusDescription`) | Each is an exhaustive `switch` over one enum returning the snake_case wire value (`fix_content`, `retry_later`, `needs_reconnect`). A generic `Enum → wire` mapper would need `ToLowerInvariant()`, which the repo forbids as a dispatch strategy (`PUBLY0003`) and which would also produce `fixcontent` for multi-word values. The exhaustiveness is the point: adding an enum member is a compile-time error at the formatter. Keep. |
| E5 | `ResolveTerminalIdentityAsync` overrides at `Modules/Invitations/Jobs/StaffInvitationEmailJobHandler.cs:58`, `TenantInvitationEmailJobHandler.cs:64`, `Modules/Auth/Jobs/PasswordResetEmailJobHandler.cs:54`, `EmailVerificationEmailJobHandler.cs:66`, `Modules/Profiles/Jobs/StaffJoinedNotificationEmailJobHandler.cs:49` | `EmailJobHandlerBase<TPayload>` (`Modules/Messaging/Jobs/EmailJobHandlerBase.cs:109`) declares it abstract; each override loads a *different* entity (invitation, session, user) through a different query. The base class already owns the shared lifecycle (the single home exists); the 8-line overrides are the payload-specific read. Keep. |
| E6 | `Modules/Users/Handlers/Staff/SuspendTenantUserAsStaff.cs` vs `SuspendTenantUserIdentityForStaff.cs` (and the reactivate pair) — 0.53 similar | Two product surfaces: the first suspends a *tenant membership* (tenant route scope, membership service, membership audit), the second suspends the *global identity* (staff route scope, `ITenantUserIdentityService`, identity audit) and returns the full user details. Same verb, different guarantees and different blast radius. Keep — and note the pair is exactly why C2 should not be merged across scopes. |
| E7 | The named paged responses: `FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }` (`FindStaffUsers.cs:25`), `FindTenantsAsStaffResponse`, `FindStaffProfilesResult`, `FindTenantProfilesAsStaffResult`, `FindStaffInvitationsResult`, `FindInvitationsForTenantAsStaffResult` | Empty subclasses of a generic — which normally *is* duplication — but here they are the named model the OpenAPI generator and the Kiota client need (a generic type is emitted as an anonymous `{items, nextCursor}`, and `docs/guides/openapi-kiota-safeguards.md` records the generic-types bug). The subclass is one line and its name is the wire name. Keep. |
| E8 | `Lib/ServiceRegistration.cs:31` (`_GetCurrentTenantId`) vs `Lib/Testing/Fixtures/ApiFactory.cs:127` (the same 14-line helper) | The fixture deliberately rebuilds the request-pipeline steps the app performs (read the tenant header, parse it, return null on anything else) so an integration test exercises the same header contract rather than importing the production branch. Importing the helper would make the test pass by construction. Keep — it is the one place where a copy is the *point*. |

---

## The three non-type duplications worth the most

1. **B1 — the authenticated-principal guard, 71 copies, four drifted messages.** One invariant
   ("the endpoint is behind the permission filter, so the principal exists") re-typed in every
   handler, with the drift already visible: two-line vs one-line, `.WithPermission().` vs
   `.WithPermission() middleware.` vs `.WithTenantPermission(...) middleware.`, and nine sites that
   keep an `// IMPOSSIBLE STATE` comment while 62 do not. Fix sketch: `GetRequiredStaffAccount()` /
   `GetRequiredTenantAccount()` on `IRequestAuthContext` (the same shape as the existing, 219-times-used
   `GetRequiredId()`), then 71 mechanical replacements, module by module.

2. **C6 — the RFC 7807 result family: ten classes and ten factories for one status code.**
   `App*HttpResult.ExecuteAsync` is the same fifteen statements in nine of the ten files; `TypedProblems`
   repeats the same fifteen-line factory ten times. Fix sketch: keep the ten public type names (they are
   in ~90 `Results<…>` signatures and in the OpenAPI metadata) and move their bodies into one
   `AppProblemHttpResult` base plus a per-class `StatusCode`; the 250 deleted lines change nothing
   observable. Fold D3's `"application/problem+json"` constant in at the same time.

3. **C1 — `PermissionFilter` and `TenantPermissionFilter`, the authorization policy twice.** 0.52
   Jaccard, 67 shared normalised statements, and the tenant file's own comment says it "mirrors the
   staff Admin bypass in PermissionFilter.cs:41-46" — a manual-sync comment on the code path that decides
   who gets in. Fix sketch: a shared base with the ctor pair, the Admin bypass, the two `Forbidden`
   responses and three abstract members; keep the two permission-service calls distinct. This is the
   highest *consequence* per line in the survey.

Honourable mention: **A1** (96 result unions, 311 members, 34 `NotFound` declarations, two spellings of
`CursorNotFound`) is the largest structural debt and the one that most needs an owner decision rather
than a refactor; and **B6** (the CSV formula-injection escaper, twice) is the one where a future fix
applied to one export would leave the other exploitable.

## What this survey does not cover

- **Coverage is a sample, not a proof.** The five lead generators were mechanical over 640 production
  files, but every verdict required reading the file. I opened roughly 70 files in full and
  several dozen more in part. Classes A and D are where an unread family most plausibly hides: the
  declaration-name pass groups by *name*, so two duplicates that were renamed apart are invisible to
  it, and the literal pass ignores anything under 4 characters.
- **The tooling is hand-rolled.** The normaliser is 60 lines of Python, not Roslyn: it brace-matches
  method bodies, strips comments and string contents, and alpha-renames identifiers. It does not see
  preprocessor branches (`#if`), it mis-parses multi-line generic constraints in rare cases, and its
  alpha-renaming can make two genuinely different bodies look identical when only the identifiers
  differ (I re-read every reported group of ≥8 lines before classifying it). No `fallow`/`jscpd`
  equivalent was available for C# in this session; `npx fallow` does not parse C#.
- **`*.Spec.cs` (322 files) was excluded from the families.** Test code repeats on purpose, and a
  clone between two specs is not debt. Two consequences: the fixture/helper duplication that *does*
  leak into `Lib/Testing` (E8 is the deliberate case) was not inventoried, and no verdict here accounts
  for what the specs pin — so every "fix sketch" above needs its specs read before implementation.
- **The `Migrations/` and generated artifacts were not surveyed** (`ResponseKeys.g.cs`,
  `apps/api/openapi.json`, `PublyApp.Api.json`). Generated clones are not debt.
- **`apps/api/Tests` (the integration runner shell, 2 files) was treated as infrastructure.** Its
  fixtures are the one place where duplication is the point.
- **Nothing was measured at runtime.** "These two handlers mean the same thing" is a reading of the
  code, not a behavioural proof. Where the two copies could differ in *effect* (audit action, log
  sentence, permission call) the entry says so, and C2/C1 are deferred precisely because their
  difference is a product decision I should not flatten.

## Gates run for the two fixes

- `dotnet restore PublyApp.slnx` → clean.
- `dotnet build PublyApp.slnx --no-restore` with `APP_ROLE=api` → **0 Warning(s), 0 Error(s)**,
  identical to the base commit (`git stash`-free check: the baseline build ran first and also reported
  0/0). The expected `Npgsql … Connection refused` lines during OpenAPI document generation are
  pre-existing (no Postgres in this worktree) and do not affect the build result.
- `dotnet test apps/api/Tests/PublyApp.Api.Tests.csproj -c Test --filter
  "FullyQualifiedName~JsonElementExtensions|…MastodonPublishProvider|…DiscordWebhookPublishProvider|…MastodonClient|…DiscordWebhook"`
  — **118 passed, 0 failed**: the spec file that covers both changed surfaces (including the five new
  assertions) plus the four provider test classes that call the moved helper.
- **No `#pragma warning disable` added, no analyzer suppressed, no analyzer severity changed.** The
  only suppression that appears in this record (D6) is pre-existing and untouched.
- **No test edited to make a fix pass.** The five added assertions in `JsonElementExtensions.Spec.cs`
  are new coverage for the new shared helper, not a relaxation of an existing one.
