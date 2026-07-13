using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Validation;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Tenants.Services;

// Flattened API-safe DTO (no EF entities)
public class TenantAsStaffListItem {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
	public string? LogoUrl { get; init; }
	public required int UsersCount { get; init; }
	public required int MaxUsers { get; init; }
	public required string Status { get; init; }
	public DateTime? LastActivityAt { get; init; }
}

public record CreateTenantWithInitialUsersResult {
	public required Tenant Tenant { get; init; }
	public required List<(string Email, string Token, AccountLevel Level)> InvitationTokens { get; init; }
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
	List<(string Email, AccountLevel AccountLevel)> InitialUsers,
	Guid InvitedByUserId,
	string? Code,
	bool SeedDefaultProfile,
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

	// Count tenant-scoped owners (Admin-level accounts; owner ≡ accountLevel Admin)
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
	private readonly AppDbContext _dbContext;
	private readonly IFileStorage _fileStorage;
	private readonly ILogger<TenantAsStaffService> _logger;

	public TenantAsStaffService(
		AppDbContext dbContext,
		IFileStorage fileStorage,
		ILogger<TenantAsStaffService> logger
	) {
		_dbContext = dbContext;
		_fileStorage = fileStorage;
		_logger = logger;
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

	public async Task<int> CountTenantsAsync(CancellationToken cancellationToken = default) {
		var query =
			from tenant in _dbContext.Tenant
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
			["created_at"] = new CursorSortFieldHandler<Tenant>(
				getCursorValue: async (guid) => {
					var tenant = await _dbContext.Tenant
						.AsNoTracking()
						.Where(t => t.Id == guid && !t.IsDeleted)
						.Select(t => new { t.CreatedAt, t.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return tenant is not null ? (tenant.CreatedAt, tenant.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(t => t.CreatedAt > cursorCreatedAt || (t.CreatedAt == cursorCreatedAt && t.Id > cursorId))
						: q.Where(t => t.CreatedAt < cursorCreatedAt || (t.CreatedAt == cursorCreatedAt && t.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(t => t.CreatedAt).ThenBy(t => t.Id)
					: q.OrderByDescending(t => t.CreatedAt).ThenByDescending(t => t.Id)
			),
			["updated_at"] = new CursorSortFieldHandler<Tenant>(
				getCursorValue: async (guid) => {
					var tenant = await _dbContext.Tenant
						.AsNoTracking()
						.Where(t => t.Id == guid && !t.IsDeleted)
						.Select(t => new { t.UpdatedAt, t.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return tenant is not null ? (tenant.UpdatedAt, tenant.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorUpdatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(t => t.UpdatedAt > cursorUpdatedAt || (t.UpdatedAt == cursorUpdatedAt && t.Id > cursorId))
						: q.Where(t => t.UpdatedAt < cursorUpdatedAt || (t.UpdatedAt == cursorUpdatedAt && t.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(t => t.UpdatedAt).ThenBy(t => t.Id)
					: q.OrderByDescending(t => t.UpdatedAt).ThenByDescending(t => t.Id)
			),
			["name"] = new CursorSortFieldHandler<Tenant>(
				getCursorValue: async (guid) => {
					var tenant = await _dbContext.Tenant
						.AsNoTracking()
						.Where(t => t.Id == guid && !t.IsDeleted)
						.Select(t => new { t.Name, t.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return tenant is not null ? (tenant.Name, tenant.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorName, cursorId) = ((string, Guid?))cursorValue;
					return isAsc
						? q.Where(t => t.Name.CompareTo(cursorName) > 0 || (t.Name == cursorName && t.Id > cursorId))
						: q.Where(t => t.Name.CompareTo(cursorName) < 0 || (t.Name == cursorName && t.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(t => t.Name).ThenBy(t => t.Id)
					: q.OrderByDescending(t => t.Name).ThenByDescending(t => t.Id)
			),
			["status"] = new CursorSortFieldHandler<Tenant>(
				getCursorValue: async (guid) => {
					var tenant = await _dbContext.Tenant
						.AsNoTracking()
						.Where(t => t.Id == guid && !t.IsDeleted)
						.Select(t => new { t.Status, t.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return tenant is not null ? (tenant.Status, tenant.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

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
		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<Tenant>? handler
			)
		) {
			return new FindTenantsAsStaffServiceResult.InvalidSortId(effectiveSortId);
		}

		// Build base query on Tenant entity only (no joins for pagination)
		IQueryable<Tenant> baseQuery = _dbContext.Tenant
			.AsNoTracking()
			.Where(t => !t.IsDeleted && t.Id.HasValue);

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
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
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
				LastActivityAt = t.LastActivityAt,
			};
		}).ToList();

		return new FindTenantsAsStaffServiceResult.Success(
			new CursorPaginatedResult<TenantAsStaffListItem> {
				Data = items,
				NextCursor = nextCursor
			}
		);
	}

	public async Task<CreateTenantWithInitialUsersOutcome> CreateTenantWithInitialUsersAsync(
		CreateTenantWithInitialUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		if (args.Code is not null) {
			var codeTaken = await _dbContext.Tenant
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
				await _dbContext.Database.BeginTransactionAsync(cancellationToken);

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
				var savedTenant = await _dbContext.Tenant.AddAsync(tenant, cancellationToken);
				await _dbContext.SaveChangesAsync(cancellationToken);
				var tenantId = savedTenant.Entity.GetRequiredId();

				// 2. Create "Default profile" for non-admin users, unless disabled
				Guid? defaultProfileId = null;
				if (args.SeedDefaultProfile) {
					var defaultProfile = Profile.CreateTenantProfile(
						tenantId,
						name: "Default profile",
						description: "Default profile with no permissions",
						isDefault: true
					);
					var savedDefaultProfile = await _dbContext.Profile.AddAsync(
						defaultProfile, cancellationToken
					);
					await _dbContext.SaveChangesAsync(cancellationToken);
					defaultProfileId = savedDefaultProfile.Entity.GetRequiredId();
				}

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
					} else if (defaultProfileId is { } profileId) {
						// Non-admin users get the default profile when one was seeded.
						profileIds = new List<Guid> { profileId };
					} else {
						// No default profile was seeded; the user starts with no profiles and
						// can be assigned one post-hoc (admins already bypass profile checks,
						// so this only affects non-admin invitees).
						profileIds = new List<Guid>();
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

				return new CreateTenantWithInitialUsersOutcome.Success(
					new CreateTenantWithInitialUsersResult {
						Tenant = savedTenant.Entity,
						InvitationTokens = invitationTokens
					}
				);
			} catch (DbUpdateException ex) when (IsTenantCodeUniqueViolation(ex)) {
				// The pre-check keeps the common path friendly, but the unique index is the
				// real guard against concurrent creates racing each other on the same code.
				await transaction.RollbackAsync(cancellationToken);
				_dbContext.Entry(tenant).State = EntityState.Detached;

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
	private static bool IsTenantCodeUniqueViolation(DbUpdateException ex) {
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
			from t in _dbContext.Tenant.AsNoTracking()
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
		var rowsAffected = await _dbContext.Tenant
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
		if (!tenant.IsSuspended()) {
			return new ReactivateTenantResult.NotSuspended();
		}

		// Atomic update with WHERE clause checking current state (race condition safe)
		var rowsAffected = await _dbContext.Tenant
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
		// Excludes soft-deleted users for parity with every list/export query
		// over the same membership rows (e.g. TenantUserQueryService.BuildExportBaseQuery) —
		// otherwise a staff-deleted user's still-present account row inflates this count
		// past what the tenant users list actually shows.
		var count =
			from ua in _dbContext.UserAccount
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
		// Suspended admins still count as owners here — this counts *assigned*
		// Admin-level accounts, not the *active* admins tracked by the last-admin
		// invariant in TenantUserMembershipOperations.BuildActiveTenantAdminAccountsQuery.
		var count =
			from ua in _dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.Level == AccountLevel.Admin
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

		// Captured before mutation so a replaced/cleared logoUrl can have its old
		// blob deleted after the update commits (see DeleteReplacedLogoBlobAsync).
		var previousLogoUrl = tenant.LogoUrl;

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
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (args.LogoUrl.IsPresent) {
			await DeleteReplacedLogoBlobAsync(
				tenantId, previousLogoUrl, tenant.LogoUrl, cancellationToken
			);
		}

		return new UpdateTenantResult.Success(tenant);
	}

	// Best-effort cleanup of the blob a logoUrl replace/clear leaves behind. Runs after
	// the update has already committed, so a delete failure here must never surface as
	// a request failure — it only risks a harmless orphaned file, not data loss.
	private async Task DeleteReplacedLogoBlobAsync(
		Guid tenantId,
		string? previousLogoUrl,
		string? newLogoUrl,
		CancellationToken cancellationToken
	) {
		if (previousLogoUrl is null
			|| previousLogoUrl == newLogoUrl
			|| !TenantValidationRules.IsServedUploadLogoUrl(previousLogoUrl)) {
			return;
		}

		var relativePath = previousLogoUrl["/files/".Length..];
		try {
			await _fileStorage.DeleteAsync(relativePath, cancellationToken);
		} catch (Exception ex) {
			_logger.LogWarning(
				ex,
				"Failed to delete replaced logo blob {RelativePath} for tenant {TenantId}",
				relativePath,
				tenantId
			);
		}
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

		if (!tenant.IsSuspended()) {
			return new DeleteTenantResult.NotSuspended();
		}

		// Atomic soft-delete with WHERE clause (race-condition safe)
		var rowsAffected = await _dbContext.Tenant
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
