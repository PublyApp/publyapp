# Issue 190 Full Service Attribute Cutover Design

## Status

Approved in chat on 2026-04-26.

## Branch

`chore/issue-190-full-service-attribute-cutover`

## Issue

- GitHub issue: `#190`
- Title: `Migrate remaining application services to [Service] attribute`

## Summary

Close issue `#190` in one pass by making `[Service]` the single registration mechanism
for all qualifying concrete application services under `MainApi.Src.Modules.*.Services`.
This includes:

- migrating the 11 services still explicitly registered in `AddAppServices()`,
- keeping the 3 already-migrated services unchanged,
- and adding attribute-based registration for the currently unregistered but qualifying
  `AuthService` and `ProjectService`.

The runtime DI graph for already-consumed services should remain behaviorally unchanged.
The only net expansion is that `IAuthService` and `IProjectService` become resolvable
from DI because they now follow the same application-service convention.

## Goals

- Remove manual `AddScoped<...>()` registrations for qualifying module services from
  `apps/api/Src/Lib/ServiceRegistration.cs`.
- Ensure every qualifying concrete module service uses
  `[Service(ServiceLifetime.Scoped)]`.
- Keep Web and Infrastructure registrations explicit and unchanged.
- Keep non-module application wiring explicit where appropriate, especially
  `IRequestAuthContext`.
- Add a DI regression test that asserts the full qualifying service set is both
  discovered and resolvable so future drift is caught early.

## Non-Goals

- No change to service behavior, handler behavior, business rules, or endpoint contracts.
- No change to keyed DI patterns or infrastructure registrations.
- No opportunistic refactor of service implementations beyond what is needed to add
  `[Service]`.
- No movement of services between modules or namespaces.

## Current State

`AddAppServices()` already performs the `[Service]` scan, validation, optional manifest
formatting, and discovered-service registration. The remaining duplication is that a
subset of module services is still explicitly registered there.

Today the qualifying module service surface is:

### Already attribute-registered

- `AuditLogService : IAuditLogService`
- `AuditLogQueryService : IAuditLogQueryService`
- `SystemNoticeService : ISystemNoticeService`

### Explicitly registered in `AddAppServices()`

- `UserService : IUserService`
- `SessionService : ISessionService`
- `TenantAsStaffService : ITenantAsStaffService`
- `TenantService : ITenantService`
- `AccountService : IAccountService`
- `ProfileService : IProfileService`
- `InvitationService : IInvitationService`
- `ImpersonationService : IImpersonationService`
- `PermissionService : IPermissionService`
- `ProfileAsStaffService : IProfileAsStaffService`
- `PermissionAsStaffService : IPermissionAsStaffService`

### Qualifying but not currently registered through `AddAppServices()`

- `AuthService : IAuthService`
- `ProjectService : IProjectService`

All 16 currently fit the existing scanner contract:

- they are concrete classes,
- they live under `MainApi.Src.Modules.*.Services`,
- they implement exactly one primary `I{ClassName}` interface,
- and no keyed registration is involved.

## Design

### 1. Make `[Service]` the single registration mechanism for qualifying module services

Add `[Service(ServiceLifetime.Scoped)]` to every qualifying service that does not
already have it:

- `UserService`
- `SessionService`
- `TenantAsStaffService`
- `TenantService`
- `AccountService`
- `ProfileService`
- `InvitationService`
- `ImpersonationService`
- `PermissionService`
- `ProfileAsStaffService`
- `PermissionAsStaffService`
- `AuthService`
- `ProjectService`

The existing attributes on `AuditLogService`, `AuditLogQueryService`, and
`SystemNoticeService` remain unchanged.

### 2. Remove manual module-service registrations from `AddAppServices()`

Delete the explicit `AddScoped<...>()` lines for the 11 module services that are still
manually wired today.

After the change, `AddAppServices()` should still:

- validate discovered `[Service]` classes,
- optionally register the DI manifest,
- register FluentValidation validators,
- register `IRequestAuthContext`,
- register discovered services through the existing scanner path,
- and enable `ValidateScopes` and `ValidateOnBuild`.

It should no longer manually register module services that qualify for the
attribute-based contract.

### 3. Preserve explicit non-module and infrastructure wiring

The cutover is intentionally limited to application services in
`MainApi.Src.Modules.*.Services`.

The following remain explicit and out of scope for attribute migration:

- Web/API registrations in `AddWebServices()`
- Infrastructure registrations in `AddInfraServices()`
- `IRequestAuthContext`
- testing overrides in `MainApiFactory`

### 4. Treat `AuthService` and `ProjectService` as first-class application services

Although `AuthService` is currently a placeholder and `ProjectService` is not currently
registered in `AddAppServices()`, both fit the established application-service shape.
They should join the same `[Service]` registration model as the rest of the module
services.

This makes the application-service registration story complete and avoids a lingering
two-tier convention where some qualifying module services are intentionally left out.

## Regression Hardening

Add a focused DI regression spec near the DI registration code. The spec should assert
the full qualifying set instead of only the previously explicit subset.

Recommended assertions:

- `ValidateServiceAttributes()` discovers all 16 qualifying services.
- The discovered set contains the exact expected implementation/interface pairs.
- After `AddAppServices()` runs, each expected interface resolves from the DI container.
- `IRequestAuthContext` still resolves through explicit wiring.
- No conflict occurs from duplicate explicit registrations because the manual
  module-service registrations have been removed.

The important part is that the test encodes the expected full surface. If someone later
adds a qualifying module service without `[Service]`, or reintroduces explicit
registration for a migrated interface, the regression spec should fail.

## Implementation Notes

- Use `using MainApi.Src.Lib.DI;` in service files that receive the attribute.
- Use `using Microsoft.Extensions.DependencyInjection;` when needed for
  `ServiceLifetime`.
- Keep the existing fail-fast validator rules unchanged unless implementation work
  discovers a concrete gap.
- Do not introduce keyed registrations or self-registration as part of this issue.
- Do not change service lifetimes from `Scoped`.

## Verification

Minimum verification for this issue:

1. `dotnet build apps/api/MainApi.csproj -c Test`
2. Run the DI regression spec added for this change.
3. Run a targeted smoke slice that touches:
   - auth/session resolution,
   - staff or tenant auth flow that relies on `IAccountService` and `ITenantService`,
   - and one staff-side flow using migrated services such as invitations, users, or
     profiles.

If the targeted smoke slice is awkward to isolate, run the full API test project
instead.

## Acceptance Criteria

- Every qualifying concrete module service under `MainApi.Src.Modules.*.Services`
  uses `[Service(ServiceLifetime.Scoped)]`.
- `AddAppServices()` no longer manually registers qualifying module services.
- `AuthService` and `ProjectService` are included in attribute-based registration.
- Web, infrastructure, and explicit non-module registrations remain unchanged.
- The DI regression spec covers the full expected qualifying service set.
- Build and test verification pass.

## Risks

### Missing a qualifying service

This is the highest-probability failure mode. Mitigation: encode the exact expected
service set in the regression spec.

### Half-migrated state

This is already guarded by the fail-fast registration conflict logic. Mitigation:
remove manual registrations in the same PR that adds `[Service]`.

### Silent runtime drift

This can happen later if someone adds a new qualifying service and forgets the
attribute. Mitigation: keep the regression spec strict about the expected qualifying
surface.

## Out of Scope Follow-Ups

- Converting non-module DI registrations to attributes
- Revisiting whether placeholder services like `AuthService` should continue to exist
- Any broader DI architecture changes beyond the `[Service]` cutover
