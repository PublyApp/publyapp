## Review: Week 1 Revised Implementation Plan (Invitations, Endpoints, Frontend)

> Note (2026-01): This review predates the RFC 7807 ProblemDetails migration. Any error-response examples using `ApiResponse`, `JsonHttpResult<ApiResponse>`, or `.ProducesApiResponses(...)` should be updated to `TypedProblems.*` + `App*HttpResult` (validation errors are `422` `ValidationProblemDetails`).

Summary: The plan is solid and matches the repo's vertical-slice patterns overall. Below are concrete corrections to keep it consistent with the current codebase and conventions (backend filters, DTOs, namespaces, client usage, and i18n).

### Backend — Required Corrections

- ApiResponse shape: The repo uses a non-generic ApiResponse with a typed TranslationKey (ResponseKeys), not ApiResponse<T>. Return typed payloads with Ok<T> and errors with BadRequest<ApiResponse>.
  - Example pattern (see StaffUser handlers):
    - Success: return TypedResults.Ok(new SomeDto { ... });
    - Error: return TypedResults.BadRequest(ApiResponse.Create("...", ResponseKeys.SomeKey));

- AcceptInvitation handler: align with existing services and entity model.
  - Hashing: use IPasswordService and set User.Password (property name is Password, not PasswordHash).
  - Verification: set user.IsVerified = true; otherwise SessionAuthFilter will reject the session.
  - Session: use ISessionService.CreateSessionForUser(user) (current signature), not CreateSessionAsync(userId, accountId).
  - Scope guard: ensure invitation.Scope == InvitationScope.Staff before proceeding (the endpoint is under “staff” semantics).
  - Prefer LINQ query syntax for DB filters; compose the query with “from … where … select …” then call FirstOrDefaultAsync.

  Suggested snippet inside AcceptInvitation:

  ```csharp
  // Validate token and ensure Staff scope
  var invitation = await invitationService.ValidateInvitationTokenAsync(token, cancellationToken);
  if (invitation is null || invitation.Scope != InvitationScope.Staff) {
      return TypedResults.NotFound(ApiResponse.Create("Invitation not found or expired", ResponseKeys.NotFound));
  }

  // Ensure user does not already exist
  var existingUserQuery = from u in dbContext.User where u.Email == invitation.Email select u;
  var existingUser = await existingUserQuery.FirstOrDefaultAsync(cancellationToken);
  if (existingUser is not null) {
      return TypedResults.BadRequest(ApiResponse.Create("User already exists", ResponseKeys.UserAlreadyExists));
  }

  await using var tx = await dbContext.Database.BeginTransactionAsync(cancellationToken);
  try {
      var passwordService = httpContext.RequestServices.GetRequiredService<IPasswordService>();
      var user = new User {
          Email = invitation.Email,
          Password = passwordService.HashPassword(request.Password),
          FirstName = request.FirstName,
          LastName = request.LastName,
          Status = UserStatus.Active,
          IsVerified = true,
      };
      await dbContext.User.AddAsync(user, cancellationToken);
      await dbContext.SaveChangesAsync(cancellationToken);

      var account = UserAccount.CreateStaffAccount(user.GetRequiredId(), AccountLevel.User);
      await dbContext.UserAccount.AddAsync(account, cancellationToken);
      await dbContext.SaveChangesAsync(cancellationToken);

      await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
          UserAccountId = account.GetRequiredId(),
          ProfileId = invitation.ProfileId,
      }, cancellationToken);

      invitation.IsAccepted = true;
      invitation.AcceptedAt = DateTime.UtcNow;
      await dbContext.SaveChangesAsync(cancellationToken);

      var sessionService = httpContext.RequestServices.GetRequiredService<ISessionService>();
      var session = await sessionService.CreateSessionForUser(user, cancellationToken);

      await tx.CommitAsync(cancellationToken);
      return TypedResults.Ok(new SessionResponse { Token = session.Token, ExpiresAt = session.ExpiresAt, /* map user dto */ });
  } catch { await tx.RollbackAsync(cancellationToken); throw; }
  ```

- AuditLogService header: HttpContext.Request.Headers.UserAgent is not reliable; use indexer key.
  - Replace: httpContext?.Request.Headers.UserAgent.ToString()
  - With: httpContext?.Request.Headers["User-Agent"].ToString()

- Route mapping vs filters: “AllowAnonymous” on endpoints under /staff won’t bypass custom filters (CheckSessionHeader/SessionAuth/StaffAuth applied to the staff group).
  - Map anonymous invitation endpoints outside the staffGroup (e.g., under /auth or a new /invitations root), or add selective filter skips. Otherwise, anonymous acceptance will get 401.

- RoutePath constants: follow existing style with PathUtils.Join and static readonly fields. Example:
  ```csharp
  public static class Invitations {
      public static readonly string Root = PathUtils.Join(RoutePath.Staff.Root, "/invitations");
      public static readonly string Create = PathUtils.Join(Root, "/");
      public static readonly string List = PathUtils.Join(Root, "/");
      public static readonly string Revoke = PathUtils.Join(Root, "/{invitationId}");
  }
  ```
  Then, append endpoints to the existing staffGroup like other features.

- EF attributes imports: when using [Index(...)] ensure using Microsoft.EntityFrameworkCore is included in each entity file in examples.

- Migrations/docs naming:
  - Table is invitations (not staff_invitations).
  - Table is sessions (plural); psql check should be \d sessions.

- Env var usage: STAFF_OWNER_BOOTSTRAP_CODE exists in AppEnvironment but isn’t used by seeding; current seeding hashes a fixed dev password. Either wire this var into seeding or drop it from the Week 1 scope to avoid confusion in docs.

### Backend — Nice-to-Have (already implemented in repo)

- Unique index on Invitation.TokenHash (performance and correctness) is already present.
- ImpersonationService: uses CryptoUtils.RandomString(32) and deterministic tie-breaker on account selection.

### Frontend — Required Corrections

- ClientManager API: use clientManager.anonymousClient and clientManager.createApiClient(token) + clientManager.setApiClient(...). There is no getAnonClient() or setSessionToken().
  - Example after accept:
    ```ts
    const cm = clientManager;
    const authed = cm.createApiClient(response.token);
    cm.setApiClient(authed);
    ```

- Kiota path usage: follow generated pattern used elsewhere (e.g., client.staff.tenants.byTenantId(id).get()). Avoid bracket paths like [":token"]. For invitations it should be similar to byToken(token) style once endpoints exist.

- Query layer: prefer the existing react-query-kit pattern (lib/react-query/...) with typed getQueryKey helpers instead of ad-hoc useQuery/useMutation wiring; this keeps cache keys and error handling consistent with the app.

- i18n: API responses use ResponseKeys on the backend. For UI texts, add keys under packages/shared as usual, but don’t expect backend response messages to come from there.

### Minor Consistency Nits

- Keep LINQ database filters in query syntax (compose with query syntax, then call FirstOrDefaultAsync/ToListAsync).
- Avoid inv.CreatedAt!.Value in projections; BaseAttributes.CreatedAt is non-nullable.

### Documentation Fixups

- Replace “AllowAnonymous” guidance with “mount outside staffGroup or skip filters for that route”.
- Fix table names and commands (invitations, sessions, \d sessions).
- Replace all ApiResponse<T> examples with Ok<T> + BadRequest<ApiResponse> using ResponseKeys.
- Update AcceptInvitation sample per the code above (PasswordService, IsVerified = true, CreateSessionForUser).

If you want, I can apply these doc fixes directly in the plan file and adjust the frontend snippets to the project’s ClientManager/react-query-kit style.
