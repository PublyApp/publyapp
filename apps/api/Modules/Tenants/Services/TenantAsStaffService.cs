using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Validation;
using PublyApp.Api.Modules.Uploads.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Tenants.Services;

// Flattened API-safe DTO (no EF entities)
public class TenantAsStaffListItem {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
	public string? LogoUrl { get; init; }
	public required int UsersCount { get; init; }
	public required int MaxUsers { get; init; }
	public required TenantStatus Status { get; init; }
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
	private readonly IInvitationEmailOutboxSignal _outboxSignal;
	private readonly IUploadAssetReferenceService _uploadReferences;
	private readonly ILogger<TenantAsStaffService> _logger;

	public TenantAsStaffService(
		AppDbContext dbContext,
		IInvitationEmailOutboxSignal outboxSignal,
		IUploadAssetReferenceService uploadReferences,
		ILogger<TenantAsStaffService> logger
	) {
		_dbContext = dbContext;
		_outboxSignal = outboxSignal;
		_uploadReferences = uploadReferences;
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
			["created_at"] = CursorSortFieldHandlerFactory.Create<Tenant, DateTime, Guid?>(
				cursorLookupQuery: () => _dbContext.Tenant
					.AsNoTracking()
					.Where(t => !t.IsDeleted),
				keySelector: t => t.CreatedAt,
				idSelector: t => t.Id,
				cancellationToken
			),
			["updated_at"] = CursorSortFieldHandlerFactory.Create<Tenant, DateTime, Guid?>(
				cursorLookupQuery: () => _dbContext.Tenant
					.AsNoTracking()
					.Where(t => !t.IsDeleted),
				keySelector: t => t.UpdatedAt,
				idSelector: t => t.Id,
				cancellationToken
			),
			["name"] = CursorSortFieldHandlerFactory.Create<Tenant, string, Guid?>(
				cursorLookupQuery: () => _dbContext.Tenant
					.AsNoTracking()
					.Where(t => !t.IsDeleted),
				keySelector: t => t.Name,
				idSelector: t => t.Id,
				cancellationToken
			),
			["status"] = CursorSortFieldHandlerFactory.Create<Tenant, TenantStatus, Guid?>(
				cursorLookupQuery: () => _dbContext.Tenant
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
		IQueryable<Tenant> baseQuery = _dbContext.Tenant
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

		// Map to flattened API DTO
		var items = tenants.Select(t => {
			var tenantId = t.GetRequiredId();
			return new TenantAsStaffListItem {
				Id = tenantId,
				Name = t.Name,
				LogoUrl = t.LogoUrl,
				UsersCount = usersCountDict.GetValueOrDefault(tenantId, 0),
				MaxUsers = t.MaxUsers,
				Status = t.Status,
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

			// A created tenant may already carry a served-upload logoUrl: acquire
			// its asset reference inside this same transaction so the persisted
			// URL can never outlive a zero-reference asset row (#807 F5).
			if (ServedUploadPath.ExtractOrNull(args.LogoUrl) is { } createLogoPath) {
				await _uploadReferences.TryAddReferenceAsync(
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
						// Admin users don't need profiles: TenantPermissionFilter short-circuits
						// on AccountLevel.Admin (apps/api/Lib/Filters/TenantPermissionFilter.cs),
						// granting full access regardless of profile-derived permissions. See #861.
						profileIds = new List<Guid>();
					} else if (defaultProfileId is { } profileId) {
						// Non-admin users get the default profile when one was seeded.
						profileIds = new List<Guid> { profileId };
					} else {
						// No default profile was seeded; the user starts with no profiles and can
						// be assigned one post-hoc. The Admin bypass above is the only branch that
						// doesn't need profiles — this branch is strictly for non-admin invitees.
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

					// Durable delivery record in the same transaction as the
					// invitation and the tenant itself (round-5 API F3).
					var initialUserOutboxRow = InvitationEmailOutbox.CreateTenantInvitation(
						email, args.Name, token, accountLevel
					);
					initialUserOutboxRow.Invitation = invitation;
					_dbContext.InvitationEmailOutbox.Add(initialUserOutboxRow);

					invitationTokens.Add((email, token, accountLevel));
				}

				await _dbContext.SaveChangesAsync(cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				_outboxSignal.Notify();

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

		// Computed once, before the mutation commits, so the response projection's
		// UsersCount never requires a post-commit query the handler could fail on
		// after the tenant record is already durably updated (round-5 API F2).
		var currentUserCount = await CountTenantUsersAsync(
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
			await _uploadReferences.TryAddReferenceAsync(acquiredPath, cancellationToken);
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
		var hadAmbientTransaction = _dbContext.Database.CurrentTransaction is not null;
		var updateTransaction = hadAmbientTransaction
			? null
			: await _dbContext.Database.BeginTransactionAsync(cancellationToken);
		try {
			await _dbContext.SaveChangesAsync(cancellationToken);

			if (args.LogoUrl.IsPresent) {
				await ReleaseReplacedLogoReferenceAsync(
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
	private async Task ReleaseReplacedLogoReferenceAsync(
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

		var released = await _uploadReferences.TryReleaseReferenceAsync(
			previousPath, cancellationToken
		);
		if (!released && _logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
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
		var requestedIds = tenantIds.Distinct().ToList();
		if (requestedIds.Count == 0) {
			return new BulkSuspendResult(0, 0, [], []);
		}

		var tenantStatuses = await FindBulkTenantStatusesAsync(
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

		var succeededIds = await BulkSuspendTenantRowsAsync(
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

		var tenantStatuses = await FindBulkTenantStatusesAsync(
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

		var succeededIds = await BulkReactivateTenantRowsAsync(
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

		var tenantStatuses = await FindBulkTenantStatusesAsync(
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

		var succeededIds = await BulkDeleteTenantRowsAsync(
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

	private async Task<List<Guid>> BulkSuspendTenantRowsAsync(
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

		return await _dbContext.Database.SqlQuery<Guid>(
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

	private async Task<List<Guid>> BulkReactivateTenantRowsAsync(
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

		return await _dbContext.Database.SqlQuery<Guid>(
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

	private async Task<List<Guid>> BulkDeleteTenantRowsAsync(
		IReadOnlyCollection<Guid> tenantIds,
		CancellationToken cancellationToken
	) {
		if (tenantIds.Count == 0) {
			return [];
		}

		var tenantIdArray = tenantIds.ToArray();
		var now = DateTime.UtcNow;
		var suspendedStatus = (int)TenantStatus.Suspended;

		return await _dbContext.Database.SqlQuery<Guid>(
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

	private async Task<Dictionary<Guid, TenantStatus>> FindBulkTenantStatusesAsync(
		IReadOnlyCollection<Guid> tenantIds,
		CancellationToken cancellationToken
	) {
		var tenantStatuses = await (
			from tenant in _dbContext.Tenant.AsNoTracking()
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
