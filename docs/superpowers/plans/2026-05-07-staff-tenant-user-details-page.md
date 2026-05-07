# Staff Tenant User Details Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix issue 386 by adding a full editable Staff dashboard tenant-user details page with tenant-scoped routing, data loading, editing, lifecycle actions, and remove-from-tenant handling.

**Architecture:** Add the missing scoped backend `GET /staff/tenants/{tenantId}/users/{userId}` endpoint, regenerate the Kiota client, then add a tenant-details nested frontend route at `/staff/tenants/details/:tenantId/users/:userId`. The page must reuse the same primitives and visual structure as the existing Staff user details page while calling tenant-user scoped hooks and mutations.

**Tech Stack:** .NET 10 minimal APIs, EF Core, FluentValidation/RFC7807 problem helpers, Kiota TypeScript client, React 19, React Router v7, TanStack Query, MUI v6, React Hook Form, Zod

---

## File Structure

- Create: `apps/api/Src/Modules/Users/Handlers/Staff/GetTenantUserAsStaff.cs`
  - Owns the new scoped GET handler and maps `TenantUserData` to `TenantUserDetailsResult`.
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/GetTenantUserAsStaff.Spec.cs`
  - Covers success, malformed IDs, missing membership, forbidden access, suspended membership, and globally suspended identity.
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
  - Adds `GetTenantUserByIdAsync(...)` to `IUserService` and implements it using the same membership query rules as `FindTenantUsersAsync`.
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
  - Extends `TenantUserDetailsResult` with `CreatedAt` and `UpdatedAt` so GET and PATCH responses can power the details page.
- Modify: `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs`
  - Maps `Routes.Users.ForTenantAsStaff.GetById` with `AppPermissions.Staff.Users.GET_FOR_TENANT`.
- Modify: `packages/shared-ts/lib/constants.ts`
  - Adds tenant-scoped frontend details path helpers under `FRONT_PATH_NAMES.staff.tenants.details(tenantId).users`.
- Create: `packages/shared-ts/validations/tenant-user.validations.ts`
  - Defines the tenant-user update form schema with `id`, `tenantId`, first/last name, avatar, and `level`.
- Modify: `apps/front/src/routes/_tree/staff/_parts/staff-tenants.routes.ts`
  - Registers `users/:userId` inside the existing tenant details route.
- Modify: `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
  - Adds `useGetTenantUser`.
- Create: `apps/front/src/routes/authed/staff/tenants/details/users/details/tenant-user-details-page.tsx`
  - Route page shell using `DashboardContent`, `CustomBreadcrumbs`, `QueryDisplay`, and tenant-scoped hooks.
- Create: `apps/front/src/routes/authed/staff/tenants/details/users/details/_components/tenant-user-details-page-skeleton.tsx`
  - Skeleton adapted from Staff user details.
- Create: `apps/front/src/routes/authed/staff/tenants/details/users/details/_components/tenant-user-update-form.tsx`
  - Editable form and danger-zone card using the same primitives as Staff user details.
- Modify: `apps/front/src/routes/authed/staff/tenants/details/users/_parts/tenant-users-table.tsx`
  - Updates both details links to the tenant-aware route.
- Modify: `packages/shared-ts/lib/i18n/json/common.en.json`
  - Adds tenant-user details and danger-zone copy.
- Modify: `packages/shared-ts/lib/i18n/json/common.fr.json`
  - Adds French equivalents for the same keys.

Generated files after `just generate-client`:

- `packages/client-ts/src/staff/tenants/item/users/item/index.ts`
- any generated model metadata files touched by Kiota

### Task 1: Add Backend Failing Coverage For Tenant-User GET

**Files:**
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/GetTenantUserAsStaff.Spec.cs`

- [ ] **Step 1: Create the spec file with URL and lookup helpers**

Use the existing `UpdateTenantUserAsStaff.Spec.cs` helper pattern. Add this file:

```csharp
namespace MainApi.Src.Modules.Users.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class GetTenantUserAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetTenantUserAsStaffSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId, string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.GetByIdFn(tenantId, userId)
		);
	}

	private static async Task<string> GetUserIdByEmailAsync(
		HttpClient http,
		string staffToken,
		Guid tenantId,
		string email
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.RootFn(tenantId.ToString()),
			Routes.Users.ForTenantAsStaff.Find
		) + "?limit=50";

		using var request = new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(staffToken);

		using var response = await http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var result = await response.Content.ReadFromJsonAsync<FindUsersResponse>();
		if (result is null) {
			throw new InvalidOperationException(
				"Failed to deserialize tenant user list response"
			);
		}

		var user = result.Data.FirstOrDefault(u =>
			string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase)
		);

		if (user is null) {
			throw new InvalidOperationException(
				$"User with email '{email}' not found in tenant"
			);
		}

		return user.Id;
	}

	private sealed record FindUsersResponse {
		public List<TenantUserItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record TenantUserItem {
		public string Id { get; init; } = string.Empty;
		public string Email { get; init; } = string.Empty;
		public string Level { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
	}
}
```

- [ ] **Step 2: Add the success test**

Add this test inside `GetTenantUserAsStaffSpec`:

```csharp
[Fact]
public async Task ItShouldReturnTenantUserWhenMembershipExists() {
	var staffToken = await _authClient.LoginAsStaffAdminAsync();
	var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
		_http,
		staffToken,
		SeedConstants.Tenants.AcmeName
	);
	var userId = await GetUserIdByEmailAsync(
		_http,
		staffToken,
		tenantId,
		TestConstants.AcmeUserEmail
	);

	using var request = new HttpRequestMessage(
		HttpMethod.Get,
		GetUrl(tenantId.ToString(), userId)
	).WithSessionToken(staffToken);

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.OK);
	var result = await response.Content.ReadFromJsonAsync<TenantUserDetailsResult>();
	result.Should().NotBeNull();
	result!.Id.ToString().Should().Be(userId);
	result.TenantId.Should().Be(tenantId);
	result.Email.Should().Be(TestConstants.AcmeUserEmail);
	result.Level.Should().NotBeNullOrWhiteSpace();
	result.Status.Should().NotBeNullOrWhiteSpace();
	result.CreatedAt.Should().NotBe(default);
	result.UpdatedAt.Should().NotBe(default);
}
```

- [ ] **Step 3: Add malformed ID and missing-membership tests**

Add these tests:

```csharp
[Fact]
public async Task ItShouldReturnBadRequestWhenTenantIdIsMalformed() {
	var staffToken = await _authClient.LoginAsStaffAdminAsync();

	using var request = new HttpRequestMessage(
		HttpMethod.Get,
		GetUrl("not-a-guid", Guid.NewGuid().ToString())
	).WithSessionToken(staffToken);

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
	problem.Should().NotBeNull();
	problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
}

[Fact]
public async Task ItShouldReturnBadRequestWhenUserIdIsMalformed() {
	var staffToken = await _authClient.LoginAsStaffAdminAsync();
	var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
		_http,
		staffToken,
		SeedConstants.Tenants.AcmeName
	);

	using var request = new HttpRequestMessage(
		HttpMethod.Get,
		GetUrl(tenantId.ToString(), "not-a-guid")
	).WithSessionToken(staffToken);

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
	problem.Should().NotBeNull();
	problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
}

[Fact]
public async Task ItShouldReturnNotFoundWhenMembershipDoesNotExist() {
	var staffToken = await _authClient.LoginAsStaffAdminAsync();
	var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
		_http,
		staffToken,
		SeedConstants.Tenants.AcmeName
	);

	using var request = new HttpRequestMessage(
		HttpMethod.Get,
		GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
	).WithSessionToken(staffToken);

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.NotFound);
}
```

- [ ] **Step 4: Add forbidden coverage**

Add this test:

```csharp
[Fact]
public async Task ItShouldReturnForbiddenForTenantUser() {
	var staffToken = await _authClient.LoginAsStaffAdminAsync();
	var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
		_http,
		staffToken,
		SeedConstants.Tenants.AcmeName
	);
	var userId = await GetUserIdByEmailAsync(
		_http,
		staffToken,
		tenantId,
		TestConstants.AcmeUserEmail
	);
	var tenantToken = await _authClient.LoginAsTenantUserAsync(
		TestConstants.AcmeUserEmail
	);

	using var request = new HttpRequestMessage(
		HttpMethod.Get,
		GetUrl(tenantId.ToString(), userId)
	).WithSessionToken(tenantToken);

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
}
```

- [ ] **Step 5: Run the new spec and confirm it fails**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetTenantUserAsStaffSpec"
```

Expected: FAIL because `GET /staff/tenants/{tenantId}/users/{userId}` is not mapped yet.

### Task 2: Implement Tenant-User GET Service And Handler

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/GetTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`

- [ ] **Step 1: Add timestamps to `TenantUserDetailsResult`**

In `UpdateTenantUserAsStaff.cs`, extend the existing DTO:

```csharp
public class TenantUserDetailsResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
	public string? AvatarUrl { get; set; }
	public string Level { get; set; } = string.Empty;
	public string Status { get; set; } = string.Empty;
	public Guid? TenantId { get; set; }
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
}
```

Then update the `UpdateTenantUserAsStaff` success mapper:

```csharp
CreatedAt = userData.User.CreatedAt,
UpdatedAt = userData.User.UpdatedAt,
```

- [ ] **Step 2: Add the service interface method**

In `IUserService`, after `FindTenantUsersAsync(...)`, add:

```csharp
Task<TenantUserData?> GetTenantUserByIdAsync(
	Guid tenantId,
	Guid userId,
	CancellationToken cancellationToken = default
);
```

- [ ] **Step 3: Implement the service method**

In `UserService`, near `FindTenantUsersAsync(...)`, add:

```csharp
public async Task<TenantUserData?> GetTenantUserByIdAsync(
	Guid tenantId,
	Guid userId,
	CancellationToken cancellationToken = default
) {
	return await (
		from ua in _dbContext.UserAccount.AsNoTracking()
		where ua.TenantId == tenantId
			&& ua.UserId == userId
			&& ua.Scope == AccountScope.Tenant
			&& !ua.IsDeleted
			&& !ua.User.IsDeleted
		select new TenantUserData {
			User = ua.User,
			Account = ua,
			AccountLevel = ua.Level,
		}
	).FirstOrDefaultAsync(cancellationToken);
}
```

This intentionally includes suspended users and suspended tenant memberships so
staff can inspect and recover lifecycle state.

- [ ] **Step 4: Create the GET handler**

Create `GetTenantUserAsStaff.cs`:

```csharp
using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public class GetTenantUserAsStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleGetTenantUserAsStaff(
		[FromRoute] string tenantId,
		[FromRoute] string userId,
		[FromServices] IUserService userService,
		[FromServices] ILogger<GetTenantUserAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var userData = await userService.GetTenantUserByIdAsync(
			tenantIdGuid,
			userIdGuid,
			cancellationToken
		);

		if (userData is null) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Tenant user membership not found: {@LogData}",
					new { TenantId = tenantIdGuid, UserId = userIdGuid }
				);
			}

			return TypedProblems.NotFound(
				"User not found in tenant",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(new TenantUserDetailsResult {
			Id = userData.User.GetRequiredId(),
			Email = userData.User.Email,
			FirstName = userData.User.FirstName,
			LastName = userData.User.LastName,
			AvatarUrl = userData.User.AvatarUrl,
			Level = UserAccount.GetLevelDescription(userData.AccountLevel),
			Status = UserAccount.GetStatusDescription(
				UserAccount.GetTenantStatus(
					userData.User.Status,
					userData.Account.Status
				)
			),
			TenantId = userData.Account.TenantId,
			CreatedAt = userData.User.CreatedAt,
			UpdatedAt = userData.User.UpdatedAt,
		});
	}
}
```

- [ ] **Step 5: Run the focused spec and confirm it still fails at routing**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetTenantUserAsStaffSpec"
```

Expected: still FAIL until the endpoint is mapped.

### Task 3: Map Endpoint And Regenerate Client

**Files:**
- Modify: `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs`
- Generated: `packages/client-ts/**`

- [ ] **Step 1: Map the GET endpoint**

In `UserEndpointsForTenantAsStaff.cs`, add this mapping after the find endpoint:

```csharp
group.MapGet(
	Routes.Users.ForTenantAsStaff.GetById,
	GetTenantUserAsStaff.HandleGetTenantUserAsStaff
)
	.WithName("GetTenantUserAsStaff")
	.WithSummary("Get a tenant user")
	.WithPermission([AppPermissions.Staff.Users.GET_FOR_TENANT]);
```

- [ ] **Step 2: Run the focused API spec**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetTenantUserAsStaffSpec"
```

Expected: PASS for the new GET spec.

- [ ] **Step 3: Build API and regenerate the TypeScript client**

Run from the repo root:

```powershell
just build-api
just generate-client
```

Expected: `packages/client-ts/src/staff/tenants/item/users/item/index.ts` now exposes a `get(...)` method.

### Task 4: Add Frontend Route Helper, Route, Schema, And Query Hook

**Files:**
- Modify: `packages/shared-ts/lib/constants.ts`
- Create: `packages/shared-ts/validations/tenant-user.validations.ts`
- Modify: `apps/front/src/routes/_tree/staff/_parts/staff-tenants.routes.ts`
- Modify: `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

- [ ] **Step 1: Add tenant-scoped route helpers**

In `FRONT_PATH_NAMES.staff.tenants.details`, add a `users` object beside `tabs`:

```ts
users: {
	root: makePath(
		ROOTS.STAFF,
		RESOURCE.tenants,
		'details',
		tenantId,
		'users',
	),
	details: (userId = '') => {
		return makePath(
			ROOTS.STAFF,
			RESOURCE.tenants,
			'details',
			tenantId,
			'users',
			userId,
		);
	},
},
```

Keep `tabs.users` unchanged so existing tab code keeps working.

- [ ] **Step 2: Register the nested frontend route**

In `staff-tenants.routes.ts`, add this sibling route after the `users` tab route:

```ts
route(
	getLastPath(
		FRONT_PATH_NAMES.staff.tenants
			.details(':tenantId')
			.users.details(':userId'),
		2,
	),
	'routes/authed/staff/tenants/details/users/details/tenant-user-details-page.tsx',
),
```

Expected route path under the tenant details layout: `users/:userId`.

- [ ] **Step 3: Create the tenant-user validation schema**

Create `packages/shared-ts/validations/tenant-user.validations.ts`:

```ts
import { ACCOUNT_LEVEL_ENUM } from '@org/shared-ts/lib/constants';
import type InterZod from '@org/shared-ts/lib/zod/InterZod';

import { getFileSchemaClientSide } from './file/file-client.validations';

export const getUpdateTenantUserSchema = (z: InterZod) => {
	return z.object({
		id: z.string(),
		tenantId: z.string(),
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		avatar: getFileSchemaClientSide(z).or(z.string()).optional(),
		level: z
			.enum([ACCOUNT_LEVEL_ENUM.ADMIN, ACCOUNT_LEVEL_ENUM.USER] as const)
			.optional(),
	});
};
```

- [ ] **Step 4: Add the query hook**

In `staff-tenant.hooks.ts`, add after `useFindTenantUsers`:

```ts
export const useGetTenantUser = createStaffQuery({
	queryKeyFn: (client) =>
		client.staff.tenants.byTenantId('').users.byUserId('').get,
	fetcher: async (
		client,
		params: {
			tenantId: string;
			userId: string;
		},
	) => {
		const result = await client.staff.tenants
			.byTenantId(params.tenantId)
			.users.byUserId(params.userId)
			.get();

		if (isNil(result)) {
			throw new Error('useGetTenantUser: result is nil');
		}

		return result;
	},
});
```

- [ ] **Step 5: Run frontend type checking for generated-client integration**

Run:

```powershell
just tsc-front
```

Expected: FAIL until the page files are created if the route module is now referenced; no generated-client `get` method errors should remain.

### Task 5: Build Tenant-User Details Page With Staff User Details Primitives

**Files:**
- Create: `apps/front/src/routes/authed/staff/tenants/details/users/details/tenant-user-details-page.tsx`
- Create: `apps/front/src/routes/authed/staff/tenants/details/users/details/_components/tenant-user-details-page-skeleton.tsx`
- Create: `apps/front/src/routes/authed/staff/tenants/details/users/details/_components/tenant-user-update-form.tsx`
- Modify: `packages/shared-ts/lib/i18n/json/common.en.json`
- Modify: `packages/shared-ts/lib/i18n/json/common.fr.json`

- [ ] **Step 1: Create the page skeleton**

Create `tenant-user-details-page-skeleton.tsx` by adapting the existing Staff user skeleton. Keep the same primitives and dimensions:

```tsx
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

import { DashboardContent } from '#app/layouts/dashboard/content.tsx';

export const TenantUserDetailsPageSkeleton = () => {
	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="md"
		>
			<Box sx={{ mb: { xs: 3, md: 5 } }}>
				<Skeleton variant="text" width="38%" height={44} />
				<Skeleton variant="text" width="52%" height={22} />
			</Box>

			<Box sx={{ containerType: 'inline-size' }}>
				<Box
					sx={{
						display: 'grid',
						gap: 3,
						alignItems: 'start',
						gridTemplateColumns: '1fr',
						'@container (min-width: 837px)': {
							gridTemplateColumns: '1fr 2fr',
						},
					}}
				>
					<Card sx={{ pt: 8, pb: 5, px: 3, height: 'fit-content' }}>
						<Box sx={{ textAlign: 'center' }}>
							<Skeleton
								variant="circular"
								width={120}
								height={120}
								sx={{ mx: 'auto', mb: 2 }}
							/>
							<Skeleton
								variant="rounded"
								width={96}
								height={28}
								sx={{ mx: 'auto', borderRadius: 999 }}
							/>
						</Box>

						<Divider sx={{ my: 3, borderStyle: 'dashed' }} />

						<Stack spacing={2} sx={{ px: 2 }}>
							{['email', 'level', 'createdAt', 'updatedAt'].map((key) => (
								<Box
									key={key}
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 1.5,
									}}
								>
									<Skeleton variant="circular" width={20} height={20} />
									<Box sx={{ flexGrow: 1, minWidth: 0 }}>
										<Skeleton variant="text" width="38%" height={16} />
										<Skeleton variant="text" width="68%" height={20} />
									</Box>
								</Box>
							))}
						</Stack>
					</Card>

					<Stack spacing={3}>
						<Card sx={{ p: 3 }}>
							<Skeleton variant="text" width="42%" height={36} sx={{ mb: 3 }} />
							<Box sx={{ display: 'grid', rowGap: 3, columnGap: 2 }}>
								{['lastName', 'firstName', 'level'].map((key) => (
									<Box key={key} sx={{ display: 'grid', rowGap: 1 }}>
										<Skeleton variant="text" width="28%" height={20} />
										<Skeleton
											variant="rounded"
											width="100%"
											height={56}
											sx={{ borderRadius: 1 }}
										/>
									</Box>
								))}
							</Box>
							<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
								<Skeleton variant="rounded" width={140} height={40} />
							</Stack>
						</Card>

						<Card sx={{ p: 3 }}>
							<Skeleton variant="text" width="24%" height={28} sx={{ mb: 1 }} />
							<Skeleton variant="text" width="78%" height={18} />
							<Skeleton variant="text" width="62%" height={18} sx={{ mb: 3 }} />
							<Stack direction="row" spacing={2}>
								<Skeleton variant="rounded" width={120} height={36} />
								<Skeleton variant="rounded" width={120} height={36} />
							</Stack>
						</Card>
					</Stack>
				</Box>
			</Box>
		</DashboardContent>
	);
};
```

- [ ] **Step 2: Create the page shell**

Create `tenant-user-details-page.tsx` with the same structure as Staff user details:

```tsx
import Box from '@mui/material/Box';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import toLower from 'lodash/toLower';
import toStr from 'lodash/toString';
import type { FC } from 'react';
import { data, useParams } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import View400 from '#app/components/error/400-view.tsx';
import { NotFoundView } from '#app/components/error/not-found-view.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useGetTenantUser } from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/tenant-user-details-page';
import { TenantUserDetailsPageSkeleton } from './_components/tenant-user-details-page-skeleton';
import TenantUserUpdateForm, {
	type TenantUserUpdateData,
} from './_components/tenant-user-update-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str = capitalize(t('edit-item', { item: toLower(t('tenant-user')) }));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [{ title: getPageTitle(t, true) }];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [{ title: getPageTitle(t, true) }],
		});
	},
});

export const clientLoader = async ({
	serverLoader,
}: Route.ClientLoaderArgs) => {
	i18next.loadNamespaces([I18N_NAMESPACES.ZOD]).catch((error) => {
		logger.error('Failed to load namespaces', error);
	});
	const serverData = await serverLoader();
	return data(serverData);
};
clientLoader.hydrate = true as const;

const TenantUserDetailsPage = () => {
	const { t } = useTranslate();
	const { tenantId, userId } = useParams();
	const getByIdQuery = useGetTenantUser({
		variables: { tenantId: tenantId ?? '', userId: userId ?? '' },
		enabled: !!tenantId && !!userId,
	});

	if (!tenantId || !userId) {
		return <View400 title="Bad Request" description="Tenant ID and user ID are required" />;
	}

	return (
		<QueryDisplay
			query={getByIdQuery}
			LoadingSlot={<TenantUserDetailsPageSkeleton />}
			ErrorSlot={ErrorView}
		>
			{({ data }) => {
				const fullName = getUserFullName(data);
				const title = fullName || data?.email || t('un-named');

				const currentUser: TenantUserUpdateData = {
					id: toStr(data?.id),
					tenantId,
					firstName: data?.firstName ?? undefined,
					lastName: data?.lastName ?? undefined,
					email: data?.email ?? undefined,
					avatar: data?.avatarUrl ?? undefined,
					level: data?.level ?? undefined,
					status: data?.status ?? undefined,
					createdAt: data?.createdAt ?? undefined,
					updatedAt: data?.updatedAt ?? undefined,
				};

				return (
					<DashboardContent
						sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
						maxWidth="md"
						compact
					>
						<CustomBreadcrumbs
							heading={title}
							links={[
								{
									name: capitalize(t('tenants')),
									href: FRONT_PATH_NAMES.staff.tenants.root,
								},
								{
									name: capitalize(t('users')),
									href: FRONT_PATH_NAMES.staff.tenants
										.details(tenantId)
										.users.root,
								},
								{ name: capitalize(t('details')) },
							]}
							sx={{ mb: { xs: 3, md: 5 } }}
						/>

						<TenantUserUpdateForm currentUser={currentUser} />
					</DashboardContent>
				);
			}}
		</QueryDisplay>
	);
};

export default TenantUserDetailsPage;

const ErrorView: FC<{ error: unknown }> = ({ error }) => {
	const { t } = useTranslate();
	const failure = toApiFailure(error);

	if (
		isProblemFailure(failure) &&
		(failure.status === 404 ||
			(failure.status === 400 && failure.translationKey === 'malformed-id'))
	) {
		return (
			<NotFoundView
				withLayout={false}
				title={capitalize(t('tenant-user-not-found-title'))}
				description={t('tenant-user-not-found-description')}
			/>
		);
	}

	return (
		<Box sx={{ py: 10 }}>
			<ErrorContent
				title={t('tenant-user-details-error-title')}
				description={t('tenant-user-details-error-description')}
			/>
		</Box>
	);
};
```

- [ ] **Step 3: Create the update form with Staff user details primitives**

Create `tenant-user-update-form.tsx`. Start with these types and update flow:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import values from 'lodash/values';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type zod from 'zod';

import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { mbToBytes } from '@org/shared-ts/utils/any.utils';
import { getUpdateTenantUserSchema } from '@org/shared-ts/validations/tenant-user.validations';

import { ConfirmDialog } from '#app/components/custom-dialog/confirm-dialog.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { toast } from '#app/components/snackbar/index.ts';
import { StatusChip } from '#app/components/status-chip/status-chip.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import {
	useFindTenantUsers,
	useGetTenantUser,
	useReactivateTenantUser,
	useRemoveTenantUser,
	useSuspendTenantUser,
	useUpdateTenantUser,
} from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';
import { fData } from '#app/utils/format-number.ts';
import { fDateTime } from '#app/utils/format-time.ts';

const TENANT_USER_STATUS_COLOR_MAP = {
	Active: 'success',
	Suspended: 'warning',
	GloballySuspended: 'error',
} as const;

type UpdateTenantUserSchemaType = Prettify<
	zod.infer<ReturnType<typeof getUpdateTenantUserSchema>>
>;

export type TenantUserUpdateData = {
	id: string;
	tenantId: string;
	firstName?: string;
	lastName?: string;
	level?: string;
	email?: string;
	status?: string;
	avatar?: string;
	createdAt?: Date;
	updatedAt?: Date;
};

const ACCOUNT_LEVEL_OPTIONS: AccountLevel[] = values(ACCOUNT_LEVEL_ENUM);
```

Then implement the submit logic:

```tsx
const TenantUserUpdateForm = ({
	currentUser,
}: {
	currentUser: TenantUserUpdateData;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const UpdateTenantUserSchema = getUpdateTenantUserSchema(interZodClient);

	const evaluatedLevel = ACCOUNT_LEVEL_OPTIONS.includes(
		currentUser.level as AccountLevel,
	)
		? (currentUser.level as AccountLevel)
		: undefined;

	const form = useForm<UpdateTenantUserSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(UpdateTenantUserSchema),
		values: {
			id: currentUser.id,
			tenantId: currentUser.tenantId,
			firstName: currentUser.firstName,
			lastName: currentUser.lastName,
			avatar: currentUser.avatar,
			level: evaluatedLevel,
		},
	});

	const { mutate: updateTenantUser, isPending: isUpdating } =
		useUpdateTenantUser({
			onSuccess: () => {
				form.reset();
				toast.success(
					capitalize(
						t('item-update-success-message', { item: t('tenant-user') }),
					),
				);
				void queryClient.invalidateQueries({
					queryKey: useFindTenantUsers.getKey({
						tenantId: currentUser.tenantId,
					}),
				});
				void queryClient.invalidateQueries({
					queryKey: useGetTenantUser.getKey({
						tenantId: currentUser.tenantId,
						userId: currentUser.id,
					}),
				});
			},
		});

	return (
		<Form
			methods={form}
			onSubmit={form.handleSubmit((data) => {
				const dirtyFields = form.formState.dirtyFields;
				const payload: {
					tenantId: string;
					userId: string;
					firstName?: string | null;
					lastName?: string | null;
					avatarUrl?: string | null;
					level?: 'Admin' | 'User';
				} = {
					tenantId: data.tenantId,
					userId: data.id,
				};

				if (dirtyFields.firstName) {
					payload.firstName = data.firstName ?? null;
				}

				if (dirtyFields.lastName) {
					payload.lastName = data.lastName ?? null;
				}

				if (dirtyFields.avatar && typeof data.avatar === 'string') {
					payload.avatarUrl = data.avatar;
				}

				if (dirtyFields.level) {
					payload.level = data.level;
				}

				updateTenantUser(payload);
			})}
		>
			{/* Use the same two-column Card layout as StaffUserUpdateForm. */}
		</Form>
	);
};

export default TenantUserUpdateForm;
```

Fill the form body with the same Card/Stack layout as `StaffUserUpdateForm`, replacing:

- heading text with `t('tenant-user-details')`
- `accountLevel` field with `level`
- `DangerZoneCard` with the tenant-scoped danger-zone component from Step 4

- [ ] **Step 4: Add the tenant-scoped danger-zone card**

In the same `tenant-user-update-form.tsx`, add:

```tsx
const isGloballySuspendedStatus = (status: string | null) => {
	return status === 'GloballySuspended' || status === 'globally_suspended';
};

const DangerZoneCard = ({
	tenantId,
	userId,
	status,
}: {
	tenantId: string;
	userId: string;
	status: string | null;
}) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
	const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
	const isSuspended = status === USER_STATUS_ENUM.SUSPENDED;
	const isGloballySuspended = isGloballySuspendedStatus(status);

	const invalidateTenantUserQueries = async () => {
		await queryClient.invalidateQueries({
			queryKey: useFindTenantUsers.getKey({ tenantId }),
		});
		await queryClient.invalidateQueries({
			queryKey: useGetTenantUser.getKey({ tenantId, userId }),
		});
	};

	const { mutate: suspendUser, isPending: isSuspending } = useSuspendTenantUser({
		onSuccess: async () => {
			toast.success(t('tenant-user-suspended-success'));
			setSuspendDialogOpen(false);
			await invalidateTenantUserQueries();
		},
	});

	const { mutate: reactivateUser, isPending: isReactivating } =
		useReactivateTenantUser({
			onSuccess: async () => {
				toast.success(t('tenant-user-reactivated-success'));
				setReactivateDialogOpen(false);
				await invalidateTenantUserQueries();
			},
		});

	const { mutate: removeUser, isPending: isRemoving } = useRemoveTenantUser({
		onSuccess: async () => {
			toast.success(t('user-removed-success'));
			setRemoveDialogOpen(false);
			await queryClient.invalidateQueries({
				queryKey: useFindTenantUsers.getKey({ tenantId }),
			});
			await navigate(FRONT_PATH_NAMES.staff.tenants.details(tenantId).users.root);
		},
	});

	return (
		<Card
			sx={{
				p: 3,
				minWidth: 0,
				overflow: 'hidden',
				border: '1px solid',
				borderColor: 'error.main',
				bgcolor: (theme) => alpha(theme.palette.error.main, 0.02),
			}}
		>
			<Typography variant="h5" sx={{ color: 'error.main', mb: 1 }}>
				{t('danger-zone')}
			</Typography>
			<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
				{isGloballySuspended
					? t('danger-zone-tenant-user-globally-suspended-description')
					: t('danger-zone-tenant-user-description')}
			</Typography>

			<Stack direction="row" spacing={2}>
				{!isGloballySuspended && !isSuspended ? (
					<Button
						variant="outlined"
						color="warning"
						onClick={() => setSuspendDialogOpen(true)}
					>
						{t('suspend')}
					</Button>
				) : null}

				{!isGloballySuspended && isSuspended ? (
					<Button
						variant="outlined"
						color="success"
						onClick={() => setReactivateDialogOpen(true)}
					>
						{t('reactivate')}
					</Button>
				) : null}

				<Button
					variant="outlined"
					color="error"
					onClick={() => setRemoveDialogOpen(true)}
				>
					{t('remove-user-from-tenant')}
				</Button>
			</Stack>

			<ConfirmDialog
				open={suspendDialogOpen}
				onClose={() => setSuspendDialogOpen(false)}
				title={t('confirm-suspend-tenant-user')}
				content={t('suspend-tenant-user-description')}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={() => suspendUser({ tenantId, userId })}
						disabled={isSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={reactivateDialogOpen}
				onClose={() => setReactivateDialogOpen(false)}
				title={t('confirm-reactivate-tenant-user')}
				content={t('reactivate-tenant-user-description')}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={() => reactivateUser({ tenantId, userId })}
						disabled={isReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={removeDialogOpen}
				onClose={() => setRemoveDialogOpen(false)}
				title={t('remove-user-from-tenant')}
				content={t('confirm-remove-user-from-tenant-details')}
				action={
					<Button
						variant="contained"
						color="error"
						onClick={() => removeUser({ tenantId, userId })}
						disabled={isRemoving}
					>
						{t('remove')}
					</Button>
				}
			/>
		</Card>
	);
};
```

- [ ] **Step 5: Add translation keys**

Add these English keys to `common.en.json`:

```json
{
  "tenant-user": "tenant user",
  "tenant-user-details": "Tenant user details",
  "tenant-user-not-found-title": "Tenant user not found",
  "tenant-user-not-found-description": "This user does not exist in this tenant, or you no longer have access to this membership.",
  "tenant-user-details-error-title": "Failed to load tenant user data",
  "tenant-user-details-error-description": "We couldn't load the tenant user details. Please try again or contact support if the problem persists.",
  "danger-zone-tenant-user-description": "These actions affect this user's membership in this tenant. They do not necessarily change the user's global identity.",
  "danger-zone-tenant-user-globally-suspended-description": "This user is globally suspended. Tenant-level recovery is disabled until the global identity is reactivated.",
  "confirm-remove-user-from-tenant-details": "Are you sure you want to remove this user from this tenant? They will lose access to this tenant."
}
```

Add matching French keys to `common.fr.json`:

```json
{
  "tenant-user": "utilisateur du locataire",
  "tenant-user-details": "Détails de l'utilisateur du locataire",
  "tenant-user-not-found-title": "Utilisateur du locataire introuvable",
  "tenant-user-not-found-description": "Cet utilisateur n'existe pas dans ce locataire, ou vous n'avez plus accès à cette appartenance.",
  "tenant-user-details-error-title": "Échec du chargement des données de l'utilisateur du locataire",
  "tenant-user-details-error-description": "Nous n'avons pas pu charger les détails de l'utilisateur du locataire. Veuillez réessayer ou contacter le support si le problème persiste.",
  "danger-zone-tenant-user-description": "Ces actions affectent l'appartenance de cet utilisateur à ce locataire. Elles ne modifient pas nécessairement son identité globale.",
  "danger-zone-tenant-user-globally-suspended-description": "Cet utilisateur est suspendu globalement. La récupération au niveau du locataire est désactivée jusqu'à la réactivation de l'identité globale.",
  "confirm-remove-user-from-tenant-details": "Êtes-vous sûr de vouloir retirer cet utilisateur de ce locataire ? Il perdra l'accès à ce locataire."
}
```

- [ ] **Step 6: Run frontend type checking**

Run:

```powershell
just tsc-front
```

Expected: PASS after generated route types catch up. If route type generation is needed first, run the repo's normal frontend build/type command once and re-run `just tsc-front`.

### Task 6: Update Tenant-Users Table Details Links

**Files:**
- Modify: `apps/front/src/routes/authed/staff/tenants/details/users/_parts/tenant-users-table.tsx`

- [ ] **Step 1: Update `UserCell` to include tenant context**

Change `UserCell` so it reads `tenantId`:

```tsx
const UserCell: MRT_ColumnDef<TenantUserRowData, string>['Cell'] = (props) => {
	const fullName = props.cell.getValue();
	const { tenantId } = useParams();
	const { id, avatarUrl, email } = props.row.original;
	const normalizedAvatarUrl = trim(avatarUrl);
	const userDetailsLink = FRONT_PATH_NAMES.staff.tenants
		.details(tenantId ?? '')
		.users.details(id);
```

Keep the existing `RouterLink` usage.

- [ ] **Step 2: Update `UserDetailsDrawerAction` to include tenant context**

Change `UserDetailsDrawerAction`:

```tsx
const UserDetailsDrawerAction = ({
	user,
	disabled,
	disabledReason,
}: UserDetailsDrawerActionProps) => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const detailsDrawer = useBoolean();
	const userDetailsLink = FRONT_PATH_NAMES.staff.tenants
		.details(tenantId ?? '')
		.users.details(user.id);
```

Keep the existing drawer expand affordance.

- [ ] **Step 3: Remove the broken helper from this workflow**

Search:

```powershell
rg "staff\\.tenantUsers\\.details" apps/front/src packages/shared-ts
```

Expected after this task: no references in the tenant users table. If other
references remain outside this workflow, leave them for a separate cleanup unless
they also navigate to issue-386 broken paths.

- [ ] **Step 4: Run frontend type checking**

Run:

```powershell
just tsc-front
```

Expected: PASS.

### Task 7: Full Verification

**Files:**
- Verify all files changed by Tasks 1-6.

- [ ] **Step 1: Run API verification**

Run:

```powershell
just build-api
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetTenantUserAsStaffSpec"
```

Expected: PASS.

- [ ] **Step 2: Regenerate client and run frontend verification**

Run from the repo root:

```powershell
just generate-client
just tsc-front
just check-write
```

Expected: PASS.

- [ ] **Step 3: Manual smoke test**

Run the app:

```powershell
just dev-api
just dev-front
```

Then verify:

- open `/staff/tenants/details/{tenantId}/users`
- click a tenant user's name
- confirm the browser opens `/staff/tenants/details/{tenantId}/users/{userId}`
- click the drawer expand action and confirm the same route opens
- edit first name, last name, and level; save; refresh; confirm values persist
- suspend an active tenant membership from the details danger zone
- reactivate a suspended tenant membership from the details danger zone
- remove a user from tenant and confirm navigation returns to the tenant users tab
- visit the route with a malformed `tenantId`; confirm bad-request/not-found UX without logout
- visit the route with a random valid `userId`; confirm not-found UX without logout

Expected: issue 386 no longer reproduces and the new page visually matches the Staff user details primitive set.

## Self-Review

### Spec coverage

- Tenant-aware URL: covered in Tasks 4 and 6.
- Backend scoped GET endpoint: covered in Tasks 1-3.
- Full editable page: covered in Task 5.
- Same Staff user details primitives: explicitly required in Task 5.
- Tenant-scoped lifecycle/remove actions: covered in Task 5.
- API regeneration and frontend verification: covered in Tasks 3 and 7.

### Placeholder scan

- No placeholder markers or deferred edge-case instructions remain.
- Every task names exact files and expected commands.

### Type consistency

- Backend DTO is `TenantUserDetailsResult`.
- Frontend query hook is `useGetTenantUser`.
- Frontend form data uses `level`, matching `useUpdateTenantUser`.
- Route helper is `FRONT_PATH_NAMES.staff.tenants.details(tenantId).users.details(userId)`.
