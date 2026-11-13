using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Validation;
using PublyApp.Api.Modules.Uploads.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Tenants.Services;

// Flattened API-safe DTO (no EF entities)
public class TenantAsStaffListItem {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
	public required string Code { get; init; }
	public string? DefaultLocale { get; init; }
	public string? LogoUrl { get; init; }
	public required int UsersCount { get; init; }
	public required int ProjectsCount { get; init; }
	public required int MaxUsers { get; init; }
	public required TenantStatus Status { get; init; }
	public DateTime? LastActivityAt { get; init; }
	public required DateTime CreatedAt { get; init; }
	public string? Timezone { get; init; }
	public string? WebsiteUrl { get; init; }
	public string? BillingEmail { get; init; }
	public required int OwnersCount { get; init; }
	public required int RolesCount { get; init; }
	// Active, non-deleted social accounts.
	public required int ConnectedAccountsCount { get; init; }
	// Non-deleted posts created in the current UTC calendar month.
	public required int PostsThisMonthCount { get; init; }
	// Pending, unexpired organisation invitations.
	public required int PendingInvitationsCount { get; init; }
}

public record CreateTenantWithInitialUsersResult {
	public required Tenant Tenant { get; init; }
	public required List<(string Email, string Token)> InvitationTokens { get; init; }
}

// Discriminated union for CreateTenantWithInitialUsersAsync. Code uniqueness is an expected,
// user-triggerable failure mode (a client-supplied slug can collide), so it is modeled here
// rather than as an exception — consistent with the other Result unions in this file.
public abstract record CreateTenantWithInitialUsersOutcome {
	public sealed record Success(CreateTenantWithInitialUsersResult Data)
		: CreateTenantWithInitialUsersOutcome;

	public sealed record CodeAlreadyTaken(string Code) : CreateTenantWithInitialUsersOutcome;

	// Only reachable when Code is omitted and the random-code keyspace (62^10) collides on
	// every attempt — astronomically unlikely, kept as an explicit case rather than a silent
	// exception so the handler can report a clear 500 problem instead of a generic crash.
	public sealed record CodeGenerationFailed : CreateTenantWithInitialUsersOutcome;
}

// Result types for suspend/reactivate operations
public abstract record SuspendTenantResult {
	public sealed record Success(Tenant Tenant) : SuspendTenantResult;
	public sealed record NotFound : SuspendTenantResult;
	public sealed record AlreadySuspended : SuspendTenantResult;
	public sealed record NotActiveStatus : SuspendTenantResult;
}

public abstract record ReactivateTenantResult {
	public sealed record Success(Tenant Tenant) : ReactivateTenantResult;
	public sealed record NotFound : ReactivateTenantResult;
	public sealed record NotSuspended : ReactivateTenantResult;
}

// Result types for bulk operations
public record BulkSuspendResult(
	int SucceededCount,
	int FailedCount,
	List<(Guid TenantId, string Error)> FailedItems,
	IReadOnlyList<Guid> SucceededIds
);
public record BulkReactivateResult(
	int SucceededCount,
	int FailedCount,
	List<(Guid TenantId, string Error)> FailedItems,
	IReadOnlyList<Guid> SucceededIds
);
public record BulkDeleteResult(
	int SucceededCount,
	int FailedCount,
	List<(Guid TenantId, string Error)> FailedItems,
	IReadOnlyList<Guid> SucceededIds
);

// Result types for update/delete operations
public abstract record UpdateTenantResult {
	public sealed record Success(Tenant Tenant, int UsersCount) : UpdateTenantResult;
	public sealed record NotFound : UpdateTenantResult;
	public sealed record MaxUsersBelowCurrentCount : UpdateTenantResult;
}

public abstract record DeleteTenantResult {
	public sealed record Success(Tenant Tenant) : DeleteTenantResult;
	public sealed record NotFound : DeleteTenantResult;
	public sealed record NotSuspended : DeleteTenantResult;
}

public record UpdateTenantAsStaffArgs(
	string? Name,
	PatchField<string?> LogoUrl,
	int? MaxUsers,
	PatchField<string?> LegalName,
	PatchField<string?> Description,
	PatchField<string?> WebsiteUrl,
	PatchField<string?> BillingEmail,
	PatchField<string?> SupportEmail,
	PatchField<string?> DefaultLocale,
	PatchField<string?> Timezone,
	PatchField<string?> Notes
);

public record FindTenantsAsStaffFilters(
	string? Search,
	IReadOnlySet<TenantStatus>? Status
);

public record FindTenantsAsStaffArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindTenantsAsStaffFilters? Filters
);

public record CreateTenantWithInitialUsersArgs(
	string Name,
	int MaxUsers,
	// true = the tenant's full-access « Owner » role, false = the default role.
	List<(string Email, bool IsOwner)> InitialUsers,
	Guid InvitedByUserId,
	string? Code,
	bool SeedDefaultRole,
	string? LogoUrl,
	string? LegalName,
	string? Description,
	string? WebsiteUrl,
	string? BillingEmail,
	string? SupportEmail,
	string? DefaultLocale,
	string? Timezone,
	string? Notes
);

public sealed record TenantLocaleCount(
	string Locale,
	int Count
);

public sealed record TenantListCounts(
	int Total,
	int Active,
	int Pending,
	int Suspended,
	int Members,
	int Seats,
	int Projects,
	int AlmostFull,
	int Full,
	int ActiveThisWeek,
	int PendingInvitations,
	int PendingInvitationTenants,
	int ExpiringInvitations,
	IReadOnlyList<TenantLocaleCount> ByLocale
);

public sealed record TenantStatusPanelCounts(
	int Active,
	int Pending,
	int Suspended
);

public sealed record TenantSeatsPanelCounts(
	int Full,
	int High,
	int Available
);

// Side-panel counters: they ignore the status filter (the other panel
// filters) but respect the search, so each choice shows what it would yield.
public sealed record TenantPanelCounts(
	TenantStatusPanelCounts Status,
	TenantSeatsPanelCounts Seats,
	IReadOnlyList<TenantLocaleCount> Locales
);

public abstract record FindTenantsAsStaffServiceResult {
	public sealed record Success(
		CursorPaginatedResult<TenantAsStaffListItem> Data,
		TenantListCounts Counts,
		TenantPanelCounts PanelCounts
	) : FindTenantsAsStaffServiceResult;

	public sealed record CursorNotFound(string Cursor)
		: FindTenantsAsStaffServiceResult;

	public sealed record InvalidSortId(string SortId)
		: FindTenantsAsStaffServiceResult;
}

public interface ITenantAsStaffService {
	Task<Tenant> CreateTenant(Tenant tenant, CancellationToken cancellationToken = default);

	Task<Tenant?> GetTenantByIdAsync(Guid tenantId, CancellationToken cancellationToken = default);

	Task<FindTenantsAsStaffServiceResult> FindTenantsAsStaffAsync(
		FindTenantsAsStaffArgs args,
		CancellationToken cancellationToken = default
	);

	Task<int> CountTenantsAsync(CancellationToken cancellationToken = default);

	// NEW: Create tenant with initial users via invitations
	Task<CreateTenantWithInitialUsersOutcome> CreateTenantWithInitialUsersAsync(
		CreateTenantWithInitialUsersArgs args,
		CancellationToken cancellationToken = default
	);

	// Suspend/Reactivate operations
	Task<SuspendTenantResult> SuspendTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	Task<ReactivateTenantResult> ReactivateTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	// Staff can see suspended tenants (unlike regular GetTenantByIdAsync)
	Task<Tenant?> GetTenantByIdForStaffAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	// Count tenant-scoped users (excludes deleted and staff-scoped)
	Task<int> CountTenantUsersAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	// Count tenant-scoped owners: members holding the tenant's full-access system role.
	Task<int> CountTenantOwnersAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	// Update tenant fields (name, logoUrl, maxUsers)
	Task<UpdateTenantResult> UpdateTenantAsync(
		Guid tenantId,
		UpdateTenantAsStaffArgs args,
		CancellationToken cancellationToken = default
	);

	// Soft-delete a suspended tenant without changing its last live status
	Task<DeleteTenantResult> DeleteTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	// Bulk operations
	Task<BulkSuspendResult> BulkSuspendAsync(
		IReadOnlyList<Guid> tenantIds,
		CancellationToken cancellationToken = default
	);

	Task<BulkReactivateResult> BulkReactivateAsync(
		IReadOnlyList<Guid> tenantIds,
		CancellationToken cancellationToken = default
	);

	Task<BulkDeleteResult> BulkDeleteAsync(
		IReadOnlyList<Guid> tenantIds,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class TenantAsStaffService : ITenantAsStaffService {
	private readonly AppDbContext _DbContext;
	private readonly IInvitationEmailOutboxSignal _OutboxSignal;
	private readonly IUploadAssetReferenceService _UploadReferences;
	private readonly ILogger<TenantAsStaffService> _Logger;

	public TenantAsStaffService(
		AppDbContext dbContext,
		IInvitationEmailOutboxSignal outboxSignal,
		IUploadAssetReferenceService uploadReferences,
		ILogger<TenantAsStaffService> logger
	) {
		this._DbContext = dbContext;
		this._OutboxSignal = outboxSignal;
		this._UploadReferences = uploadReferences;
		this._Logger = logger;
	}

	public async Task<Tenant> CreateTenant(Tenant tenant, CancellationToken cancellationToken = default) {
		var result = await this._DbContext.Tenant.AddAsync(tenant, cancellationToken);
		await this._DbContext.SaveChangesAsync(cancellationToken);
		return result.Entity;
	}

	public async Task<Tenant?> GetTenantByIdAsync(Guid tenantId, CancellationToken cancellationToken = default) {
		var query =
			from tenant in this._DbContext.Tenant
			where tenant.Id == tenantId
			select tenant;

		var foundTenant = await query.FirstOrDefaultAsync(cancellationToken);

		if (foundTenant is not null && !Tenant.IsTenantActive(foundTenant)) {
			return null;
		}

		return foundTenant;
	}

	public async Task<int> CountTenantsAsync(CancellationToken cancellationToken = default) {
		var query =
			from tenant in this._DbContext.Tenant
			where !tenant.IsDeleted
			select tenant;

		return await query.CountAsync(cancellationToken);
	}

	public async Task<FindTenantsAsStaffServiceResult> FindTenantsAsStaffAsync(
		FindTenantsAsStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "created_at";
		var isAsc = effectiveSortOrder == SortOrder.Asc;

		// Cursor sort field handlers work on Tenant entities only.
		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<Tenant>>(
			StringComparer.OrdinalIgnoreCase
		) {
			["created_at"] = CursorSortFieldHandlerFactory.Create<Tenant, DateTime, Guid?>(
				cursorLookupQuery: () => this._DbContext.Tenant
					.AsNoTracking()
					.Where(t => !t.IsDeleted),
				keySelector: t => t.CreatedAt,
				idSelector: t => t.Id,
				cancellationToken
			),
			["updated_at"] = CursorSortFieldHandlerFactory.Create<Tenant, DateTime, Guid?>(
				cursorLookupQuery: () => this._DbContext.Tenant
					.AsNoTracking()
					.Where(t => !t.IsDeleted),
				keySelector: t => t.UpdatedAt,
				idSelector: t => t.Id,
				cancellationToken
			),
			["name"] = CursorSortFieldHandlerFactory.Create<Tenant, string, Guid?>(
				cursorLookupQuery: () => this._DbContext.Tenant
					.AsNoTracking()
					.Where(t => !t.IsDeleted),
				keySelector: t => t.Name,
				idSelector: t => t.Id,
				cancellationToken
			),
			["status"] = CursorSortFieldHandlerFactory.Create<Tenant, TenantStatus, Guid?>(
				cursorLookupQuery: () => this._DbContext.Tenant
					.AsNoTracking()
					.Where(t => !t.IsDeleted),
				keySelector: t => t.Status,
				idSelector: t => t.Id,
				cancellationToken
			),
		};

		// Validate sortId via TryGetValue
		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<Tenant>? handler
			)
		) {
			return new FindTenantsAsStaffServiceResult.InvalidSortId(effectiveSortId);
		}

		// Build base query on Tenant entity only (no joins for pagination)
		IQueryable<Tenant> baseQuery = this._DbContext.Tenant
			.AsNoTracking()
			.Where(t => !t.IsDeleted && t.Id.HasValue);

		// Apply search filter
		if (args.Filters?.Search is { } search) {
			// Search semantics:
			// - Name: substring match (ILIKE %q%) backed by pg_trgm index on tenants.name.
			// - Code: prefix match only (StartsWith) so we can rely on the existing btree index
			//   and avoid adding a second (GIN) index on the same column as the unique index.
			var pattern = $"%{LikePatternUtils.EscapeLikePattern(search)}%";
			var codePrefix = search.ToLowerInvariant();
			baseQuery = baseQuery.Where(t =>
				EF.Functions.ILike(t.Name, pattern, LikePatternUtils.LikeEscapeChar) ||
				t.Code.StartsWith(codePrefix)
			);
		}

		// The panel counters respect the search only; the status filter then
		// narrows the rows, the stat cards and the pagination.
		IQueryable<Tenant> searchQuery = baseQuery;
		if (args.Filters?.Status is { } statuses && statuses.Count > 0) {
			baseQuery = baseQuery.Where(t => statuses.Contains(t.Status));
		}

		// Facets describe the whole collection (cursor and limit are pagination
		// only). Every counter is a SQL aggregate: nothing is materialized per tenant.
		var weekAgo = DateTime.UtcNow.AddDays(-7);
		var listFacets = await this._FindTenantFacetsAsync(baseQuery, weekAgo, cancellationToken);
		var panelFacets = listFacets;
		if (args.Filters?.Status is { Count: > 0 }) {
			panelFacets = await this._FindTenantFacetsAsync(
				searchQuery,
				weekAgo,
				cancellationToken
			);
		}
		var projects = await (
			from project in this._DbContext.Project.AsNoTracking()
			where !project.IsDeleted
				&& baseQuery.Any(tenant => tenant.Id == project.TenantId)
			select project
		).CountAsync(cancellationToken);

		var total = listFacets.Active + listFacets.Pending + listFacets.Suspended;
		var active = listFacets.Active;
		var pending = listFacets.Pending;
		var suspended = listFacets.Suspended;
		var members = listFacets.Members;
		var seats = listFacets.Seats;
		var almostFull = listFacets.Full + listFacets.High;
		var full = listFacets.Full;
		var activeThisWeek = listFacets.ActiveThisWeek;
		var byLocale = listFacets.Locales;
		var panelCounts = new TenantPanelCounts(
			Status: new TenantStatusPanelCounts(
				panelFacets.Active,
				panelFacets.Pending,
				panelFacets.Suspended
			),
			Seats: new TenantSeatsPanelCounts(
				panelFacets.Full,
				panelFacets.High,
				panelFacets.Available
			),
			Locales: panelFacets.Locales
		);

		// « Invitations en attente »: pending organisation invitations for the
		// filtered tenants (an expired invitation is not pending), the
		// organisations concerned, and the ones expiring within seven days.
		var now = DateTime.UtcNow;
		var expiringBoundary = now.AddDays(7);
		var pendingInvitationRows = await (
			from invitation in this._DbContext.Invitation.AsNoTracking()
			where invitation.Scope == InvitationScope.Tenant
				&& invitation.Status == InvitationStatus.Pending
				&& invitation.ExpiresAt > now
				&& !invitation.IsDeleted
				&& invitation.TenantId != null
				&& baseQuery.Any(tenant => tenant.Id == invitation.TenantId)
			select new {
				invitation.TenantId,
				invitation.ExpiresAt,
			}
		).ToListAsync(cancellationToken);

		var pendingInvitationTenantIds = new HashSet<Guid>();
		var expiringInvitations = 0;
		foreach (var row in pendingInvitationRows) {
			if (row.TenantId is { } invitationTenantId) {
				pendingInvitationTenantIds.Add(invitationTenantId);
			}
			// Every row is already unexpired (the query tests ExpiresAt > now).
			if (row.ExpiresAt <= expiringBoundary) {
				expiringInvitations += 1;
			}
		}

		var counts = new TenantListCounts(
			Total: total,
			Active: active,
			Pending: pending,
			Suspended: suspended,
			Members: members,
			Seats: seats,
			Projects: projects,
			AlmostFull: almostFull,
			Full: full,
			ActiveThisWeek: activeThisWeek,
			PendingInvitations: pendingInvitationRows.Count,
			PendingInvitationTenants: pendingInvitationTenantIds.Count,
			ExpiringInvitations: expiringInvitations,
			ByLocale: byLocale
		);

		// Apply cursor filter
		if (args.Cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(args.Cursor);
			if (cursorValue is null) {
				return new FindTenantsAsStaffServiceResult.CursorNotFound(args.Cursor.ToString());
			}
			baseQuery = handler.ApplyFilter(baseQuery, cursorValue, isAsc);
		}

		// Apply ordering
		var orderedQuery = handler.ApplyOrdering(baseQuery, isAsc);

		// Fetch limit + 1 to detect more pages
		var tenants = await orderedQuery
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		// Determine pagination state
		string? nextCursor = null;
		if (tenants.Count > effectiveLimit) {
			tenants.RemoveAt(tenants.Count - 1);
			nextCursor = tenants.Last().GetRequiredId().ToString();
		}

		var tenantIds = tenants.Select(t => t.GetRequiredId()).ToList();

		// Fetch users count for all tenant IDs
		var usersCounts = await (
			from ua in this._DbContext.UserAccount.AsNoTracking()
			where ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
				&& ua.TenantId != null
				&& tenantIds.Contains(ua.TenantId.Value)
			group ua by ua.TenantId into g
			select new { TenantId = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var usersCountDict = new Dictionary<Guid, int>();
		foreach (var row in usersCounts) {
			if (row.TenantId is null) {
				continue;
			}
			usersCountDict[row.TenantId.Value] = row.Count;
		}

		// Same page-bounded grouping as users counts: one grouped query over
		// only this page's tenant ids — never a whole-table scan (#168).
		var projectsCounts = await (
			from project in this._DbContext.Project.AsNoTracking()
			where !project.IsDeleted
				&& tenantIds.Contains(project.TenantId)
			group project by project.TenantId into g
			select new { TenantId = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var projectsCountDict = new Dictionary<Guid, int>();
		foreach (var row in projectsCounts) {
			projectsCountDict[row.TenantId] = row.Count;
		}

		// One grouped query per metric over this page's tenant ids only.
		var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

		var ownersCountDict = (await (
			from ua in this._DbContext.UserAccount.AsNoTracking()
			where ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
				&& ua.TenantId != null
				&& tenantIds.Contains(ua.TenantId.Value)
				&& ua.UserAccountRoles.Any(uar => uar.Role.IsFullAccess && !uar.Role.IsDeleted)
			group ua by ua.TenantId into g
			select new { TenantId = g.Key ?? Guid.Empty, Count = g.Count() }
		).ToDictionaryAsync(row => row.TenantId, row => row.Count, cancellationToken));

		var rolesCounts = await (
			from role in this._DbContext.Role.AsNoTracking()
			where role.Scope == RoleScope.Tenant
				&& !role.IsDeleted
				&& role.TenantId != null
				&& tenantIds.Contains(role.TenantId.Value)
			group role by role.TenantId into g
			select new { TenantId = g.Key ?? Guid.Empty, Count = g.Count() }
		).ToDictionaryAsync(row => row.TenantId, row => row.Count, cancellationToken);

		var connectedCounts = await (
			from account in this._DbContext.SocialAccount.AsNoTracking()
			where !account.IsDeleted
				&& (account.Status == SocialAccountStatus.Active
					|| account.Status == SocialAccountStatus.NeedsReconnect)
				&& tenantIds.Contains(account.TenantId)
			group account by account.TenantId into g
			select new { TenantId = g.Key, Count = g.Count() }
		).ToDictionaryAsync(row => row.TenantId, row => row.Count, cancellationToken);

		var postsCounts = await (
			from post in this._DbContext.Post.AsNoTracking()
			where !post.IsDeleted
				&& post.CreatedAt >= monthStart
				&& tenantIds.Contains(post.TenantId)
			group post by post.TenantId into g
			select new { TenantId = g.Key, Count = g.Count() }
		).ToDictionaryAsync(row => row.TenantId, row => row.Count, cancellationToken);

		var invitationCounts = (await (
			from invitation in this._DbContext.Invitation.AsNoTracking()
			where invitation.Scope == InvitationScope.Tenant
				&& invitation.Status == InvitationStatus.Pending
				&& invitation.ExpiresAt > now
				&& !invitation.IsDeleted
				&& invitation.TenantId != null
				&& tenantIds.Contains(invitation.TenantId.Value)
			group invitation by invitation.TenantId into g
			select new { TenantId = g.Key ?? Guid.Empty, Count = g.Count() }
		).ToDictionaryAsync(row => row.TenantId, row => row.Count, cancellationToken));

		// Map to flattened API DTO
		var items = tenants.Select(t => {
			var tenantId = t.GetRequiredId();
			return new TenantAsStaffListItem {
				Id = tenantId,
				Name = t.Name,
				Code = t.Code,
				DefaultLocale = t.DefaultLocale,
				LogoUrl = t.LogoUrl,
				UsersCount = usersCountDict.GetValueOrDefault(tenantId, 0),
				ProjectsCount = projectsCountDict.GetValueOrDefault(tenantId, 0),
				MaxUsers = t.MaxUsers,
				Status = t.Status,
				LastActivityAt = t.LastActivityAt,
				CreatedAt = t.CreatedAt,
				Timezone = t.Timezone,
				WebsiteUrl = t.WebsiteUrl,
				BillingEmail = t.BillingEmail,
				OwnersCount = ownersCountDict.GetValueOrDefault(tenantId, 0),
				RolesCount = rolesCounts.GetValueOrDefault(tenantId, 0),
				ConnectedAccountsCount = connectedCounts.GetValueOrDefault(tenantId, 0),
				PostsThisMonthCount = postsCounts.GetValueOrDefault(tenantId, 0),
				PendingInvitationsCount = invitationCounts.GetValueOrDefault(tenantId, 0),
			};
		}).ToList();

		return new FindTenantsAsStaffServiceResult.Success(
			new CursorPaginatedResult<TenantAsStaffListItem> {
				Data = items,
				NextCursor = nextCursor
			},
			counts,
			panelCounts
		);
	}

	// Seats bucket: full at 100%, high from 80%, otherwise available; a tenant
	// with no seat cap sits in no bucket (the list shows no ratio for it).
	private sealed record TenantFacets(
		int Active,
		int Pending,
		int Suspended,
		int Members,
		int Seats,
		int Full,
		int High,
		int Available,
		int ActiveThisWeek,
		List<TenantLocaleCount> Locales
	);

	// Occupancy band in SQL, integer math only: percent = round(members * 100 / max)
	// (half away from zero), so >= 80 % is members * 200 >= 159 * max and 100 % is
	// members * 200 >= 199 * max. 0 = no seats defined, 1 = available, 2 = high, 3 = full.
	private async Task<TenantFacets> _FindTenantFacetsAsync(
		IQueryable<Tenant> query,
		DateTime weekAgo,
		CancellationToken cancellationToken
	) {
		var statusFacets = await (
			from tenant in query
			group tenant by tenant.Status into g
			select new { Status = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);
		var localeFacets = await (
			from tenant in query
			group tenant by tenant.DefaultLocale into g
			select new { Locale = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);
		var bandFacets = await (
			from tenant in query
			let tenantMembers = this._DbContext.UserAccount.AsNoTracking().Count(ua =>
				ua.TenantId == tenant.Id
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			)
			let band = tenant.MaxUsers <= 0
				? 0
				: tenantMembers * 200 >= 199 * tenant.MaxUsers
					? 3
					: tenantMembers * 200 >= 159 * tenant.MaxUsers
						? 2
						: 1
			group tenant by band into g
			select new { Band = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);
		var members = await (
			from ua in this._DbContext.UserAccount.AsNoTracking()
			where ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
				&& query.Any(tenant => tenant.Id == ua.TenantId)
			select ua
		).CountAsync(cancellationToken);
		var seats = await query.SumAsync(t => t.MaxUsers, cancellationToken);
		var activeThisWeek = await query.CountAsync(
			t => t.LastActivityAt != null && t.LastActivityAt >= weekAgo,
			cancellationToken
		);

		return new TenantFacets(
			Active: statusFacets.Where(f => f.Status == TenantStatus.Active).Sum(f => f.Count),
			Pending: statusFacets.Where(f => f.Status == TenantStatus.Pending).Sum(f => f.Count),
			Suspended: statusFacets
				.Where(f => f.Status == TenantStatus.Suspended)
				.Sum(f => f.Count),
			Members: members,
			Seats: seats,
			Full: bandFacets.Where(f => f.Band == 3).Sum(f => f.Count),
			High: bandFacets.Where(f => f.Band == 2).Sum(f => f.Count),
			Available: bandFacets.Where(f => f.Band == 1).Sum(f => f.Count),
			ActiveThisWeek: activeThisWeek,
			Locales: localeFacets
				.Select(f => new TenantLocaleCount(Locale: f.Locale ?? string.Empty, Count: f.Count))
				.ToList()
		);
	}

	public async Task<CreateTenantWithInitialUsersOutcome> CreateTenantWithInitialUsersAsync(
		CreateTenantWithInitialUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		if (args.Code is not null) {
			var codeTaken = await this._DbContext.Tenant
				.AsNoTracking()
				.Where(t => t.Code == args.Code)
				.AnyAsync(cancellationToken);
			if (codeTaken) {
				return new CreateTenantWithInitialUsersOutcome.CodeAlreadyTaken(args.Code);
			}
		}

		// Random codes are drawn from a 62^10 keyspace, so a collision is practically
		// impossible; the loop still guards the write path with one retry before giving up.
		const int maxAttempts = 2;
		for (var attempt = 1; attempt <= maxAttempts; attempt++) {
			var code = args.Code ?? CryptoUtils.RandomString(10).ToLowerInvariant();

			await using var transaction =
				await this._DbContext.Database.BeginTransactionAsync(cancellationToken);

			// A created tenant may already carry a served-upload logoUrl: acquire
			// its asset reference inside this same transaction so the persisted
			// URL can never outlive a zero-reference asset row (#807 F5).
			if (ServedUploadPath.ExtractOrNull(args.LogoUrl) is { } createLogoPath) {
				await this._UploadReferences.TryAddReferenceAsync(
					createLogoPath, cancellationToken
				);
			}

			// 1. Create tenant
			var tenant = new Tenant {
				Name = args.Name,
				Code = code,
				Status = TenantStatus.Pending,
				MaxUsers = args.MaxUsers,
				LogoUrl = args.LogoUrl,
				LegalName = args.LegalName,
				Description = args.Description,
				WebsiteUrl = args.WebsiteUrl,
				BillingEmail = args.BillingEmail,
				SupportEmail = args.SupportEmail,
				DefaultLocale = args.DefaultLocale,
				Timezone = args.Timezone,
				Notes = args.Notes
			};

			try {
				var savedTenant = await this._DbContext.Tenant.AddAsync(tenant, cancellationToken);
				await this._DbContext.SaveChangesAsync(cancellationToken);
				var tenantId = savedTenant.Entity.GetRequiredId();

				// 2. Create the tenant's full-access system role. It always exists (it is
				// the role every former Admin is migrated to) and is not editable/deletable.
				var fullAccessRole = Role.CreateTenantRole(
					tenantId,
					SystemRoleNames.TenantFullAccess,
					"Organization owner with full access",
					isFullAccess: true
				);
				var savedFullAccessRole = await this._DbContext.Role.AddAsync(
					fullAccessRole, cancellationToken
				);
				await this._DbContext.SaveChangesAsync(cancellationToken);
				var fullAccessRoleId = savedFullAccessRole.Entity.GetRequiredId();

				// 3. Create "Default role" for members without an explicit role, unless disabled
				Guid? defaultRoleId = null;
				if (args.SeedDefaultRole) {
					var defaultRole = Role.CreateTenantRole(
						tenantId,
						name: "Default role",
						description: "Default role with no permissions",
						isDefault: true
					);
					var savedDefaultRole = await this._DbContext.Role.AddAsync(
						defaultRole, cancellationToken
					);
					await this._DbContext.SaveChangesAsync(cancellationToken);
					defaultRoleId = savedDefaultRole.Entity.GetRequiredId();
				}

				// 4. Create invitations with the role each initial user was given.
				// NOTE: No need to validate existing users/memberships for a BRAND NEW tenant!
				// All validation is done in the validator (duplicates, owner requirement, etc.)
				var invitationTokens = new List<(string Email, string Token)>();
				var expiresAt = DateTime.UtcNow.AddDays(7);

				foreach (var (email, isOwner) in args.InitialUsers) {
					var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);

					var roleIds = isOwner
						? new List<Guid> { fullAccessRoleId }
						: defaultRoleId is { } roleId
							? new List<Guid> { roleId }
							: new List<Guid>();

					var invitation = Invitation.CreateTenantInvitationWithRoles(
						email,
						tenantId,
						roleIds,
						args.InvitedByUserId,
						expiresAt,
						token
					);

					invitation.ValidateInvitationType();
					this._DbContext.Invitation.Add(invitation);

					// Durable delivery record in the same transaction as the
					// invitation and the tenant itself (round-5 API F3).
					var initialUserOutboxRow = InvitationEmailOutbox.CreateTenantInvitation(
						email, args.Name, token
					);
					initialUserOutboxRow.Invitation = invitation;
					this._DbContext.InvitationEmailOutbox.Add(initialUserOutboxRow);

					invitationTokens.Add((email, token));
				}

				await this._DbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				this._OutboxSignal.Notify();

				return new CreateTenantWithInitialUsersOutcome.Success(
					new CreateTenantWithInitialUsersResult {
						Tenant = savedTenant.Entity,
						InvitationTokens = invitationTokens
					}
				);
			} catch (DbUpdateException ex) when (TenantAsStaffService._IsTenantCodeUniqueViolation(ex)) {
				// The pre-check keeps the common path friendly, but the unique index is the
				// real guard against concurrent creates racing each other on the same code.
				await transaction.RollbackAsync(cancellationToken);
				this._DbContext.Entry(tenant).State = EntityState.Detached;

				if (args.Code is not null) {
					return new CreateTenantWithInitialUsersOutcome.CodeAlreadyTaken(args.Code);
				}
				if (attempt == maxAttempts) {
					return new CreateTenantWithInitialUsersOutcome.CodeGenerationFailed();
				}
				// Loop again to draw a fresh random code.
			} catch {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}
		}

		throw new InvalidOperationException(
			"Unreachable: CreateTenantWithInitialUsersAsync loop always returns."
		);
	}

	/// <summary>
	/// Detects unique constraint violations on the tenants.code column.
	/// PostgreSQL error code 23505 = unique_violation.
	/// </summary>
	private static bool _IsTenantCodeUniqueViolation(DbUpdateException ex) {
		if (ex.InnerException is Npgsql.PostgresException pgEx) {
			return pgEx.SqlState == "23505"
				&& pgEx.TableName is not null
				&& pgEx.TableName.Equals("tenants", StringComparison.OrdinalIgnoreCase);
		}

		return false;
	}

	public async Task<SuspendTenantResult> SuspendTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Use AsNoTracking for initial query to avoid EF tracking conflicts
		var tenant = await (
			from t in this._DbContext.Tenant.AsNoTracking()
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new SuspendTenantResult.NotFound();
		}
		if (tenant.IsSuspended()) {
			return new SuspendTenantResult.AlreadySuspended();
		}
		if (!tenant.IsActive()) {
			return new SuspendTenantResult.NotActiveStatus();
		}

		// Atomic update with WHERE clause checking current state (race condition safe)
		var rowsAffected = await this._DbContext.Tenant
			.Where(t =>
				t.Id == tenantId &&
				!t.IsDeleted &&
				t.Status != TenantStatus.Suspended &&
				t.Status == TenantStatus.Active)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(t => t.Status, TenantStatus.Suspended)
					.SetProperty(t => t.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			// Race condition: someone else changed the state between our read and update
			return new SuspendTenantResult.AlreadySuspended();
		}

		// Re-fetch tenant to return current state
		var updatedTenant = await (
			from t in this._DbContext.Tenant.AsNoTracking()
			where t.Id == tenantId
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (updatedTenant is null) {
			throw new InvalidOperationException(
				"Tenant disappeared after successful suspend update."
			);
		}

		return new SuspendTenantResult.Success(updatedTenant);
	}

	public async Task<ReactivateTenantResult> ReactivateTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Use AsNoTracking for initial query to avoid EF tracking conflicts
		var tenant = await (
			from t in this._DbContext.Tenant.AsNoTracking()
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new ReactivateTenantResult.NotFound();
		}
		if (!tenant.IsSuspended()) {
			return new ReactivateTenantResult.NotSuspended();
		}

		// Atomic update with WHERE clause checking current state (race condition safe)
		var rowsAffected = await this._DbContext.Tenant
			.Where(t =>
				t.Id == tenantId &&
				!t.IsDeleted &&
				t.Status == TenantStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(t => t.Status, TenantStatus.Active)
					.SetProperty(t => t.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			// Race condition: someone else changed the state between our read and update
			return new ReactivateTenantResult.NotSuspended();
		}

		// Re-fetch tenant to return current state
		var updatedTenant = await (
			from t in this._DbContext.Tenant.AsNoTracking()
			where t.Id == tenantId
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (updatedTenant is null) {
			throw new InvalidOperationException(
				"Tenant disappeared after successful reactivate update."
			);
		}

		return new ReactivateTenantResult.Success(updatedTenant);
	}

	public async Task<Tenant?> GetTenantByIdForStaffAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Staff can see suspended tenants (but not deleted ones)
		return await (
			from tenant in this._DbContext.Tenant
			where tenant.Id == tenantId && !tenant.IsDeleted
			select tenant
		).FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<int> CountTenantUsersAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Excludes soft-deleted users for parity with every list/export query
		// over the same membership rows (e.g. TenantUserQueryService._BuildExportBaseQuery) —
		// otherwise a staff-deleted user's still-present account row inflates this count
		// past what the tenant users list actually shows.
		var count =
			from ua in this._DbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua;

		return await count.CountAsync(cancellationToken);
	}

	public async Task<int> CountTenantOwnersAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Excludes soft-deleted users (same parity rationale as CountTenantUsersAsync).
		// Suspended owners still count here — this counts *assigned* full-access role
		// holders, not the *active* owners tracked by the last-admin invariant in
		// TenantUserMembershipOperations.
		var count =
			from ua in this._DbContext.UserAccount
			join uap in this._DbContext.UserAccountRole on ua.Id equals uap.UserAccountId
			join p in this._DbContext.Role on uap.RoleId equals p.Id
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& p.IsFullAccess
				&& !p.IsDeleted
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua;

		return await count.CountAsync(cancellationToken);
	}

	public async Task<UpdateTenantResult> UpdateTenantAsync(
		Guid tenantId,
		UpdateTenantAsStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenant = await (
			from t in this._DbContext.Tenant
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new UpdateTenantResult.NotFound();
		}

		// Computed once, before the mutation commits, so the response projection's
		// UsersCount never requires a post-commit query the handler could fail on
		// after the tenant record is already durably updated (round-5 API F2).
		var currentUserCount = await this.CountTenantUsersAsync(
			tenantId, cancellationToken
		);

		// Validate MaxUsers against current user count
		if (args.MaxUsers is not null && args.MaxUsers.Value < currentUserCount) {
			return new UpdateTenantResult.MaxUsersBelowCurrentCount();
		}

		// Captured before mutation so a replaced/cleared logoUrl can release its
		// asset reference in the same transaction as the update (#807 F5).
		var previousLogoUrl = tenant.LogoUrl;

		// Acquire the new blob's reference BEFORE the entity write: the acquire
		// joins this transaction, so a concurrent sweeper can never observe the
		// URL persisted while its asset still reads zero references.
		if (args.LogoUrl.IsPresent
			&& ServedUploadPath.ExtractOrNull(args.LogoUrl.Value) is { } acquiredPath) {
			await this._UploadReferences.TryAddReferenceAsync(acquiredPath, cancellationToken);
		}

		// Mutate tracked entity
		if (args.Name is not null) {
			tenant.Name = args.Name;
		}
		if (args.LogoUrl.IsPresent) {
			tenant.LogoUrl = args.LogoUrl.Value;
		}
		if (args.MaxUsers is not null) {
			tenant.MaxUsers = args.MaxUsers.Value;
		}
		if (args.LegalName.IsPresent) {
			tenant.LegalName = args.LegalName.Value;
		}
		if (args.Description.IsPresent) {
			tenant.Description = args.Description.Value;
		}
		if (args.WebsiteUrl.IsPresent) {
			tenant.WebsiteUrl = args.WebsiteUrl.Value;
		}
		if (args.BillingEmail.IsPresent) {
			tenant.BillingEmail = args.BillingEmail.Value;
		}
		if (args.SupportEmail.IsPresent) {
			tenant.SupportEmail = args.SupportEmail.Value;
		}
		if (args.DefaultLocale.IsPresent) {
			tenant.DefaultLocale = args.DefaultLocale.Value;
		}
		if (args.Timezone.IsPresent) {
			tenant.Timezone = args.Timezone.Value;
		}
		if (args.Notes.IsPresent) {
			tenant.Notes = args.Notes.Value;
		}
		tenant.UpdatedAt = DateTime.UtcNow;

		// The release of a replaced/cleared blob's reference MUST commit in the
		// same transaction as the entity write (#807 F5): splitting them would
		// let the sweeper physically delete a blob whose URL is still visible.
		// When no transaction is ambient (the usual path) one is opened here.
		var hadAmbientTransaction = this._DbContext.Database.CurrentTransaction is not null;
		var updateTransaction = hadAmbientTransaction
			? null
			: await this._DbContext.Database.BeginTransactionAsync(cancellationToken);
		try {
			await this._DbContext.SaveChangesAsync(cancellationToken);

			if (args.LogoUrl.IsPresent) {
				await this._ReleaseReplacedLogoReferenceAsync(
					tenantId, previousLogoUrl, tenant.LogoUrl, cancellationToken
				);
			}

			if (updateTransaction is not null) {
				await updateTransaction.CommitAsync(cancellationToken);
			}
		} catch {
			if (updateTransaction is not null) {
				await updateTransaction.RollbackAsync(cancellationToken);
			}
			throw;
		}

		return new UpdateTenantResult.Success(tenant, currentUserCount);
	}

	// Releases the replaced/cleared logo's asset reference. Best-effort by design:
	// legacy blobs persisted before upload_assets existed have no row to release,
	// and absolute http(s) URLs were never this API's blobs. Physical deletion of
	// the orphaned blob is exclusively the sweeper job's — never inline.
	private async Task _ReleaseReplacedLogoReferenceAsync(
		Guid tenantId,
		string? previousLogoUrl,
		string? newLogoUrl,
		CancellationToken cancellationToken
	) {
		if (
			previousLogoUrl is null
			|| previousLogoUrl == newLogoUrl
			|| !TenantValidationRules.IsServedUploadLogoUrl(previousLogoUrl)
		) {
			return;
		}

		var previousPath = ServedUploadPath.ExtractOrNull(previousLogoUrl);
		if (previousPath is null) {
			return;
		}

		var released = await this._UploadReferences.TryReleaseReferenceAsync(
			previousPath, cancellationToken
		);
		if (!released && this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Replaced tenant logo {PreviousLogoUrl} for tenant {TenantId} has no "
				+ "tracked asset row; nothing to release (pre-#807 or foreign blob)",
				previousLogoUrl,
				tenantId
			);
		}
	}

	public async Task<DeleteTenantResult> DeleteTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var tenant = await (
			from t in this._DbContext.Tenant.AsNoTracking()
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new DeleteTenantResult.NotFound();
		}

		if (!tenant.IsSuspended()) {
			return new DeleteTenantResult.NotSuspended();
		}

		// Atomic soft-delete with WHERE clause (race-condition safe)
		var rowsAffected = await this._DbContext.Tenant
			.Where(t =>
				t.Id == tenantId
				&& !t.IsDeleted
				&& t.Status == TenantStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(t => t.IsDeleted, true)
					.SetProperty(
						t => t.DeletedAt, DateTime.UtcNow
					)
					.SetProperty(
						t => t.UpdatedAt, DateTime.UtcNow
					),
				cancellationToken
			);

		if (rowsAffected == 0) {
			// Race condition: state changed between read and update
			return new DeleteTenantResult.NotSuspended();
		}

		return new DeleteTenantResult.Success(tenant);
	}

	public async Task<BulkSuspendResult> BulkSuspendAsync(
		IReadOnlyList<Guid> tenantIds,
		CancellationToken cancellationToken = default
	) {
		var requestedIds = tenantIds.Distinct().ToList();
		if (requestedIds.Count == 0) {
			return new BulkSuspendResult(0, 0, [], []);
		}

		var tenantStatuses = await this._FindBulkTenantStatusesAsync(
			requestedIds,
			cancellationToken
		);
		var failedItems = new List<(Guid TenantId, string Error)>();
		var candidateIds = new List<Guid>();

		foreach (var tenantId in requestedIds) {
			if (!tenantStatuses.TryGetValue(tenantId, out var status)) {
				failedItems.Add((tenantId, "Tenant not found"));
				continue;
			}

			if (status == TenantStatus.Suspended) {
				failedItems.Add((tenantId, "Already suspended"));
				continue;
			}

			if (status != TenantStatus.Active) {
				failedItems.Add((tenantId, "Tenant is not active"));
				continue;
			}

			candidateIds.Add(tenantId);
		}

		var succeededIds = await this._BulkSuspendTenantRowsAsync(
			candidateIds,
			cancellationToken
		);
		var succeededIdSet = succeededIds.ToHashSet();

		foreach (var candidateId in candidateIds) {
			if (!succeededIdSet.Contains(candidateId)) {
				failedItems.Add((candidateId, "Already suspended"));
			}
		}

		return new BulkSuspendResult(
			SucceededCount: succeededIds.Count,
			FailedCount: failedItems.Count,
			FailedItems: failedItems,
			SucceededIds: succeededIds
		);
	}

	public async Task<BulkReactivateResult> BulkReactivateAsync(
		IReadOnlyList<Guid> tenantIds,
		CancellationToken cancellationToken = default
	) {
		var requestedIds = tenantIds.Distinct().ToList();
		if (requestedIds.Count == 0) {
			return new BulkReactivateResult(0, 0, [], []);
		}

		var tenantStatuses = await this._FindBulkTenantStatusesAsync(
			requestedIds,
			cancellationToken
		);
		var failedItems = new List<(Guid TenantId, string Error)>();
		var candidateIds = new List<Guid>();

		foreach (var tenantId in requestedIds) {
			if (!tenantStatuses.TryGetValue(tenantId, out var status)) {
				failedItems.Add((tenantId, "Tenant not found"));
				continue;
			}

			if (status != TenantStatus.Suspended) {
				failedItems.Add((tenantId, "Tenant is not suspended"));
				continue;
			}

			candidateIds.Add(tenantId);
		}

		var succeededIds = await this._BulkReactivateTenantRowsAsync(
			candidateIds,
			cancellationToken
		);
		var succeededIdSet = succeededIds.ToHashSet();

		foreach (var candidateId in candidateIds) {
			if (!succeededIdSet.Contains(candidateId)) {
				failedItems.Add((candidateId, "Tenant is not suspended"));
			}
		}

		return new BulkReactivateResult(
			SucceededCount: succeededIds.Count,
			FailedCount: failedItems.Count,
			FailedItems: failedItems,
			SucceededIds: succeededIds
		);
	}

	public async Task<BulkDeleteResult> BulkDeleteAsync(
		IReadOnlyList<Guid> tenantIds,
		CancellationToken cancellationToken = default
	) {
		var requestedIds = tenantIds.Distinct().ToList();
		if (requestedIds.Count == 0) {
			return new BulkDeleteResult(0, 0, [], []);
		}

		var tenantStatuses = await this._FindBulkTenantStatusesAsync(
			requestedIds,
			cancellationToken
		);
		var failedItems = new List<(Guid TenantId, string Error)>();
		var candidateIds = new List<Guid>();

		foreach (var tenantId in requestedIds) {
			if (!tenantStatuses.TryGetValue(tenantId, out var status)) {
				failedItems.Add((tenantId, "Tenant not found"));
				continue;
			}

			if (status != TenantStatus.Suspended) {
				failedItems.Add((tenantId, "Tenant is not suspended"));
				continue;
			}

			candidateIds.Add(tenantId);
		}

		var succeededIds = await this._BulkDeleteTenantRowsAsync(
			candidateIds,
			cancellationToken
		);
		var succeededIdSet = succeededIds.ToHashSet();

		foreach (var candidateId in candidateIds) {
			if (!succeededIdSet.Contains(candidateId)) {
				failedItems.Add((candidateId, "Tenant is not suspended"));
			}
		}

		return new BulkDeleteResult(
			SucceededCount: succeededIds.Count,
			FailedCount: failedItems.Count,
			FailedItems: failedItems,
			SucceededIds: succeededIds
		);
	}

	private async Task<List<Guid>> _BulkSuspendTenantRowsAsync(
		IReadOnlyCollection<Guid> tenantIds,
		CancellationToken cancellationToken
	) {
		if (tenantIds.Count == 0) {
			return [];
		}

		var tenantIdArray = tenantIds.ToArray();
		var now = DateTime.UtcNow;
		var activeStatus = (int)TenantStatus.Active;
		var suspendedStatus = (int)TenantStatus.Suspended;

		return await this._DbContext.Database.SqlQuery<Guid>(
			$"""
			UPDATE tenants
			SET status = {suspendedStatus}, updated_at = {now}
			WHERE id = ANY ({tenantIdArray})
				AND NOT is_deleted
				AND status = {activeStatus}
			RETURNING id AS "Value"
			"""
		).ToListAsync(cancellationToken);
	}

	private async Task<List<Guid>> _BulkReactivateTenantRowsAsync(
		IReadOnlyCollection<Guid> tenantIds,
		CancellationToken cancellationToken
	) {
		if (tenantIds.Count == 0) {
			return [];
		}

		var tenantIdArray = tenantIds.ToArray();
		var now = DateTime.UtcNow;
		var activeStatus = (int)TenantStatus.Active;
		var suspendedStatus = (int)TenantStatus.Suspended;

		return await this._DbContext.Database.SqlQuery<Guid>(
			$"""
			UPDATE tenants
			SET status = {activeStatus}, updated_at = {now}
			WHERE id = ANY ({tenantIdArray})
				AND NOT is_deleted
				AND status = {suspendedStatus}
			RETURNING id AS "Value"
			"""
		).ToListAsync(cancellationToken);
	}

	private async Task<List<Guid>> _BulkDeleteTenantRowsAsync(
		IReadOnlyCollection<Guid> tenantIds,
		CancellationToken cancellationToken
	) {
		if (tenantIds.Count == 0) {
			return [];
		}

		var tenantIdArray = tenantIds.ToArray();
		var now = DateTime.UtcNow;
		var suspendedStatus = (int)TenantStatus.Suspended;

		return await this._DbContext.Database.SqlQuery<Guid>(
			$"""
			UPDATE tenants
			SET is_deleted = TRUE, deleted_at = {now}, updated_at = {now}
			WHERE id = ANY ({tenantIdArray})
				AND NOT is_deleted
				AND status = {suspendedStatus}
			RETURNING id AS "Value"
			"""
		).ToListAsync(cancellationToken);
	}

	private async Task<Dictionary<Guid, TenantStatus>> _FindBulkTenantStatusesAsync(
		IReadOnlyCollection<Guid> tenantIds,
		CancellationToken cancellationToken
	) {
		var tenantStatuses = await (
			from tenant in this._DbContext.Tenant.AsNoTracking()
			where tenant.Id.HasValue
				&& tenantIds.Contains(tenant.Id.Value)
				&& !tenant.IsDeleted
			select new {
				Id = tenant.Id.GetValueOrDefault(),
				tenant.Status
			}
		).ToListAsync(cancellationToken);

		return tenantStatuses.ToDictionary(
			tenant => tenant.Id,
			tenant => tenant.Status
		);
	}
}
