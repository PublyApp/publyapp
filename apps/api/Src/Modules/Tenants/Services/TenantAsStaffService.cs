using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Tenants.Services;

public class TenantAsStaffItem {
	public required Tenant Tenant { get; set; }
	public int UsersCount { get; set; }
}

// Flattened API-safe DTO (no EF entities)
public class TenantAsStaffListItem {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
	public string? LogoUrl { get; init; }
	public required int UsersCount { get; init; }
	public required int MaxUsers { get; init; }
	public required string Status { get; init; }
	public required bool IsSuspended { get; init; }
}

public record CreateTenantWithInitialUsersResult {
	public required Tenant Tenant { get; init; }
	public required List<(string Email, string Token, AccountLevel Level)> InvitationTokens { get; init; }
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
	List<(Guid TenantId, string Error)> FailedItems
);
public record BulkReactivateResult(
	int SucceededCount,
	int FailedCount,
	List<(Guid TenantId, string Error)> FailedItems
);
public record BulkDeleteResult(
	int SucceededCount,
	int FailedCount,
	List<(Guid TenantId, string Error)> FailedItems
);

// Result types for update/delete operations
public abstract record UpdateTenantResult {
	public sealed record Success(Tenant Tenant) : UpdateTenantResult;
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
	int? MaxUsers
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
	List<(string Email, AccountLevel AccountLevel)> InitialUsers,
	Guid InvitedByUserId
);

public abstract record FindTenantsAsStaffServiceResult {
	public sealed record Success(CursorPaginatedResult<TenantAsStaffListItem> Data)
		: FindTenantsAsStaffServiceResult;

	public sealed record CursorNotFound(string Cursor)
		: FindTenantsAsStaffServiceResult;

	public sealed record InvalidSortId(string SortId)
		: FindTenantsAsStaffServiceResult;
}

public interface ITenantAsStaffService {
	Task<Tenant> CreateTenant(Tenant tenant, CancellationToken cancellationToken = default);

	Task<Tenant?> GetTenantByIdAsync(Guid tenantId, CancellationToken cancellationToken = default);

	Task<List<TenantAsStaffItem>> FindTenantsAsync(
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantsAsStaffServiceResult> FindTenantsAsStaffAsync(
		FindTenantsAsStaffArgs args,
		CancellationToken cancellationToken = default
	);

	Task<int> CountTenantsAsync(CancellationToken cancellationToken = default);

	// NEW: Create tenant with initial users via invitations
	Task<CreateTenantWithInitialUsersResult> CreateTenantWithInitialUsersAsync(
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

public class TenantAsStaffService : ITenantAsStaffService {
	private readonly MainApiDbContext _dbContext;

	public TenantAsStaffService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<Tenant> CreateTenant(Tenant tenant, CancellationToken cancellationToken = default) {
		var result = await _dbContext.Tenant.AddAsync(tenant, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);
		return result.Entity;
	}

	public async Task<Tenant?> GetTenantByIdAsync(Guid tenantId, CancellationToken cancellationToken = default) {
		var query =
			from tenant in _dbContext.Tenant
			where tenant.Id == tenantId
			select tenant;

		var foundTenant = await query.FirstOrDefaultAsync(cancellationToken);

		if (foundTenant is not null && !Tenant.IsTenantActive(foundTenant)) {
			return null;
		}

		return foundTenant;
	}

	public async Task<List<TenantAsStaffItem>> FindTenantsAsync(
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectivePage = page ?? 1;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;

		var query =
			from tenant in _dbContext.Tenant
			where tenant.IsDeleted != true
			join userAccount in _dbContext.UserAccount
				.Where(ua => ua.Scope == AccountScope.Tenant && ua.IsDeleted != true)
				on tenant.Id equals userAccount.TenantId into userAccounts
			select new TenantAsStaffItem {
				Tenant = tenant,
				UsersCount = userAccounts.Count()
			};

		if (sortId is not null) {
			var isAsc = effectiveSortOrder == SortOrder.Asc;
			if (string.Equals(sortId, "created_at", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(t => t.Tenant.CreatedAt) : query.OrderByDescending(t => t.Tenant.CreatedAt);
			}
			if (string.Equals(sortId, "updated_at", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(t => t.Tenant.UpdatedAt) : query.OrderByDescending(t => t.Tenant.UpdatedAt);
			}
			if (string.Equals(sortId, "code", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(t => t.Tenant.Code) : query.OrderByDescending(t => t.Tenant.Code);
			}
			if (string.Equals(sortId, "name", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(t => t.Tenant.Name) : query.OrderByDescending(t => t.Tenant.Name);
			}
			if (string.Equals(sortId, "status", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(t => t.Tenant.Status) : query.OrderByDescending(t => t.Tenant.Status);
			}
			if (string.Equals(sortId, "users_count", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(t => t.UsersCount) : query.OrderByDescending(t => t.UsersCount);
			}
		}

		query = query
			.Skip((effectivePage - 1) * effectiveLimit)
			.Take(effectiveLimit);

		return await query
			.ToListAsync(cancellationToken);
	}

	public async Task<int> CountTenantsAsync(CancellationToken cancellationToken = default) {
		var query =
			from tenant in _dbContext.Tenant
			where tenant.IsDeleted != true
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

		// SortFieldHandler dictionary - works on Tenant entity only
		var sortFieldHandlers = new Dictionary<string, TenantSortFieldHandler>(
			StringComparer.OrdinalIgnoreCase
		) {
			["created_at"] = new TenantSortFieldHandler(
				getCursorValue: async (guid) => {
					var tenant = await _dbContext.Tenant
						.Where(t => t.Id == guid && t.IsDeleted != true)
						.Select(t => new { t.CreatedAt, t.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return tenant is not null ? (tenant.CreatedAt, tenant.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(t => t.CreatedAt > cursorCreatedAt || (t.CreatedAt == cursorCreatedAt && t.Id > cursorId))
						: q.Where(t => t.CreatedAt < cursorCreatedAt || (t.CreatedAt == cursorCreatedAt && t.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(t => t.CreatedAt).ThenBy(t => t.Id)
					: q.OrderByDescending(t => t.CreatedAt).ThenByDescending(t => t.Id)
			),
			["updated_at"] = new TenantSortFieldHandler(
				getCursorValue: async (guid) => {
					var tenant = await _dbContext.Tenant
						.Where(t => t.Id == guid && t.IsDeleted != true)
						.Select(t => new { t.UpdatedAt, t.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return tenant is not null ? (tenant.UpdatedAt, tenant.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorUpdatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(t => t.UpdatedAt > cursorUpdatedAt || (t.UpdatedAt == cursorUpdatedAt && t.Id > cursorId))
						: q.Where(t => t.UpdatedAt < cursorUpdatedAt || (t.UpdatedAt == cursorUpdatedAt && t.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(t => t.UpdatedAt).ThenBy(t => t.Id)
					: q.OrderByDescending(t => t.UpdatedAt).ThenByDescending(t => t.Id)
			),
			["name"] = new TenantSortFieldHandler(
				getCursorValue: async (guid) => {
					var tenant = await _dbContext.Tenant
						.Where(t => t.Id == guid && t.IsDeleted != true)
						.Select(t => new { t.Name, t.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return tenant is not null ? (tenant.Name, tenant.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorName, cursorId) = ((string, Guid?))cursorValue;
					return isAsc
						? q.Where(t => t.Name.CompareTo(cursorName) > 0 || (t.Name == cursorName && t.Id > cursorId))
						: q.Where(t => t.Name.CompareTo(cursorName) < 0 || (t.Name == cursorName && t.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(t => t.Name).ThenBy(t => t.Id)
					: q.OrderByDescending(t => t.Name).ThenByDescending(t => t.Id)
			),
			["status"] = new TenantSortFieldHandler(
				getCursorValue: async (guid) => {
					var tenant = await _dbContext.Tenant
						.Where(t => t.Id == guid && t.IsDeleted != true)
						.Select(t => new { t.Status, t.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return tenant is not null ? (tenant.Status, tenant.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorStatus, cursorId) = ((TenantStatus, Guid?))cursorValue;
					return isAsc
						? q.Where(t => t.Status > cursorStatus || (t.Status == cursorStatus && t.Id > cursorId))
						: q.Where(t => t.Status < cursorStatus || (t.Status == cursorStatus && t.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(t => t.Status).ThenBy(t => t.Id)
					: q.OrderByDescending(t => t.Status).ThenByDescending(t => t.Id)
			),
		};

		// Validate sortId via TryGetValue
		if (!sortFieldHandlers.TryGetValue(effectiveSortId, out TenantSortFieldHandler? handler)) {
			return new FindTenantsAsStaffServiceResult.InvalidSortId(effectiveSortId);
		}

		// Build base query on Tenant entity only (no joins for pagination)
		IQueryable<Tenant> baseQuery = _dbContext.Tenant.Where(t => t.IsDeleted != true && t.Id.HasValue);

		// Apply search filter
		if (args.Filters?.Search is { } search) {
			// Search semantics:
			// - Name: substring match (ILIKE %q%) backed by pg_trgm index on tenants.name.
			// - Code: prefix match only (StartsWith) so we can rely on the existing btree index
			//   and avoid adding a second (GIN) index on the same column as the unique index.
			var pattern = $"%{search}%";
			var codePrefix = search.ToLowerInvariant();
			baseQuery = baseQuery.Where(t =>
				EF.Functions.ILike(t.Name, pattern) ||
				t.Code.StartsWith(codePrefix)
			);
		}

		// Apply status filter
		if (args.Filters?.Status is { } statuses && statuses.Count > 0) {
			baseQuery = baseQuery.Where(t => statuses.Contains(t.Status));
		}

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
			from ua in _dbContext.UserAccount
			where ua.Scope == AccountScope.Tenant
				&& ua.IsDeleted != true
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

		// Map to flattened API DTO
		var items = tenants.Select(t => {
			var tenantId = t.GetRequiredId();
			return new TenantAsStaffListItem {
				Id = tenantId,
				Name = t.Name,
				LogoUrl = t.LogoUrl,
				UsersCount = usersCountDict.GetValueOrDefault(tenantId, 0),
				MaxUsers = t.MaxUsers,
				Status = Tenant.GetStatusDescription(t.Status),
				IsSuspended = t.IsSuspended
			};
		}).ToList();

		return new FindTenantsAsStaffServiceResult.Success(
			new CursorPaginatedResult<TenantAsStaffListItem> {
				Data = items,
				NextCursor = nextCursor
			}
		);
	}

	// SortFieldHandler for Tenant entity only
	private class TenantSortFieldHandler {
		public Func<Guid, Task<object?>> GetCursorValue { get; }
		public Func<IQueryable<Tenant>, object?, bool, IQueryable<Tenant>> ApplyFilter { get; }
		public Func<IQueryable<Tenant>, bool, IOrderedQueryable<Tenant>> ApplyOrdering { get; }

		public TenantSortFieldHandler(
			Func<Guid, Task<object?>> getCursorValue,
			Func<IQueryable<Tenant>, object?, bool, IQueryable<Tenant>> applyFilter,
			Func<IQueryable<Tenant>, bool, IOrderedQueryable<Tenant>> applyOrdering
		) {
			GetCursorValue = getCursorValue;
			ApplyFilter = applyFilter;
			ApplyOrdering = applyOrdering;
		}
	}

	public async Task<CreateTenantWithInitialUsersResult> CreateTenantWithInitialUsersAsync(
		CreateTenantWithInitialUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			// 1. Create tenant
			var tenant = new Tenant {
				Name = args.Name,
				Code = CryptoUtils.RandomString(10).ToLower(),
				Status = TenantStatus.Pending,
				MaxUsers = args.MaxUsers
			};

			var savedTenant = await _dbContext.Tenant.AddAsync(tenant, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);
			var tenantId = savedTenant.Entity.GetRequiredId();

			// 2. Create "Default profile" for non-admin users
			var defaultProfile = Profile.CreateTenantProfile(
				tenantId,
				name: "Default profile",
				description: "Default profile with no permissions",
				isDefault: true
			);
			var savedDefaultProfile = await _dbContext.Profile.AddAsync(defaultProfile, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);
			var defaultProfileId = savedDefaultProfile.Entity.GetRequiredId();

			// 3. Create invitations with appropriate profiles
			// NOTE: No need to validate existing users/memberships for a BRAND NEW tenant!
			// All validation is done in the validator (duplicates, admin requirement, etc.)
			var invitationTokens = new List<(string Email, string Token, AccountLevel Level)>();
			var expiresAt = DateTime.UtcNow.AddDays(7);

			foreach (var (email, accountLevel) in args.InitialUsers) {
				var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);

				// Determine profile IDs based on account level
				List<Guid> profileIds;
				if (accountLevel == AccountLevel.Admin) {
					// Admin users don't need profiles (they have all rights)
					profileIds = new List<Guid>();
				} else {
					// Non-admin users need at least 1 profile (app requirement)
					// Assign the default profile
					profileIds = new List<Guid> { defaultProfileId };
				}

				var invitation = Invitation.CreateTenantInvitationWithProfiles(
					email,
					tenantId,
					profileIds,
					args.InvitedByUserId,
					expiresAt,
					token
				);

				// Store the account level in the invitation
				invitation.AccountLevel = accountLevel;

				invitation.ValidateInvitationType();
				_dbContext.Invitation.Add(invitation);

				invitationTokens.Add((email, token, accountLevel));
			}

			await _dbContext.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);

			return new CreateTenantWithInitialUsersResult {
				Tenant = savedTenant.Entity,
				InvitationTokens = invitationTokens
			};

		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	public async Task<SuspendTenantResult> SuspendTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Use AsNoTracking for initial query to avoid EF tracking conflicts
		var tenant = await (
			from t in _dbContext.Tenant.AsNoTracking()
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new SuspendTenantResult.NotFound();
		}
		if (tenant.IsSuspended) {
			return new SuspendTenantResult.AlreadySuspended();
		}
		if (tenant.Status != TenantStatus.Active) {
			return new SuspendTenantResult.NotActiveStatus();
		}

		// Atomic update with WHERE clause checking current state (race condition safe)
		var rowsAffected = await _dbContext.Tenant
			.Where(t =>
				t.Id == tenantId &&
				!t.IsDeleted &&
				!t.IsSuspended &&
				t.Status == TenantStatus.Active)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(t => t.IsSuspended, true)
					.SetProperty(t => t.Status, TenantStatus.Suspended)
					.SetProperty(t => t.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			// Race condition: someone else changed the state between our read and update
			return new SuspendTenantResult.AlreadySuspended();
		}

		// Re-fetch tenant to return current state
		var updatedTenant = await (
			from t in _dbContext.Tenant.AsNoTracking()
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
			from t in _dbContext.Tenant.AsNoTracking()
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new ReactivateTenantResult.NotFound();
		}
		if (!tenant.IsSuspended) {
			return new ReactivateTenantResult.NotSuspended();
		}

		// Atomic update with WHERE clause checking current state (race condition safe)
		var rowsAffected = await _dbContext.Tenant
			.Where(t =>
				t.Id == tenantId &&
				!t.IsDeleted &&
				t.IsSuspended &&
				t.Status == TenantStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(t => t.IsSuspended, false)
					.SetProperty(t => t.Status, TenantStatus.Active)
					.SetProperty(t => t.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			// Race condition: someone else changed the state between our read and update
			return new ReactivateTenantResult.NotSuspended();
		}

		// Re-fetch tenant to return current state
		var updatedTenant = await (
			from t in _dbContext.Tenant.AsNoTracking()
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
			from tenant in _dbContext.Tenant
			where tenant.Id == tenantId && !tenant.IsDeleted
			select tenant
		).FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<int> CountTenantUsersAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var count =
			from ua in _dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
			select ua;

		return await count.CountAsync(cancellationToken);
	}

	public async Task<UpdateTenantResult> UpdateTenantAsync(
		Guid tenantId,
		UpdateTenantAsStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenant = await (
			from t in _dbContext.Tenant
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new UpdateTenantResult.NotFound();
		}

		// Validate MaxUsers against current user count
		if (args.MaxUsers is not null) {
			var currentUserCount = await CountTenantUsersAsync(
				tenantId, cancellationToken
			);
			if (args.MaxUsers.Value < currentUserCount) {
				return new UpdateTenantResult.MaxUsersBelowCurrentCount();
			}
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
		tenant.UpdatedAt = DateTime.UtcNow;
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new UpdateTenantResult.Success(tenant);
	}

	public async Task<DeleteTenantResult> DeleteTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var tenant = await (
			from t in _dbContext.Tenant.AsNoTracking()
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new DeleteTenantResult.NotFound();
		}

		if (!tenant.IsSuspended) {
			return new DeleteTenantResult.NotSuspended();
		}

		// Atomic soft-delete with WHERE clause (race-condition safe)
		var rowsAffected = await _dbContext.Tenant
			.Where(t =>
				t.Id == tenantId
				&& !t.IsDeleted
				&& t.IsSuspended)
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
		var failedItems = new List<(Guid TenantId, string Error)>();
		var succeededCount = 0;

		foreach (var tenantId in tenantIds) {
			var result = await SuspendTenantAsync(tenantId, cancellationToken);

			if (result is SuspendTenantResult.Success) {
				succeededCount++;
				continue;
			}

			var errorMessage = result switch {
				SuspendTenantResult.NotFound => "Tenant not found",
				SuspendTenantResult.AlreadySuspended => "Already suspended",
				SuspendTenantResult.NotActiveStatus => "Tenant is not active",
				_ => throw new InvalidOperationException(
					$"Unknown suspend tenant result: {result.GetType().Name}"
				)
			};
			failedItems.Add((tenantId, errorMessage));
		}

		return new BulkSuspendResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<BulkReactivateResult> BulkReactivateAsync(
		IReadOnlyList<Guid> tenantIds,
		CancellationToken cancellationToken = default
	) {
		var failedItems = new List<(Guid TenantId, string Error)>();
		var succeededCount = 0;

		foreach (var tenantId in tenantIds) {
			var result = await ReactivateTenantAsync(tenantId, cancellationToken);

			if (result is ReactivateTenantResult.Success) {
				succeededCount++;
				continue;
			}

			var errorMessage = result switch {
				ReactivateTenantResult.NotFound => "Tenant not found",
				ReactivateTenantResult.NotSuspended => "Tenant is not suspended",
				_ => throw new InvalidOperationException(
					$"Unknown reactivate tenant result: {result.GetType().Name}"
				)
			};
			failedItems.Add((tenantId, errorMessage));
		}

		return new BulkReactivateResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<BulkDeleteResult> BulkDeleteAsync(
		IReadOnlyList<Guid> tenantIds,
		CancellationToken cancellationToken = default
	) {
		var failedItems = new List<(Guid TenantId, string Error)>();
		var succeededCount = 0;

		foreach (var tenantId in tenantIds) {
			var result = await DeleteTenantAsync(tenantId, cancellationToken);

			if (result is DeleteTenantResult.Success) {
				succeededCount++;
				continue;
			}

			var errorMessage = result switch {
				DeleteTenantResult.NotFound => "Tenant not found",
				DeleteTenantResult.NotSuspended => "Tenant is not suspended",
				_ => throw new InvalidOperationException(
					$"Unknown delete tenant result: {result.GetType().Name}"
				)
			};
			failedItems.Add((tenantId, errorMessage));
		}

		return new BulkDeleteResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}
}
