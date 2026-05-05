# Issue 190 Full Service Attribute Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all qualifying module services to `[Service(ServiceLifetime.Scoped)]`, remove manual module-service DI wiring from `AddAppServices()`, and add a regression spec that locks the full 16-service surface.

**Architecture:** Keep the existing scanner, validator, and discovered-service registration flow intact. Expand the qualifying surface to every concrete `MainApi.Src.Modules.*.Services` implementation that follows the `I{ClassName}` convention, then verify both static discovery and runtime resolution through one DI-focused spec.

**Tech Stack:** .NET 10, ASP.NET Core minimal APIs, xUnit, FluentAssertions, WebApplicationFactory, Testcontainers

---

### Task 1: Add The Full-Surface DI Regression Spec

**Files:**
- Create: `apps/api/Src/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- Test: `apps/api/Src/Lib/DI/ServiceAttributeRegistration.Spec.cs`

- [ ] **Step 1: Write the failing regression spec**

```csharp
namespace MainApi.Src.Lib.DI;

using FluentAssertions;

using MainApi.Src.Lib;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Auth.Services;
using MainApi.Src.Modules.Impersonations.Services;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Permissions.Services;
using MainApi.Src.Modules.Profiles.Services;
using MainApi.Src.Modules.Projects.Services;
using MainApi.Src.Modules.SystemNotices.Services;
using MainApi.Src.Modules.Tenants.Services;
using MainApi.Src.Modules.Users.Services;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class ServiceAttributeRegistrationSpec
	: IClassFixture<ApiFixture> {
	private static readonly (
		Type ServiceType,
		Type ImplementationType
	)[] ExpectedServices = [
		(typeof(IAccountService), typeof(AccountService)),
		(typeof(IAuditLogQueryService), typeof(AuditLogQueryService)),
		(typeof(IAuditLogService), typeof(AuditLogService)),
		(typeof(IAuthService), typeof(AuthService)),
		(typeof(IImpersonationService), typeof(ImpersonationService)),
		(typeof(IInvitationService), typeof(InvitationService)),
		(typeof(IPermissionAsStaffService), typeof(PermissionAsStaffService)),
		(typeof(IPermissionService), typeof(PermissionService)),
		(typeof(IProfileAsStaffService), typeof(ProfileAsStaffService)),
		(typeof(IProfileService), typeof(ProfileService)),
		(typeof(IProjectService), typeof(ProjectService)),
		(typeof(ISessionService), typeof(SessionService)),
		(typeof(ISystemNoticeService), typeof(SystemNoticeService)),
		(typeof(ITenantAsStaffService), typeof(TenantAsStaffService)),
		(typeof(ITenantService), typeof(TenantService)),
		(typeof(IUserService), typeof(UserService))
	];

	private readonly ApiFixture _fixture;

	public ServiceAttributeRegistrationSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
	}

	[Fact]
	public void
	ItShouldDiscoverAllQualifyingModuleServicesForAttributeRegistration() {
		var discoveredServices =
			ServiceScanner.ScanAssembly<Program>();

		ServiceValidator.Validate(discoveredServices);

		var actualServices = discoveredServices
			.Where(x => x.ServiceInterface is not null)
			.Select(x => new {
				ServiceType = x.ServiceInterface!,
				x.ImplementationType,
				x.Lifetime,
				x.Key
			})
			.ToList();

		actualServices.Should().HaveCount(
			ExpectedServices.Length
		);

		foreach (var (
			serviceType,
			implementationType
		) in ExpectedServices) {
			actualServices.Should().Contain(x =>
				x.ServiceType == serviceType
				&& x.ImplementationType
					== implementationType
				&& x.Lifetime
					== ServiceLifetime.Scoped
				&& x.Key is null
			);
		}
	}

	[Fact]
	public async Task
	ItShouldResolveAllAttributeRegisteredModuleServicesFromTheApplicationContainer() {
		await using var scope =
			_fixture.Factory.Services
				.CreateAsyncScope();

		foreach (var (
			serviceType,
			implementationType
		) in ExpectedServices) {
			var resolved = scope.ServiceProvider
				.GetRequiredService(serviceType);

			resolved.Should().NotBeNull();
			resolved.GetType().Should()
				.Be(implementationType);
		}

		var requestAuthContext = scope
			.ServiceProvider
			.GetRequiredService<
				IRequestAuthContext
			>();

		requestAuthContext.Should()
			.BeOfType<RequestAuthContext>();
	}
}
```

- [ ] **Step 2: Run the new spec and verify it fails before the cutover**

Run:

```powershell
dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~ServiceAttributeRegistrationSpec"
```

Expected: FAIL because discovery still finds only the already-attributed services and `IAuthService` / `IProjectService` are not yet registered in the application container.

### Task 2: Attribute The Auth, User, And Tenant Service Slice

**Files:**
- Modify: `apps/api/Src/Modules/Auth/Services/AuthService.cs`
- Modify: `apps/api/Src/Modules/Auth/Services/SessionService.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/Users/Services/AccountService.cs`
- Modify: `apps/api/Src/Modules/Tenants/Services/TenantService.cs`
- Modify: `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`

- [ ] **Step 1: Add `[Service(ServiceLifetime.Scoped)]` to the auth service files**

```csharp
// apps/api/Src/Modules/Auth/Services/AuthService.cs
using MainApi.Src.Lib.DI;

using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Auth.Services;

public interface IAuthService { }

[Service(ServiceLifetime.Scoped)]
public class AuthService : IAuthService { }

// apps/api/Src/Modules/Auth/Services/SessionService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Auth.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using UserNs = MainApi.Src.Modules.Users.Entities;

namespace MainApi.Src.Modules.Auth.Services;

public interface ISessionService {
	Task<Session> CreateSessionForUser(
		UserNs.User user,
		CancellationToken cancellationToken = default
	);
	Task<SessionData?> GetSessionByToken(
		string token,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class SessionService : ISessionService {
```

- [ ] **Step 2: Add `[Service(ServiceLifetime.Scoped)]` to the user service files**

```csharp
// apps/api/Src/Modules/Users/Services/UserService.cs
using System.Data;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Users.Services;

[Service(ServiceLifetime.Scoped)]
public class UserService : IUserService {

// apps/api/Src/Modules/Users/Services/AccountService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Users.Services;

[Service(ServiceLifetime.Scoped)]
public class AccountService : IAccountService {
```

- [ ] **Step 3: Add `[Service(ServiceLifetime.Scoped)]` to the tenant service files**

```csharp
// apps/api/Src/Modules/Tenants/Services/TenantService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Tenants.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Tenants.Services;

[Service(ServiceLifetime.Scoped)]
public class TenantService : ITenantService {

// apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Tenants.Services;

[Service(ServiceLifetime.Scoped)]
public class TenantAsStaffService : ITenantAsStaffService {
```

### Task 3: Attribute The Remaining Module Services And Remove Manual App-Service Wiring

**Files:**
- Modify: `apps/api/Src/Modules/Profiles/Services/ProfileService.cs`
- Modify: `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
- Modify: `apps/api/Src/Modules/Permissions/Services/PermissionService.cs`
- Modify: `apps/api/Src/Modules/Permissions/Services/PermissionAsStaffService.cs`
- Modify: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- Modify: `apps/api/Src/Modules/Impersonations/Services/ImpersonationService.cs`
- Modify: `apps/api/Src/Modules/Projects/Services/ProjectService.cs`
- Modify: `apps/api/Src/Lib/ServiceRegistration.cs`

- [ ] **Step 1: Add `[Service(ServiceLifetime.Scoped)]` to profile and permission services**

```csharp
// apps/api/Src/Modules/Profiles/Services/ProfileService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Profiles.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Profiles.Services;

[Service(ServiceLifetime.Scoped)]
public class ProfileService : IProfileService {

// apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Permissions.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Profiles.Services;

[Service(ServiceLifetime.Scoped)]
public class ProfileAsStaffService
	: IProfileAsStaffService {

// apps/api/Src/Modules/Permissions/Services/PermissionService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Permissions.Services;

[Service(ServiceLifetime.Scoped)]
public class PermissionService : IPermissionService {

// apps/api/Src/Modules/Permissions/Services/PermissionAsStaffService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Permissions.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Permissions.Services;

[Service(ServiceLifetime.Scoped)]
public class PermissionAsStaffService
	: IPermissionAsStaffService {
```

- [ ] **Step 2: Add `[Service(ServiceLifetime.Scoped)]` to invitation, impersonation, and project services**

```csharp
// apps/api/Src/Modules/Invitations/Services/InvitationService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using UserEntity = MainApi.Src.Modules.Users.Entities.User;

namespace MainApi.Src.Modules.Invitations.Services;

[Service(ServiceLifetime.Scoped)]
public class InvitationService : IInvitationService {

// apps/api/Src/Modules/Impersonations/Services/ImpersonationService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.DI;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Auth.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Impersonations.Services;

[Service(ServiceLifetime.Scoped)]
public class ImpersonationService
	: IImpersonationService {

// apps/api/Src/Modules/Projects/Services/ProjectService.cs
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Projects.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Modules.Projects.Services;

[Service(ServiceLifetime.Scoped)]
public class ProjectService : IProjectService {
```

- [ ] **Step 3: Remove the manual module-service registrations from `AddAppServices()` and delete the now-unused service imports**

```csharp
// apps/api/Src/Lib/ServiceRegistration.cs
using System.Text;

using FluentValidation;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib.DI;
using MainApi.Src.Lib.Extensions;

using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;

using Resend;

namespace MainApi.Src.Lib;

public static class ServiceRegistration {
	public static WebApplicationBuilder AddAppServices(
		this WebApplicationBuilder builder
	) {
		var discoveredServices =
			ValidateServiceAttributes();

		if (AppEnvironment.Instance.DI_MANIFEST_ENABLED) {
			var manifest =
				ServiceValidator.FormatManifest(
					discoveredServices
				);
			if (manifest is not null) {
				builder.Services.AddSingleton(
					new DiManifest(manifest)
				);
			}
		}

		builder.Services.AddValidatorsFromAssemblyContaining<Program>();

		builder.Services.AddScoped<
			IRequestAuthContext,
			RequestAuthContext
		>();

		RegisterDiscoveredServices(
			builder.Services,
			discoveredServices
		);

		builder.Host.UseDefaultServiceProvider(
			options => {
				options.ValidateScopes = true;
				options.ValidateOnBuild = true;
			}
		);

		return builder;
	}
}
```

### Task 4: Verify The Full Cutover And Commit It

**Files:**
- Test: `apps/api/Src/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- Test: `apps/api/Src/Modules/Auth/Handlers/PassWordLogin.Spec.cs`
- Test: `apps/api/Src/Lib/Filters/TenantAuthFilter.Spec.cs`
- Test: `apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.Spec.cs`

- [ ] **Step 1: Run the new DI regression spec and verify it passes**

Run:

```powershell
dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~ServiceAttributeRegistrationSpec"
```

Expected: PASS with both discovery and runtime-resolution assertions succeeding.

- [ ] **Step 2: Run the issue build verification**

Run:

```powershell
dotnet build apps/api/MainApi.csproj -c Test
```

Expected: BUILD SUCCEEDED with no `[Service]` validation conflicts.

- [ ] **Step 3: Run the targeted auth, tenant, and staff smoke specs**

Run:

```powershell
dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~PasswordLoginSpec"
dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~TenantAuthFilterSpec"
dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~CreateStaffInvitationSpec"
```

Expected: PASS. These cover session creation, tenant/account authorization, and a staff-side flow that exercises migrated application services.

- [ ] **Step 4: Commit the finished cutover**

```powershell
git add apps/api/Src/Lib/DI/ServiceAttributeRegistration.Spec.cs `
  apps/api/Src/Lib/ServiceRegistration.cs `
  apps/api/Src/Modules/Auth/Services/AuthService.cs `
  apps/api/Src/Modules/Auth/Services/SessionService.cs `
  apps/api/Src/Modules/Users/Services/UserService.cs `
  apps/api/Src/Modules/Users/Services/AccountService.cs `
  apps/api/Src/Modules/Tenants/Services/TenantService.cs `
  apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs `
  apps/api/Src/Modules/Profiles/Services/ProfileService.cs `
  apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs `
  apps/api/Src/Modules/Permissions/Services/PermissionService.cs `
  apps/api/Src/Modules/Permissions/Services/PermissionAsStaffService.cs `
  apps/api/Src/Modules/Invitations/Services/InvitationService.cs `
  apps/api/Src/Modules/Impersonations/Services/ImpersonationService.cs `
  apps/api/Src/Modules/Projects/Services/ProjectService.cs
git commit -m "refactor(api): complete service attribute registration cutover"
```
