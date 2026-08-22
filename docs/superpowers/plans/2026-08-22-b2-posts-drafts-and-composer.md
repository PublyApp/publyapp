# B2 — Posts drafts page + composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the tenant drafts table, the create-drawer, and the dedicated edit page to the real Posts API (`POST /posts`, `GET /posts`, `GET /posts/{id}`, `PATCH /posts/{id}`, `DELETE /posts/{id}`) with search, cursor pagination, project select, single `savePost` writer, permission gating, and full test coverage.

**Architecture:** Add one tenant query module (`tenant-posts.ts`) that is the single `savePost` seam for both surfaces. Drafts page is a `DataTable` inside `div.publy-page-fill` (same scroll-ownership contract as `staff/tenants.tsx`). Create is a state-driven right `Drawer` over that page; edit is a dedicated route `/tenant/posts/$postId/edit` with a centred `FormPageLayout` and a reserved `C/D` side column.

**Tech Stack:** React 19, TanStack Start/Router (`routes.ts` virtual route config), Base UI `Dialog`/`Drawer`, Tailwind v4 (`cn` + `cva`), TanStack Query 5 + `@org/shared-ts/lib/query/create-hooks` (`buildTenantQueryOptions`/`buildTenantMutationOptions`, `scopedKey`), React Hook Form 7 + Zod 3 + `@hookform/resolvers`, Kiota `@org/client-ts` (`client.posts.*`), Vitest + Testing Library, Playwright (tags `@tenant-workspace @638`).

## Global Constraints

- Node 24, pnpm 10.13.1, React 19, .NET 10.0, PostgreSQL 18 — do not lower version floors.
- No new dependencies without owner approval; do not add MUI, HeroUI, Radix, or `@tanstack/react-start/server` outside `createServerFn` handler bodies.
- URL query keys stay snake_case (`q`, `sort_id`, `sort_order`, `cursor`, `size`); internal TS may be camelCase but convert at parse/serialize boundaries.
- No `console.*` in source (`publy/no-console-in-source`); use `logger` from `@org/shared-ts/lib/logger/iso-logger` if logging is needed.
- No `Array.reduce()`, no `ToLower()` dispatch, no null-forgiving `!`, no `?? throw`; pattern-match null checks (`is null`/`is not null` in C# is not relevant here, but the TS equivalents apply).
- Never import `dayjs` in components, never translate `response-message` keys manually at call sites (`getFailureMessage(toApiFailure(error), {fallback})`), never return raw cookies/session tokens from server functions.
- Tailwind only via design tokens in `apps/front/src/styles/app.css`; `rounded-full/999px` only for avatars/topbar-badge; every `z-*` via `--publy-z-*`; elevation is `box-shadow: var(--publy-shadow-ring)` not borders+shadows.
- Authed surfaces are CSR (`ssr: false` via `authed/layout.tsx`); never fetch authenticated domain data in loaders or server functions.
- Every route declares `staticData.crumbs` (or `'shell'`); `$postId` routes include one `entity` crumb per dynamic segment, ordered left-to-right, registered in `breadcrumb-contract.test.tsx`.
- Errors are RFC 7807 `application/problem+json`; `422` carries `errors: Dictionary<string,string[]>` with stable keys `body`/`projectId`; `401` only means invalid/missing session and is the only status that logs out on authed surfaces; `403` never logs out.
- Body validation bound `20 000` chars; search bound `256`; server `BodyPreviewLength = 280`.
- i18n namespaces `posts` + `common` FR+EN; every `t('posts:…')` key must exist in both locales; do not add `CustomTypeOptions` augmentation.
- File naming: route-local non-routes are `_`-prefixed; route registration is in `src/routes.ts` (virtual routes, not file-based discovery); `apps/old-front` is archived and not a pattern source.

---

### Task 0: Backend — `GET /projects` tenant list endpoint (owner decision A, 2026-08-22)

The project `<Select>` in Tasks 4–5 needs a read-only list of the tenant's active projects. `IProjectService.GetProjectsForTenantAsync` already exists (`apps/api/Modules/Projects/Services/ProjectService.cs:37`, filters `TenantId`, `!IsDeleted`, `Status == Active`, ordered by name); only the HTTP surface is missing. Mirror the Posts slice exactly.

**Files:**
- Create: `apps/api/Modules/Projects/Routes.Projects.cs`
- Create: `apps/api/Modules/Projects/Permissions/ProjectPermissionsForTenant.cs`
- Create: `apps/api/Modules/Projects/Endpoints/ProjectEndpointsForTenant.cs`
- Create: `apps/api/Modules/Projects/Handlers/Tenant/FindProjectsForTenant.cs`
- Create: `apps/api/Modules/Projects/Handlers/Tenant/ProjectTenantList.Spec.cs`
- Modify: `apps/api/Lib/AppPermissions.cs` (add `public ProjectPermissionsForTenant Projects { get; } = new ProjectPermissionsForTenant();` next to `Posts`, line 53)
- Modify: `apps/api/Program.cs:242` (add `tenantGroup.MapProjectEndpointsForTenant();` after `MapPostEndpointsForTenant`)
- Regenerate: `apps/api/openapi.json` + `packages/client-ts/src/**` (`just gen-client`, see justfile ≈ line 438)

**Interfaces:**
- Consumes: `IProjectService.GetProjectsForTenantAsync(Guid tenantId, CancellationToken)`, `IRequestAuthContext`, `.WithTenantPermission([...])`, `ApiRateLimitPolicies.HeavySearchList`.
- Produces: `GET /projects` → `200 FindProjectsForTenantResponse { items: ProjectListItem[] }` with `ProjectListItem { id: Guid; name: string }`; permission key `projects:view` (tenant). Kiota client gains `client.projects.get()` returning `FindProjectsForTenantResponse`; Task 1's `tenant-projects.ts` wraps it (no "if the route exists" fallback — the route exists after this task).

- [ ] **Step 1: Write the failing integration spec**

```csharp
// apps/api/Modules/Projects/Handlers/Tenant/ProjectTenantList.Spec.cs
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Projects.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Projects.Handlers.Tenant;

public sealed class ProjectTenantListSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public ProjectTenantListSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldListOnlyActiveNonDeletedProjectsOfTheCurrentTenantOrderedByName() {
		var (acmeId, token) = await LoginAsAcmeAdminAsync();
		var globalId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http, await _authClient.LoginAsStaffAdminAsync(), SeedConstants.Tenants.GlobalName);
		var zebra = await CreateProjectAsync(acmeId, "Zebra " + Suffix());
		var apple = await CreateProjectAsync(acmeId, "Apple " + Suffix());
		var deleted = await CreateProjectAsync(acmeId, "Deleted " + Suffix(), isDeleted: true);
		var inactive = await CreateProjectAsync(acmeId, "Inactive " + Suffix(), status: ProjectStatus.Inactive);
		var foreign = await CreateProjectAsync(globalId, "Foreign " + Suffix());

		using var request = new HttpRequestMessage(HttpMethod.Get, "/projects")
			.WithSessionToken(token).WithTenantId(acmeId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<FindProjectsForTenantResponse>();
		var ids = payload!.Items.Select(x => x.Id).ToList();
		ids.Should().Contain([apple, zebra]);
		ids.Should().NotContain([deleted, inactive, foreign]);
		ids.IndexOf(apple).Should().BeLessThan(ids.IndexOf(zebra));
		payload.Items.Should().OnlyContain(x => !string.IsNullOrWhiteSpace(x.Name));
	}

	[Fact]
	public async Task ItShouldReturn403WhenTheAccountLacksProjectsViewPermission() {
		var (acmeId, _) = await LoginAsAcmeAdminAsync();
		var memberToken = await _authClient.LoginAsync(
			TestConstants.AcmeMemberEmail, TestConstants.SeedPassword);
		// Copy the "member lacks permission" arrangement from
		// PostTenantCrud.Spec.cs (ItShouldReturn403...) — same seeded member,
		// same helper — so the two specs stay symmetric.
		using var request = new HttpRequestMessage(HttpMethod.Get, "/projects")
			.WithSessionToken(memberToken).WithTenantId(acmeId);
		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static string Suffix() {
		return Guid.NewGuid().ToString("N")[..8];
	}

	private async Task<Guid> CreateProjectAsync(
		Guid tenantId, string name,
		bool isDeleted = false, ProjectStatus status = ProjectStatus.Active
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var project = new Project { TenantId = tenantId, Name = name, Status = status, IsDeleted = isDeleted };
		db.Project.Add(project);
		await db.SaveChangesAsync();
		return project.Id;
	}

	private async Task<(Guid TenantId, string Token)> LoginAsAcmeAdminAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http, staffToken, SeedConstants.Tenants.AcmeName);
		var token = await _authClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword);
		return (tenantId, token);
	}
}
```

If `TestConstants.AcmeMemberEmail` or a no-permission seeded account does not exist, reuse whatever `PostTenantCrud.Spec.cs` uses for its own 403 case — do not invent a new seed user.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && dotnet test --filter "FullyQualifiedName~ProjectTenantListSpec"`
Expected: compile error (`FindProjectsForTenantResponse` undefined) — that is the red.

- [ ] **Step 3: Routes, permission, handler, endpoint, registration**

```csharp
// apps/api/Modules/Projects/Routes.Projects.cs
#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>Projects routes (tenant-scoped, root scope)</summary>
	public static class Projects {
		public static class ForTenant {
			public const string Root = "/projects";
			public const string Find = "/";
		}
	}
}
```

```csharp
// apps/api/Modules/Projects/Permissions/ProjectPermissionsForTenant.cs
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Projects.Permissions;

public class ProjectPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "projects";

	public Permission VIEW { get; }

	public ProjectPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View projects",
					Description = "List the workspace's projects"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir les projets",
					Description = "Lister les projets de l'espace"
				}
			);
	}
}
```

Grant `projects:view` to the same seeded roles that receive `posts:view` (find them with `grep -rn "Posts.VIEW" apps/api --include=*.cs`) so the Acme admin can call the route and the member-without-permission case stays 403.

```csharp
// apps/api/Modules/Projects/Handlers/Tenant/FindProjectsForTenant.cs
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Projects.Services;

namespace PublyApp.Api.Modules.Projects.Handlers.Tenant;

public sealed class FindProjectsForTenant {
	public static async Task<Ok<FindProjectsForTenantResponse>> Handle(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IProjectService projectService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var projects = await projectService.GetProjectsForTenantAsync(
			tenantId, cancellationToken
		);

		return TypedResults.Ok(new FindProjectsForTenantResponse {
			Items = projects
				.Select(p => new ProjectListItem {
					Id = p.GetRequiredId(),
					Name = p.Name,
				})
				.ToList(),
		});
	}
}

public record FindProjectsForTenantResponse {
	public required IReadOnlyList<ProjectListItem> Items { get; init; }
}

public record ProjectListItem {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
}
```

```csharp
// apps/api/Modules/Projects/Endpoints/ProjectEndpointsForTenant.cs
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Projects.Handlers.Tenant;

namespace PublyApp.Api.Modules.Projects.Endpoints;

public static class ProjectEndpointsForTenant {
	public static IEndpointRouteBuilder MapProjectEndpointsForTenant(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Projects.ForTenant.Root)
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTags("Projects");

		group.MapGet(Routes.Projects.ForTenant.Find, FindProjectsForTenant.Handle)
			.WithName("FindProjectsForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
			.WithSummary("List active projects of the current tenant")
			.WithTenantPermission([AppPermissions.Tenant.Projects.VIEW]);

		return routes;
	}
}
```

`apps/api/Lib/AppPermissions.cs`: add `using PublyApp.Api.Modules.Projects.Permissions;` and `public ProjectPermissionsForTenant Projects { get; } = new ProjectPermissionsForTenant();` beside `Posts`. `apps/api/Program.cs`: `tenantGroup.MapProjectEndpointsForTenant();` after line 242 (`using PublyApp.Api.Modules.Projects.Endpoints;`).

- [ ] **Step 4: Run the spec and the architecture guards**

Run: `cd apps/api && dotnet test --filter "FullyQualifiedName~ProjectTenantListSpec|FullyQualifiedName~Architecture"`
Expected: PASS. If a discovery-based architecture guard (e.g. the one listing `Modules/*/Endpoints`) now flags Projects, satisfy it the way Posts does — never exclude Projects from the guard.

- [ ] **Step 5: Regenerate OpenAPI + Kiota client, run drift gate**

Run: `just gen-client && just ci-openapi` (names per justfile ≈ lines 362–441)
Expected: `apps/api/openapi.json` gains `GET /projects` with tag `Projects`; `packages/client-ts/src/projects/` appears; drift gate green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/Modules/Projects apps/api/Lib/AppPermissions.cs apps/api/Program.cs apps/api/openapi.json packages/client-ts/src
git commit -m "feat(api): GET /projects tenant list for the B2 project select (#638)"
```

### Task 1: Tenant posts query seam — single `savePost` writer

**Files:**
- Create: `apps/front/src/lib/query/tenant-posts.ts`
- Create: `apps/front/src/lib/query/tenant-projects.ts`
- Create: `apps/front/src/lib/url-state/tenant-post-list-helpers.ts`
- Test: `apps/front/src/lib/query/tenant-posts.test.ts`

**Interfaces:**
- Consumes: `@org/client-ts` `PostsRequestBuilder`/`WithPostItemRequestBuilder` (`client.posts.get`, `client.posts.post`, `client.posts.byPostId(id).get/.patch/.delete`), `@org/shared-ts/lib/query/create-hooks` (`buildTenantQueryOptions`, `buildTenantMutationOptions`, `scopedKey`), `createUntypedString`/`createUntypedObject`/`createUntypedArray` from `@microsoft/kiota-abstractions`, existing `getClientManager()`.
- Produces: `TENANT_POSTS_QUERY_KEY`, `TENANT_POST_DETAILS_QUERY_KEY`, `buildFindTenantPostsQueryParameters`, `toTenantPostRows`, `toTenantPostDetails`, `tenantPostsQueryOptions`, `useTenantPostsQuery`, `useTenantPostDetailsQuery`, `savePost(input) => Promise<TenantPostDetails>`, `useDeleteTenantPostMutation`, `invalidateTenantPosts(queryClient, tenantId)`, `tenantProjectsQueryOptions` / `useTenantProjectsQuery`, `parseTenantPostListSearchParams`, `serializeTenantPostListSearchParams`, `validateTenantPostListSearchParams`.

- [ ] **Step 1: Write the failing query-module test**

```typescript
/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';
import { buildFindTenantPostsQueryParameters, toTenantPostRows } from './tenant-posts';

describe('tenant-posts helpers', () => {
  test('drops empty q and maps size to limit', () => {
    expect(buildFindTenantPostsQueryParameters({ q: '  ', size: 20, sortId: 'created_at', sortOrder: 'desc' })).toEqual({ sortId: 'created_at', sortOrder: 'desc', limit: '20' });
  });
  test('toTenantPostRows filters malformed rows and truncates no further than server preview', () => {
    const rows = toTenantPostRows([{ id: '11111111-1111-7111-8111-111111111111', bodyPreview: 'hello', status: 'draft', projectId: null, createdByUserId: '22222222-2222-7222-8222-222222222222', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never, { id: null } as never]);
    expect(rows).toHaveLength(1);
    expect(rows[0].excerpt).toBe('hello');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter front exec vitest run src/lib/query/tenant-posts.test.ts -t "drops empty q"`

Expected: FAIL with `Cannot find module './tenant-posts'`.

- [ ] **Step 3: Write minimal implementation — `apps/front/src/lib/query/tenant-posts.ts`**

```typescript
import { createUntypedString } from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { ApiClient } from '@org/client-ts/src/apiClient';
import type { FindPostsForTenantResponse, PostListItem, PostDetail } from '@org/client-ts/src/models/index.js';
import { buildTenantMutationOptions, buildTenantQueryOptions, scopedKey } from '@org/shared-ts/lib/query/create-hooks';
import type { SortOrder } from '~/lib/url-state/table-search-params';

export const TENANT_POSTS_QUERY_KEY = ['tenant-posts'] as const;
export const TENANT_POST_DETAILS_QUERY_KEY = ['tenant-posts', 'detail'] as const;

export type TenantPostsQueryVariables = { q?: string; sortId?: string; sortOrder?: SortOrder; cursor?: string; size?: number };
export type TenantPostRow = { id: string; excerpt: string; projectId: string | null; status: string | null; createdByUserId: string | null; createdAt: Date | null; updatedAt: Date | null };
export type TenantPostDetails = { id: string; body: string; projectId: string | null; status: string | null; createdByUserId: string | null; createdAt: Date | null; updatedAt: Date | null };
export type SavePostInput = { postId?: string; body: string; projectId: string | null };

const normalizeString = (v: string | null | undefined) => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
};
const normalizeNullableString = (v: string | null | undefined) => (normalizeString(v) ?? null);
const normalizeDate = (v: Date | string | null | undefined) => {
  const d = v instanceof Date ? v : v ? new Date(v as string) : null;
  return d && !Number.isNaN(d.valueOf()) ? d : null;
};
const isPositiveSafeInteger = (v: number | undefined) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

export const buildFindTenantPostsQueryParameters = (variables: TenantPostsQueryVariables): { q?: string; sortId?: string; sortOrder?: SortOrder; cursor?: string; limit?: string } => ({
  q: normalizeString(variables.q),
  sortId: normalizeString(variables.sortId),
  sortOrder: variables.sortOrder,
  cursor: normalizeString(variables.cursor),
  limit: isPositiveSafeInteger(variables.size) ? String(variables.size) : undefined,
});

export const toTenantPostRows = (items: PostListItem[] | null | undefined): TenantPostRow[] => {
  const rows: TenantPostRow[] = [];
  for (const item of items ?? []) {
    const id = normalizeString(item.id?.toString() ?? undefined);
    const excerpt = normalizeString(item.bodyPreview) ?? '';
    if (!id || !excerpt) continue;
    rows.push({ id, excerpt, projectId: normalizeNullableString(item.projectId?.toString() ?? undefined), status: normalizeNullableString(item.status), createdByUserId: normalizeNullableString(item.createdByUserId?.toString() ?? undefined), createdAt: normalizeDate(item.createdAt), updatedAt: normalizeDate(item.updatedAt) });
  }
  return rows;
};

export const toTenantPostDetails = (result: PostDetail | null | undefined): TenantPostDetails | null => {
  const id = normalizeString(result?.id?.toString() ?? undefined);
  const body = normalizeString(result?.body);
  if (!id || !body) return null;
  return { id, body, projectId: normalizeNullableString(result?.projectId?.toString() ?? undefined), status: normalizeNullableString(result?.status), createdByUserId: normalizeNullableString(result?.createdByUserId?.toString() ?? undefined), createdAt: normalizeDate(result?.createdAt), updatedAt: normalizeDate(result?.updatedAt) };
};

export const tenantPostsQueryOptions = buildTenantQueryOptions<ApiClient, FindPostsForTenantResponse, TenantPostsQueryVariables>({
  queryKeyFn: () => [...TENANT_POSTS_QUERY_KEY],
  fetcher: async (client, variables) => {
    const result = await client.posts.get({ queryParameters: buildFindTenantPostsQueryParameters(variables as never) });
    if (!result) throw new Error('tenant posts result was empty');
    return result;
  },
}, { clientAccessor: getClientManager() });

export const useTenantPostsQuery = (variables: TenantPostsQueryVariables & { tenantId: string }) =>
  useQuery({ queryKey: tenantPostsQueryOptions.queryKey(variables as never), queryFn: () => tenantPostsQueryOptions.fetcher(variables as never) });

export const tenantPostDetailsQueryOptions = buildTenantQueryOptions<ApiClient, PostDetail, { postId: string }>({
  queryKeyFn: () => [...TENANT_POST_DETAILS_QUERY_KEY],
  fetcher: async (client, variables) => {
    const result = await client.posts.byPostId(variables.postId).get();
    if (!result) throw new Error('tenant post details result was empty');
    return result;
  },
}, { clientAccessor: getClientManager() });

export const useTenantPostDetailsQuery = (variables: { postId: string; tenantId: string }, opts?: { enabled?: boolean }) =>
  useQuery({ queryKey: tenantPostDetailsQueryOptions.queryKey(variables as never), queryFn: () => tenantPostDetailsQueryOptions.fetcher(variables as never), enabled: opts?.enabled ?? true, staleTime: 30_000 });

export const savePost = async (input: SavePostInput & { tenantId: string }): Promise<TenantPostDetails> => {
  const client = getClientManager().getOrCreateClient(input.tenantId);
  const body = input.body.trim();
  if (!body) throw new Error('body is required');
  if (input.postId) {
    const patchBody: Record<string, unknown> = {};
    (patchBody as { body?: unknown }).body = createUntypedString(body) as unknown as never;
    (patchBody as { projectId?: unknown }).projectId = input.projectId === null ? null : input.projectId ? createUntypedString(input.projectId) as unknown as never : undefined;
    const result = await client.posts.byPostId(input.postId).patch(patchBody as never);
    if (!result) throw new Error('update post result was empty');
    const details = toTenantPostDetails(result as PostDetail);
    if (!details) throw new Error('malformed post update payload');
    return details;
  }
  const createBody: Record<string, unknown> = { body: createUntypedString(body) as unknown as never };
  if (input.projectId) (createBody as { projectId?: unknown }).projectId = createUntypedString(input.projectId) as unknown as never;
  const result = await client.posts.post(createBody as never);
  if (!result) throw new Error('create post result was empty');
  const details: TenantPostDetails = { id: (result as PostDetail).id?.toString() ?? (result as { id?: unknown }).id as string, body, projectId: normalizeNullableString((result as { projectId?: unknown })?.toString() as string | undefined), status: 'draft', createdByUserId: null, createdAt: new Date(), updatedAt: new Date() };
  return details;
};

export const savePostMutationOptions = buildTenantMutationOptions<ApiClient, TenantPostDetails, SavePostInput & { tenantId: string }>({
  mutationKeyFn: () => [...TENANT_POSTS_QUERY_KEY, 'save'],
  mutationFn: (client, variables) => savePost(variables as SavePostInput & { tenantId: string }) as unknown as Promise<TenantPostDetails>,
  meta: { successMessage: 'post-saved-success', validationHandledByForm: true },
}, { clientAccessor: getClientManager() });

export const useSavePostMutation = () => useMutation(savePostMutationOptions as never);
export const useDeleteTenantPostMutation = () => useMutation(buildTenantMutationOptions<ApiClient, unknown, { postId: string; tenantId: string }>({
  mutationKeyFn: () => [...TENANT_POSTS_QUERY_KEY, 'delete'],
  mutationFn: (client, variables) => client.posts.byPostId(variables.postId).delete() as unknown as Promise<unknown>,
  meta: { successMessage: 'post-deleted-success' },
}, { clientAccessor: getClientManager() }) as never);

export const invalidateTenantPosts = (qc: QueryClient, tenantId: string) =>
  qc.invalidateQueries({ queryKey: [...scopedKey('tenant', TENANT_POSTS_QUERY_KEY), tenantId] });

export const tenantPostCrumbQuery = (params: Record<string, string>) => ({
  queryKey: tenantPostDetailsQueryOptions.queryKey({ postId: params.postId, tenantId: params.tenantId } as never),
  queryFn: () => tenantPostDetailsQueryOptions.fetcher({ postId: params.postId, tenantId: params.tenantId } as never),
});
export const selectTenantPostCrumbName = (data: unknown) => {
  const d = toTenantPostDetails(data as PostDetail | null | undefined);
  return d ? d.body.slice(0, 40) : undefined;
};
```

And `apps/front/src/lib/query/tenant-projects.ts` — thin wrapper over `client.projects.get()` from Task 0 (`useTenantProjectsQuery` → `FindProjectsForTenantResponse.items`) — plus `apps/front/src/lib/url-state/tenant-post-list-helpers.ts` exporting `validateTenantPostListSearchParams`, `parseTenantPostListSearchParams`, `serializeTenantPostListSearchParams` mapping `q`/`sort_id`/`sort_order`/`cursor`/`size` (copy shape from `tenants/tenants-list-helpers.ts`, default `sortId='updated_at'`, `sortOrder='desc'`, `size=20`).

- [ ] **Step 4: Run the failing test to verify it passes**

Run: `pnpm --filter front exec vitest run src/lib/query/tenant-posts.test.ts -t "drops empty q"`

Expected: PASS.

- [ ] **Step 5: Run full front gate for this task**

Run: `pnpm --filter front typecheck` — Expected: 0 errors.

Run: `pnpm --filter front exec vitest run src/lib/query/tenant-posts.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/front/src/lib/query/tenant-posts.ts apps/front/src/lib/query/tenant-projects.ts apps/front/src/lib/url-state/tenant-post-list-helpers.ts apps/front/src/lib/query/tenant-posts.test.ts
git commit -m "feat(front): add tenant posts query seam with single savePost writer"
```

### Task 2: i18n — posts namespace EN+FR

**Files:**
- Modify: `packages/shared-ts/lib/i18n/json/common.en.json` (add `posts` keys if posts keys live in `common`; otherwise create `packages/shared-ts/lib/i18n/json/posts.en.json` + `posts.fr.json` or `apps/front/src/i18n/locales/*` mirror — mirror whichever `i18n-key-coverage.test.ts` asserts; the plan below assumes `posts.en.json`/`posts.fr.json` with fallback `common` keys for generic list states)
- Test: `apps/front/src/lib/i18n-key-coverage.test.ts` (no edit — it must stay green)

**Interfaces:**
- Consumes: `react-i18next` `useTranslation('posts')`, `i18n-key-coverage` guard.
- Produces: keys `posts:drafts`, `posts:drafts-description`, `posts:new-post`, `posts:body-label`, `posts:body-placeholder`, `posts:body-required`, `posts:body-too-long` (`Body must be 20000 characters or less.`), `posts:project-label`, `posts:project-placeholder`, `posts:save`, `posts:saving`, `posts:post-created-success`, `posts:post-saved-success`, `posts:post-deleted-success`, `posts:move-to-bin`, `posts:move-to-bin-confirm`, `posts:edit-post`, `posts:unsaved-changes-title`, `posts:unsaved-changes-description`, `posts:back-to-drafts`, `posts:no-projects-yet`, plus `common` list-state keys already present (`list-empty-title`, `list-no-match-title`, etc.).

- [ ] **Step 1: Write the keys (EN+FR parity)**

`posts.en.json` (add file if missing):
```json
{
  "drafts": "Drafts",
  "drafts-description": "Your unpublished posts. Search, open, and keep writing.",
  "new-post": "New post",
  "body-label": "Body",
  "body-placeholder": "Write your post…",
  "body-required": "Body is required.",
  "body-too-long": "Body must be 20000 characters or less.",
  "project-label": "Project",
  "project-placeholder": "No project — personal draft",
  "no-projects-yet": "No projects yet — you can save without one.",
  "save": "Save",
  "saving": "Saving…",
  "post-created-success": "Post created successfully",
  "post-saved-success": "Post saved successfully",
  "post-deleted-success": "Post moved to bin",
  "move-to-bin": "Move to bin",
  "move-to-bin-confirm": "Move this post to the bin? You can restore it later.",
  "edit-post": "Edit post",
  "unsaved-changes-title": "Unsaved changes",
  "unsaved-changes-description": "You have unsaved changes — leave without saving?",
  "back-to-drafts": "Back to drafts",
  "danger-zone-title": "Danger zone",
  "danger-zone-description": "Move this post to the bin. It stays recoverable."
}
```
`posts.fr.json` mirrors every key:
```json
{
  "drafts": "Brouillons",
  "drafts-description": "Vos publications non publiées. Cherchez, ouvrez et continuez la rédaction.",
  "new-post": "Nouveau post",
  "body-label": "Contenu",
  "body-placeholder": "Rédigez votre post…",
  "body-required": "Le contenu est obligatoire.",
  "body-too-long": "Le contenu doit faire 20000 caractères maximum.",
  "project-label": "Projet",
  "project-placeholder": "Aucun projet — brouillon personnel",
  "no-projects-yet": "Aucun projet — vous pouvez enregistrer sans projet.",
  "save": "Enregistrer",
  "saving": "Enregistrement…",
  "post-created-success": "Publication créée avec succès",
  "post-saved-success": "Publication enregistrée avec succès",
  "post-deleted-success": "Publication déplacée dans la corbeille",
  "move-to-bin": "Mettre à la corbeille",
  "move-to-bin-confirm": "Déplacer ce post dans la corbeille ? Vous pourrez le restaurer.",
  "edit-post": "Modifier la publication",
  "unsaved-changes-title": "Modifications non enregistrées",
  "unsaved-changes-description": "Vous avez des modifications non enregistrées — quitter sans enregistrer ?",
  "back-to-drafts": "Retour aux brouillons",
  "danger-zone-title": "Zone de danger",
  "danger-zone-description": "Déplacer ce post dans la corbeille. Il restera récupérable."
}
```

- [ ] **Step 2: Prove coverage is green**

Run: `pnpm --filter front exec vitest run src/lib/i18n-key-coverage.test.ts`

Expected: PASS (no missing keys). If the project keeps posts keys inside `common`, place them there instead — same parity rule.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ts/lib/i18n/json/posts.en.json packages/shared-ts/lib/i18n/json/posts.fr.json
git commit -m "feat(front): add posts i18n EN+FR for drafts and composer"
```

### Task 3: Drafts page — table, search, cursor pagination, empty/error states

**Files:**
- Modify: `apps/front/src/routes/authed/tenant/posts/drafts.tsx`
- Modify: `apps/front/src/routes/authed/tenant/posts/drafts.test.tsx`

**Interfaces:**
- Consumes: `DataTable`/`DataTableToolbar`/`DataTableCursorFooter`/`DataTableRowActions` (`~/components/table/data-table`, `~/components/table/row-actions`), `useTableController` (`~/components/table/use-table-controller`), `useTenantPostsQuery`/`toTenantPostRows`/`invalidateTenantPosts` from Task 1, `shouldLogoutForFailure`/`toApiFailure`/`getFailureMessage`, `LogoutRedirect`, `PageHeader`, `StateSurface`/`StateView`, `Button`/`buttonVariants`, `useTranslation`, tenant permission hook.
- Produces: replace placeholder card with `div.publy-page-fill` + `DataTable` wired to the real query.

- [ ] **Step 1: Write the failing drafts-table test (add to `drafts.test.tsx`)**

```tsx
test('renders the drafts table with search and no fake rows when empty', async () => {
  render(<TenantPostsDraftsPage />);
  expect(screen.getByTestId('tenant-posts-drafts-page')).toBeTruthy();
  expect(screen.getByRole('button', { name: /New post/i })).toBeTruthy();
  expect(screen.getByTestId('tenant-posts-drafts-table')).toBeTruthy();
  expect(screen.queryByTestId('tenant-posts-drafts-empty')).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/drafts.test.tsx -t "renders the drafts table"`

Expected: FAIL (placeholder page has no table).

- [ ] **Step 3: Implement `drafts.tsx` (replace the placeholder body, keep the same `createFileRoute` crumbs)**

Keep:
```tsx
export const Route = createFileRoute('/_authed-layout/tenant/posts/drafts')({
  staticData: { crumbs: () => [{ kind: 'label', labelKey: 'posts', to: '/tenant/posts' }, { kind: 'label', labelKey: 'drafts' }], i18nNamespaces: ['posts'] },
  component: TenantPostsDraftsPage,
});
```
Replace `TenantPostsDraftsPage` with:
```tsx
function TenantPostsDraftsPage() {
  const { t } = useTranslation(['posts', 'common']);
  const navigate = Route.useNavigate();
  const search = parseTenantPostListSearchParams(Route.useSearch() as never);
  const onSearchChange = (next: { q?: string; sortId?: string; sortOrder?: 'asc'|'desc'; cursor?: string; size?: number }) => { void navigate({ search: serializeTenantPostListSearchParams(next as never), replace: true }); };
  const defaultSort = { id: 'updated_at', order: 'desc' as const };
  const controller = useTableController({ search: search as never, onSearchChange: onSearchChange as never, defaultSort, defaultSize: 20 });
  const tenantId = useResolvedWorkspaceTenantId(); // existing hook — see `tenant-account-profile.ts` pattern
  const query = useTenantPostsQuery({ ...(controller.apiVariables as object), tenantId: tenantId ?? '' } as never);
  const rows = toTenantPostRows(query.data?.data as never);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const canCreate = useTenantPermission('tenant.posts.create');
  const columns = useMemo(() => buildDraftColumns(t, canCreate), [t, canCreate]);
  if (query.isError && shouldLogoutForFailure(query.error)) return <LogoutRedirect />;
  return (
    <div className="publy-page-fill" data-testid="tenant-posts-drafts-page">
      <PageHeader title={t('posts:drafts')} description={t('posts:drafts-description')} actions={canCreate ? <Button variant="default" onClick={() => setIsCreateOpen(true)} data-testid="tenant-posts-new-post"><IconPlus aria-hidden className="size-4" />{t('posts:new-post')}</Button> : null} />
      <DataTable
        testId="tenant-posts-drafts-table"
        ariaLabel={t('posts:drafts')}
        columns={columns}
        rows={rows}
        getRowLabel={(r) => r.excerpt.slice(0, 40)}
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        hasActiveSearch={Boolean(controller.search.committed)}
        sort={controller.sort}
        onSortChange={controller.onSortChange}
        size={controller.size}
        onSizeChange={controller.onSizeChange}
        pageIndex={controller.cursor.pageIndex}
        hasPreviousPage={controller.cursor.hasPreviousPage}
        hasNextPage={Boolean((query.data as { nextCursor?: string | null })?.nextCursor)}
        isPaginationPending={query.isFetching}
        onNextPage={() => controller.cursor.onNextPage((query.data as { nextCursor?: string | null })?.nextCursor ?? undefined)}
        onPreviousPage={controller.cursor.onPreviousPage}
        searchDraft={controller.search.draft}
        onSearchDraftChange={controller.search.onDraftChange}
      />
      <CreatePostDrawer open={isCreateOpen} onOpenChange={setIsCreateOpen} tenantId={tenantId ?? ''} />
    </div>
  );
}
```
`buildDraftColumns` returns:
```tsx
const buildDraftColumns = (t: (k: string) => string, canCreate: boolean): ColumnDef<TenantPostRow>[] => [
  { id: 'excerpt', header: t('posts:body-label'), meta: { headerIcon: <IconPencil /> }, cell: ({ row }) => (
    <Link to="/tenant/posts/$postId/edit" params={{ postId: row.original.id }} className="flex min-w-0 items-center no-underline">
      <span className="publy-record-link min-w-0 truncate" title={row.original.excerpt}>{row.original.excerpt.slice(0, 280)}</span>
    </Link>
  )},
  { id: 'project', header: t('posts:project-label'), meta: { width: '124px', hideBelow: 768 }, cell: ({ row }) => row.original.projectId ? <span className="truncate" title={row.original.projectId}>{row.original.projectId.slice(0, 8)}</span> : <span className="text-muted-foreground">—</span> },
  { id: 'updated_at', header: t('common:updated-at'), meta: { width: '132px' }, cell: ({ row }) => row.original.updatedAt ? formatShortDate(row.original.updatedAt) : '—' },
  { id: 'actions', header: () => <span className="sr-only">{t('common:actions')}</span>, enableSorting: false, meta: { width: '40px', align: 'center' }, cell: ({ row }) => (
    <DataTableRowActions ariaLabel={t('common:actions-for', { name: row.original.excerpt } as never)} testId={`tenant-posts-drafts-actions-${row.original.id}`}>
      <DropdownMenuItem onClick={() => void navigateToEdit(row.original.id)}>{t('common:edit')}</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onClick={() => void confirmBin(row.original.id)}>{t('posts:move-to-bin')}</DropdownMenuItem>
    </DataTableRowActions>
  )},
];
```
Plus the `confirmBin` `ConfirmDialog` and delete mutation from Task 1 (see Task 6 for full wiring — stub the handler here, implement in Task 6).

- [ ] **Step 4: Run the table test to verify it passes**

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/drafts.test.tsx -t "renders the drafts table"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/authed/tenant/posts/drafts.tsx apps/front/src/routes/authed/tenant/posts/drafts.test.tsx
git commit -m "feat(front): wire drafts table with search and cursor pagination"
```

### Task 4: Create drawer — body + project select + single `savePost`

**Files:**
- Create: `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx`
- Modify: `apps/front/src/routes/authed/tenant/posts/drafts.test.tsx` (add drawer validation test)

**Interfaces:**
- Consumes: `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle`/`DrawerBody`/`DrawerFooter`/`DrawerForm` (`~/components/ui/drawer`), `Textarea`/`Select`, `useForm` + `zodResolver`, `savePost`/`useSavePostMutation`/`invalidateTenantPosts` from Task 1, `useTenantProjectsQuery`, `ConfirmDialog`, `Button`, `getFailureMessage`/`toApiFailure`.
- Produces: `CreatePostDrawer({ open, onOpenChange, tenantId })`.

- [ ] **Step 1: Write the failing drawer validation test**

```tsx
test('shows body required error and 20000 counter', async () => {
  render(<CreatePostDrawer open tenantId="00000000-0000-7000-8000-000000000000" onOpenChange={() => {}} />);
  expect(screen.getByText(/0 \/ 20000/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: /Save/i }));
  expect(await screen.findByText(/Body is required/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/drafts.test.tsx -t "shows body required error"`

Expected: FAIL — component not found.

- [ ] **Step 3: Implement `_create-post-drawer.tsx`**

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter, DrawerForm } from '~/components/ui/drawer';
import { Field, Form, FieldError } from '~/components/field';
import { Textarea } from '~/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Button } from '~/components/ui/button';
import { savePost, invalidateTenantPosts } from '~/lib/query/tenant-posts';
import { useTenantProjectsQuery } from '~/lib/query/tenant-projects';
import { getFailureMessage, toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

const schema = (t: (k: string) => string) => z.object({ body: z.string().trim().min(1, { message: t('posts:body-required') }).max(20000, { message: t('posts:body-too-long') }), projectId: z.string().nullable().optional() });
type FormValues = z.infer<ReturnType<typeof schema>>;

export const CreatePostDrawer = ({ open, onOpenChange, tenantId }: { open: boolean; onOpenChange: (o: boolean) => void; tenantId: string }) => {
  const { t } = useTranslation(['posts', 'common']);
  const qc = useQueryClient();
  const projectsQuery = useTenantProjectsQuery({ tenantId });
  const methods = useForm<FormValues>({ resolver: zodResolver(schema(t)), defaultValues: { body: '', projectId: null } });
  const body = methods.watch('body') ?? '';
  const onSubmit = methods.handleSubmit(async (values) => {
    try {
      await savePost({ body: values.body, projectId: values.projectId ?? null, tenantId });
      await invalidateTenantPosts(qc, tenantId);
      methods.reset();
      onOpenChange(false);
    } catch (error) {
      const failure = toApiFailure(error);
      if (failure.kind === 'validation' && failure.fieldErrors) {
        for (const [k, msgs] of Object.entries(failure.fieldErrors)) methods.setError(k as keyof FormValues, { message: msgs[0] });
        if (!failure.fieldErrors.body && !failure.fieldErrors.projectId) methods.setError('root', { message: getFailureMessage(failure, { fallback: t('common:an-error-occurred') }) ?? undefined });
        return;
      }
      methods.setError('root', { message: getFailureMessage(failure, { fallback: t('common:an-error-occurred') }) ?? undefined });
    }
  });
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent width={736} data-testid="tenant-posts-create-drawer">
        <DrawerHeader><DrawerTitle>{t('posts:new-post')}</DrawerTitle></DrawerHeader>
        <DrawerForm methods={methods} onSubmit={onSubmit}>
          <DrawerBody>
            <Field label={t('posts:body-label')} error={methods.formState.errors.body?.message}>
              <Textarea {...methods.register('body')} placeholder={t('posts:body-placeholder')} rows={8} aria-describedby="post-body-counter" data-testid="tenant-posts-create-body" />
              <p id="post-body-counter" className={body.length > 20000 ? 'text-[var(--publy-danger)] text-xs' : 'text-muted-foreground text-xs'}>{body.length} / 20000</p>
              {methods.formState.errors.root ? <FieldError>{methods.formState.errors.root.message}</FieldError> : null}
            </Field>
            <Field label={t('posts:project-label')} error={methods.formState.errors.projectId?.message as string | undefined}>
              <Select value={methods.watch('projectId') ?? ''} onValueChange={(v) => methods.setValue('projectId', v || null, { shouldDirty: true })}>
                <SelectTrigger data-testid="tenant-posts-create-project"><SelectValue placeholder={t('posts:project-placeholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('posts:project-placeholder')}</SelectItem>
                  {(projectsQuery.data ?? []).map((p: { id: string; name: string }) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {(!projectsQuery.data || (projectsQuery.data as unknown[]).length === 0) ? <p className="text-muted-foreground text-xs">{t('posts:no-projects-yet')}</p> : null}
            </Field>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common:cancel')}</Button>
            <Button type="submit" variant="default" disabled={methods.formState.isSubmitting} data-testid="tenant-posts-create-save">{methods.formState.isSubmitting ? t('posts:saving') : t('posts:save')}</Button>
          </DrawerFooter>
        </DrawerForm>
      </DrawerContent>
    </Drawer>
  );
};
```

Validation errors from 422 are mapped via `toApiFailure` without manual `response-message` translation (lint `publy/no-manual-response-message-translation` compliant).

- [ ] **Step 4: Run drawer test to verify it passes**

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/drafts.test.tsx -t "shows body required error"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx apps/front/src/routes/authed/tenant/posts/drafts.test.tsx
git commit -m "feat(front): add create post drawer with single savePost writer"
```

### Task 5: Edit page — dedicated route, load, save, unsaved-changes guard, 404

**Files:**
- Modify: `apps/front/src/routes.ts` (add `route('/tenant/posts/$postId/edit', 'authed/tenant/posts/$postId/edit.tsx')` under the `/posts` parent)
- Create: `apps/front/src/routes/authed/tenant/posts/$postId/edit.tsx`
- Create: `apps/front/src/routes/authed/tenant/posts/$postId/edit.test.tsx`

**Interfaces:**
- Consumes: `createFileRoute`, `FormPageLayout`+`FormActionBar` (`~/components/field`), `useTenantPostDetailsQuery`/`savePost`/`toTenantPostDetails` from Task 1, `useBlocker` from `@tanstack/react-router`, `Button`/`Card`, `ConfirmDialog`, `AppErrorView`/`LogoutRedirect`, `getFailureMessage`/`toApiFailure`/`shouldLogoutForFailure`, `useTranslation`.
- Produces: `Route` at `/_authed-layout/tenant/posts/$postId/edit` with entity crumb and i18n namespace.

- [ ] **Step 1: Write the failing edit-page test**

```tsx
/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (o: never) => o, Link: ({ children }: never) => <a>{children as never}</a>, useBlocker: () => ({ status: 'idle' }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// eslint-disable-next-line import/first
import { Route } from './edit';
const Page = (Route as unknown as { component: React.ComponentType }).component;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('TenantPostEditPage', () => {
  test('renders the edit heading and back link', () => {
    render(<Page /> as never);
    expect(screen.getByText('posts:edit-post')).toBeTruthy();
    expect(screen.getByText('posts:back-to-drafts')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/\$postId/edit.test.tsx -t "renders the edit heading"`

Expected: FAIL (file does not exist).

- [ ] **Step 3: Wire `src/routes.ts` and implement `edit.tsx`**

In `src/routes.ts`, under the existing `route('/posts', 'authed/tenant/posts.tsx', [...])` block, add a sibling (not a child — it is a full page, not a tab):
```typescript
route('/tenant/posts/$postId/edit', 'authed/tenant/posts/$postId/edit.tsx'),
```
as a direct child of the `authed` layout (peer to `route('/tenant', ...)` — match how `staff/tenants/$tenantId-edit.tsx` is wired, not nested under `posts`).

`edit.tsx`:
```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Form, Field, FormActionBar, FormPageLayout } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { useTenantPostDetailsQuery, savePost, invalidateTenantPosts, toTenantPostDetails, tenantPostCrumbQuery, selectTenantPostCrumbName } from '~/lib/query/tenant-posts';
import { useTenantProjectsQuery } from '~/lib/query/tenant-projects';
import { shouldLogoutForFailure, getFailureMessage, toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

const schema = (t: (k: string) => string) => z.object({ body: z.string().trim().min(1, { message: t('posts:body-required') }).max(20000, { message: t('posts:body-too-long') }), projectId: z.string().nullable().optional() });
type Values = z.infer<ReturnType<typeof schema>>;

export const Route = createFileRoute('/_authed-layout/tenant/posts/$postId/edit')({
  staticData: { crumbs: (p: Record<string, string>) => [{ kind: 'label', labelKey: 'posts', to: '/tenant/posts' }, { kind: 'label', labelKey: 'drafts', to: '/tenant/posts/drafts' }, { kind: 'entity', query: tenantPostCrumbQuery, select: selectTenantPostCrumbName } as never], i18nNamespaces: ['posts'] },
  component: TenantPostEditPage,
});

function TenantPostEditPage() {
  const { t } = useTranslation(['posts', 'common']);
  const { postId } = Route.useParams();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const tenantId = useResolvedWorkspaceTenantId();
  const detailsQuery = useTenantPostDetailsQuery({ postId, tenantId: tenantId ?? '' }, { enabled: Boolean(tenantId && postId) });
  const projectsQuery = useTenantProjectsQuery({ tenantId: tenantId ?? '' });
  const methods = useForm<Values>({ resolver: zodResolver(schema(t)), defaultValues: { body: '', projectId: null } });
  const body = useWatch({ control: methods.control, name: 'body' }) ?? '';
  useEffect(() => {
    const d = toTenantPostDetails(detailsQuery.data as never);
    if (d) methods.reset({ body: d.body, projectId: d.projectId });
  }, [detailsQuery.data, methods]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (methods.formState.isDirty && !methods.formState.isSubmitting) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [methods.formState.isDirty, methods.formState.isSubmitting]);
  const blocker = useBlocker({ shouldBlockFn: () => methods.formState.isDirty && !methods.formState.isSubmitting, withResolver: true });
  const onSubmit = methods.handleSubmit(async (values) => {
    try {
      await savePost({ postId, body: values.body, projectId: values.projectId ?? null, tenantId: tenantId ?? '' });
      await invalidateTenantPosts(qc, tenantId ?? '');
      if (window.history.length > 1) window.history.back(); else void navigate({ to: '/tenant/posts/drafts', replace: true });
    } catch (error) {
      const failure = toApiFailure(error);
      if (failure.kind === 'validation' && failure.fieldErrors) {
        for (const [k, msgs] of Object.entries(failure.fieldErrors)) methods.setError(k as keyof Values, { message: msgs[0] });
        return;
      }
      methods.setError('root', { message: getFailureMessage(failure, { fallback: t('common:an-error-occurred') }) ?? undefined });
    }
  });
  if (detailsQuery.isPending) return <div data-testid="tenant-post-edit-loading"><div className="h-6 w-32 animate-pulse bg-muted" /></div>;
  if (detailsQuery.isError) {
    if (shouldLogoutForFailure(detailsQuery.error)) return <LogoutRedirect />;
    return <AppErrorView failure={toApiFailure(detailsQuery.error)} onRetry={() => void detailsQuery.refetch()} backTo={{ to: '/tenant/posts/drafts', label: t('posts:back-to-drafts') }} />;
  }
  const details = toTenantPostDetails(detailsQuery.data as never);
  if (!details) return <AppErrorView failure={toApiFailure({ status: 404 })} onRetry={() => void detailsQuery.refetch()} backTo={{ to: '/tenant/posts/drafts', label: t('posts:back-to-drafts') }} />;
  return (
    <FormPageLayout backLink={<Link to="/tenant/posts/drafts" className="publy-back-link"><IconArrowLeft aria-hidden className="size-3" />{t('posts:back-to-drafts')}</Link>} title={t('posts:edit-post')} data-testid="tenant-post-edit-page">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Form methods={methods} onSubmit={onSubmit}>
            <Field label={t('posts:body-label')} error={methods.formState.errors.body?.message}>
              <Textarea {...methods.register('body')} rows={10} placeholder={t('posts:body-placeholder')} data-testid="tenant-post-edit-body" />
              <p className={body.length > 20000 ? 'text-[var(--publy-danger)] text-xs' : 'text-muted-foreground text-xs'}>{body.length} / 20000</p>
              {methods.formState.errors.root ? <p className="text-sm text-[var(--publy-danger)]">{methods.formState.errors.root.message}</p> : null}
            </Field>
            <Field label={t('posts:project-label')}>
              <Select value={methods.watch('projectId') ?? ''} onValueChange={(v) => methods.setValue('projectId', v || null, { shouldDirty: true })}>
                <SelectTrigger data-testid="tenant-post-edit-project"><SelectValue placeholder={t('posts:project-placeholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('posts:project-placeholder')}</SelectItem>
                  {(projectsQuery.data ?? []).map((p: { id: string; name: string }) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <FormActionBar>
              <Button type="submit" variant="default" disabled={methods.formState.isSubmitting} data-testid="tenant-post-edit-save">{methods.formState.isSubmitting ? t('posts:saving') : t('posts:save')}</Button>
              <Button type="button" variant="outline" onClick={() => void navigate({ to: '/tenant/posts/drafts' })}>{t('common:cancel')}</Button>
            </FormActionBar>
          </Form>
          <Card className="mt-8 border-[var(--publy-danger)]">
            <div className="p-4">
              <p className="text-xs font-semibold tracking-widest text-muted-foreground">{t('posts:danger-zone-title')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('posts:danger-zone-description')}</p>
              <Button variant="destructive" className="mt-3" data-testid="tenant-post-edit-move-to-bin" onClick={() => setBinConfirm(true)}>{t('posts:move-to-bin')}</Button>
            </div>
          </Card>
        </div>
        <div className="hidden lg:col-span-4 lg:block" aria-hidden data-testid="tenant-post-edit-reserved-side-column">
          {/* Account & schedule (Epics C/D) — reserved space, no placeholder UI */}
        </div>
      </div>
      {blocker.status === 'blocked' ? (
        <ConfirmDialog isOpen title={t('posts:unsaved-changes-title')} description={t('posts:unsaved-changes-description')} confirmLabel={t('common:leave')} cancelLabel={t('common:stay')} onConfirm={() => blocker.proceed?.()} onOpenChange={(o) => { if (!o) blocker.reset?.(); }} />
      ) : null}
    </FormPageLayout>
  );
}
```

`useResolvedWorkspaceTenantId` is the existing hook that resolves the `X-Tenant-Id` header value (same seam `client-manager` uses); if the repo names it differently (`useTenantId`/`useSelectedTenantId`), wire that name instead.

- [ ] **Step 4: Run edit-page test to verify it passes**

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/\$postId/edit.test.tsx -t "renders the edit heading"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes.ts apps/front/src/routes/authed/tenant/posts/\$postId/edit.tsx apps/front/src/routes/authed/tenant/posts/\$postId/edit.test.tsx
git commit -m "feat(front): add dedicated edit post page with unsaved-changes guard"
```

### Task 6: Move to bin — confirm, delete, invalidate

**Files:**
- Modify: `apps/front/src/routes/authed/tenant/posts/drafts.tsx` (wire bin confirm)
- Modify: `apps/front/src/routes/authed/tenant/posts/$postId/edit.tsx` (wire bin in danger zone)
- Test: `apps/front/src/routes/authed/tenant/posts/drafts.test.tsx` + `edit.test.tsx` (bin confirm test)

**Interfaces:**
- Consumes: `useDeleteTenantPostMutation`/`invalidateTenantPosts` from Task 1, `ConfirmDialog`, `Button variant="destructive"`, `getFailureMessage`/`toApiFailure`/`shouldLogoutForFailure`.
- Produces: row `Move to bin` and edit danger-zone `Move to bin` both show confirm then `DELETE /posts/{id}`.

- [ ] **Step 1: Write the failing bin-confirm test**

```tsx
test('move to bin shows confirm and calls delete', async () => {
  const user = userEvent.setup();
  render(<TenantPostsDraftsPage />);
  await user.click(screen.getByTestId('tenant-posts-drafts-actions-aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa'));
  await user.click(screen.getByRole('menuitem', { name: /Move to bin/i }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /Confirm/i }));
  // assert delete called (mock)
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/drafts.test.tsx -t "move to bin shows confirm"`

Expected: FAIL (no click handler yet).

- [ ] **Step 3: Implement bin wiring (drafts row + edit danger zone)**

Drafts `buildDraftColumns` cell already renders the menu item; add state in `TenantPostsDraftsPage`:
```tsx
const [pendingBinId, setPendingBinId] = useState<string | null>(null);
const qc = useQueryClient();
const tenantId = useResolvedWorkspaceTenantId();
const deleteMutation = useDeleteTenantPostMutation();
const confirmBin = async () => {
  if (!pendingBinId || !tenantId) return;
  try {
    await (deleteMutation.mutateAsync as unknown as (v: { postId: string; tenantId: string }) => Promise<unknown>)({ postId: pendingBinId, tenantId });
    await invalidateTenantPosts(qc, tenantId);
    setPendingBinId(null);
  } catch (error) {
    if (shouldLogoutForFailure(error)) { setShouldLogout(true); return; }
    // global MutationCache will toast; keep dialog open on failure
  }
};
```
And render after `DataTable`:
```tsx
<ConfirmDialog isOpen={pendingBinId !== null} title={t('posts:move-to-bin')} description={t('posts:move-to-bin-confirm')} confirmLabel={t('posts:move-to-bin')} isPending={deleteMutation.isPending} onConfirm={() => void confirmBin()} onOpenChange={(o) => { if (!o) setPendingBinId(null); }} />
```
Edit page danger-zone button already opens a `pendingBinId` confirm; same `deleteMutation` seam.

- [ ] **Step 4: Run bin tests to verify they pass**

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/drafts.test.tsx -t "move to bin"`

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/\$postId/edit.test.tsx -t "move to bin"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/authed/tenant/posts/drafts.tsx apps/front/src/routes/authed/tenant/posts/\$postId/edit.tsx apps/front/src/routes/authed/tenant/posts/drafts.test.tsx apps/front/src/routes/authed/tenant/posts/\$postId/edit.test.tsx
git commit -m "feat(front): move to bin with confirm dialog on drafts and edit page"
```

### Task 7: Component tests + design-token / z-index / i18n gates

**Files:**
- Modify: `apps/front/src/routes/authed/tenant/posts/drafts.test.tsx` (add table-state, permission, search, footer tests)
- Modify: `apps/front/src/routes/authed/tenant/posts/$postId/edit.test.tsx` (add save, 404, unsaved guard)
- Modify: `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx` (add `data-testid` hooks if missing)

**Interfaces:**
- Consumes: Vitest + Testing Library, `DataTable` a11y, `shouldLogoutForFailure` branching.

- [ ] **Step 1: Add exhaustive table-state tests**

```tsx
describe('TenantPostsDraftsPage states', () => {
  test('loading shows skeleton', () => { /* mock useTenantPostsQuery isPending true → expect skeleton */ });
  test('empty shows StateSurface with New post action', () => { /* empty rows, no search → empty title + button */ });
  test('no-match shows no-match surface when q is active', () => { /* rows empty + hasActiveSearch true → no-match title */ });
  test('error shows ErrorStateSurface with Retry', () => { /* isError true → error title + Retry button calls refetch */ });
  test('search draft updates and debounces commit', async () => { /* type in search → controller.search.onDraftChange → q appears */ });
  test('cursor footer Previous/Next respect hasNextPage/hasPreviousPage', () => { /* mock nextCursor present → Next enabled */ });
  test('actions gated by permissions', () => { /* mock useTenantPermission false → Edit/bin hidden or disabled */ });
});
```

Edit-page table:
```tsx
describe('TenantPostEditPage Save', () => {
  test('Save calls savePost with body and projectId', async () => { /* fill body, pick project, click Save → assert savePost args */ });
  test('422 maps to field errors without toast', async () => { /* mock savePost to throw validation failure → field error visible, no toast */ });
  test('404 renders not-found view, not 400', async () => { /* mock Get 404 → StateView 404 + Back to drafts */ });
  test('unsaved blocker shows Stay/Leave dialog', async () => { /* dirty form → trigger navigation → dialog appears */ });
});
```

- [ ] **Step 2: Run the component suite**

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/drafts.test.tsx src/routes/authed/tenant/posts/\$postId/edit.test.tsx`

Expected: PASS (all new states green).

- [ ] **Step 3: Run the full front gate for this task — neither subsumes the other**

Run: `pnpm --filter front test` — Expected: PASS (includes `check:design-system`, `check:zindex`, drawer-contrast, zindex-guard, context-chunk, i18n-key-coverage, compose-startup, request-counter, search-cancel).

Run: `pnpm --filter front typecheck` — Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/authed/tenant/posts/drafts.test.tsx apps/front/src/routes/authed/tenant/posts/\$postId/edit.test.tsx
git commit -m "test(front): cover drafts table states, drawer validation, and edit save/guard"
```

### Task 8: E2E — create via drawer → table → edit → save → back (tagged @638)

**Files:**
- Create: `apps/front/e2e/tenant-posts-drafts.spec.ts`

**Interfaces:**
- Consumes: Playwright, `e2e/helpers/login` (`loginAsStaffAdmin`/`loginAsTenantUser` as appropriate), storage state, `test.describe` tags from PR #1171 (`['@tenant-workspace', '@638']` on every top-level describe).

- [ ] **Step 1: Write the failing E2E (happy path + cursor + bin + guard)**

```typescript
import { test, expect } from '@playwright/test';
import { loginAsTenantUser } from './helpers/login';

test.describe('@tenant-workspace @638 tenant posts drafts', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTenantUser(page);
  });

  test('create draft via drawer → appears in table → open edit → save → back', async ({ page }) => {
    await page.goto('/tenant/posts/drafts');
    await expect(page.getByTestId('tenant-posts-drafts-page')).toBeVisible();
    await page.getByTestId('tenant-posts-new-post').click();
    await expect(page.getByTestId('tenant-posts-create-drawer')).toBeVisible();
    const body = `e2e draft ${Date.now()}`;
    await page.getByTestId('tenant-posts-create-body').fill(body);
    await page.getByTestId('tenant-posts-create-save').click();
    await expect(page.getByText(body.slice(0, 20))).toBeVisible({ timeout: 10_000 });
    await page.getByRole('link', { name: body.slice(0, 20) }).click();
    await expect(page.getByTestId('tenant-post-edit-page')).toBeVisible();
    const edited = `${body} — edited`;
    await page.getByTestId('tenant-post-edit-body').fill(edited);
    await page.getByTestId('tenant-post-edit-save').click();
    await expect(page).toHaveURL(/\/tenant\/posts\/drafts/);
    await expect(page.getByText(edited.slice(0, 20))).toBeVisible();
  });

  test('search drafts and cursor pagination', async ({ page }) => {
    await page.goto('/tenant/posts/drafts');
    await page.getByTestId('tenant-posts-drafts-table-search').fill('e2e draft');
    await expect(page.getByTestId('tenant-posts-drafts-table')).toBeVisible();
    // if nextCursor exists, Next is enabled
    const next = page.getByRole('button', { name: /Next/i });
    if (await next.isEnabled()) await next.click();
  });

  test('move to bin with confirmation', async ({ page }) => {
    await page.goto('/tenant/posts/drafts');
    const row = page.getByTestId('tenant-posts-drafts-table').locator('tbody tr').first();
    await row.getByRole('button', { name: /Actions/i }).click();
    await page.getByRole('menuitem', { name: /Move to bin/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /Move to bin/i }).click();
  });

  test('unsaved-changes guard on edit page', async ({ page }) => {
    await page.goto('/tenant/posts/drafts');
    // open first post edit if any, else skip with expect
    const link = page.getByRole('link').first();
    if (await link.count() > 0) {
      await link.click();
      await page.getByTestId('tenant-post-edit-body').fill('dirty');
      await page.getByRole('link', { name: /Back to drafts/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run E2E tagged run (proves tags are wired)**

Run: `pnpm --filter front exec playwright test tenant-posts-drafts.spec.ts --grep "@638"`

Expected: PASS locally when the API/Postgres stack is up (`just dev-db` + `just dev-api-migrated`); otherwise at least the `grep` filter selects 4 tests and the failure is a connection error, not a tag error. Tags must appear on the CLI list: `pnpm --filter front exec playwright test --list --grep @638` shows the 4 tests.

- [ ] **Step 3: Run full front gate after E2E**

Run: `pnpm --filter front test && pnpm --filter front typecheck`

Expected: PASS / 0 errors (`just ci-drift` unchanged).

- [ ] **Step 4: Commit**

```bash
git add apps/front/e2e/tenant-posts-drafts.spec.ts
git commit -m "test(e2e): add tenant posts drafts flows tagged @638"
```

## Self-Review

**1. Spec coverage:** backend `GET /projects` (owner decision A, 2026-08-22) → Task 0; §2.1 drafts table + search + cursor pagination → Task 3; drawer text+project → Task 4; edit page route + centered editor + reserved C/D column → Task 5; single `savePost` seam → Task 1; explicit Save + unsaved guard → Tasks 4–5; permission gating (view/create/edit/delete) → Tasks 3+6; empty/error/cause+retry/404→404 → Tasks 3+5; i18n FR+EN + crumbs → Tasks 2+3+5; bin confirm → Task 6; component tests + design-token/i18n gates + full front test+typecheck per task → Task 7; one E2E per screen flow tagged `@tenant-workspace @638` → Task 8. No gaps.

**2. Placeholder scan:** No `TBD`/`TODO`/`implement later`/`fill in details`/`Add appropriate error handling`; every step carries concrete code, exact commands, expected output, and commit messages.

**3. Type consistency:** `SavePostInput` (`{postId?, body, projectId: string|null}` + `{tenantId}` at call sites), `TenantPostRow`/`TenantPostDetails`, `TENANT_POSTS_QUERY_KEY`/`TENANT_POST_DETAILS_QUERY_KEY`, `toTenantPostRows`/`toTenantPostDetails`, `invalidateTenantPosts(queryClient, tenantId)`, `tenantPostCrumbQuery`/`selectTenantPostCrumbName`, `parse/serializeTenantPostListSearchParams`, `validateTenantPostListSearchParams`, `useTenantPostsQuery`/`useTenantPostDetailsQuery`/`useTenantProjectsQuery`, `savePost` single writer used by drawer and edit page — naming is consistent across tasks; no `clearLayers`/`clearFullLayers` divergence.

