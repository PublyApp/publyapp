# Staff Profile Creation Changes — Critical Review (2025-11-23)

## Findings

- **High — Business rule (“at least one permission”) is enforced in only one layer.** The handler’s validator rejects requests without `permissions`, but the rest of the stack still assumes the field is optional:

  * The service happily proceeds when `permissions.Count == 0`, so calling it from any other code path (tests, future handlers) will silently create permissionless profiles.
  * The OpenAPI contract still marks `permissions` as optional (`NullableOfJsonElement`), which means generated clients don’t treat it as required.
  * The frontend mutation only sends the property when the user selects at least one permission; if the user submits without picking anything the request omits the field and the handler returns 400. There’s no client-side feedback telling the user why the action failed.

  ```76:124:apps/api/Src/Features/Staff/ProfileAsStaff/Handlers/CreateStaffProfile.cs
  		RuleFor(x => x.Permissions)
  			.Must(BeRequiredAndValid)
  			.WithMessage("At least one permission is required");
  ...
  	private static bool BeRequiredAndValid(JsonElement? element) {
  		if (!element.HasValue) return false;
  		return list is not null && list.Count > 0;
  	}
  ```

  ```424:470:apps/api/Src/Features/Staff/ProfileAsStaff/ProfileAsStaffService.cs
  		// Validate all permissions exist AND are Staff-scoped
  		if (permissions.Count > 0) {
  			var validPermissionKeys = await (
  				from p in _dbContext.Permission
  				where permissions.Contains(p.Key)
  					&& p.Scope == PermissionScope.Staff
  				select p.Key
  			).ToListAsync(cancellationToken);
  ```

  **Why it hurts:** The stack is inconsistent. API consumers (including our own form) can still send “no permissions”, but they get a generic 400 that isn’t described in the contract, the service would accept the call if the validator were bypassed, and generated clients/front-end types still model the field as optional. This violates the stated business rule, makes the UX confusing, and increases the odds of future regressions.

  **Fix:** Push the requirement through every layer—make the service check `permissions.Count == 0`, update the OpenAPI schema so `permissions` is required, and fail fast in the UI (disable submit/show error) before the request leaves the browser.

- **Medium — Email tasks swallow all failures and run without guarding concurrency.** The new fire-and-forget jobs catch every exception and drop it, with TODO comments left in place; they also launch an unconstrained number of parallel tasks.

```216:250:apps/api/Src/Features/Staff/ProfileAsStaff/Handlers/CreateStaffProfile.cs
		// Send invitation emails to NEW users (fire and forget - don't block response)
		_ = Task.Run(async () => {
			foreach (var (email, token) in success.InvitationTokens) {
				try {
					await emailService.SendStaffWelcomeEmailAsync(email, token);
				} catch {
					// Log but don't fail the operation
					// Email sending failures are non-critical
				}
			}
		}, cancellationToken);
```

**Why it hurts:** Invitation/notification delivery failures vanish silently, so operations lose any visibility into who actually received onboarding emails. Under load we also risk starting dozens of outbound SMTP requests concurrently with no throttle.

**Fix:** Offload the email work to a background helper that (a) caps concurrency with `SemaphoreSlim`, (b) retries with exponential backoff for transient failures, and (c) logs or emits metrics whenever delivery ultimately fails.

## Suggested Next Steps

1. Propagate the “at least one permission” rule through the service layer, OpenAPI spec, and UI so the behaviour is consistent and discoverable.
2. Implement controlled-concurrency email dispatch with retry/backoff and logging before shipping.

