using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public abstract record CreateUserResult {
	public sealed record Success(User User) : CreateUserResult;
	public sealed record UserAlreadyExists(User User) : CreateUserResult;
}


public class StaffUserData {
	public required User User { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

public abstract record FindStaffUsersResult {
	public sealed record Success(
		CursorPaginatedResult<StaffUserData> Data
	) : FindStaffUsersResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindStaffUsersResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindStaffUsersResult;
}

public sealed record FindStaffUsersFilters(
	string? Search,
	IReadOnlySet<UserStatus>? Status
);

public sealed record FindStaffUsersArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindStaffUsersFilters? Filters
);

public class UpdateUserDocument {
	public string? Email { get; set; }
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
	public string? AccountLevel { get; set; }
	public PatchField<string?> Status { get; set; } = PatchField<string?>.Absent();
}

public abstract record UpdateUserByIdResult {
	public sealed record Success(
		StaffUserData UserData
	) : UpdateUserByIdResult;
	public sealed record UserNotFound() : UpdateUserByIdResult;
	public sealed record UserAccountNotFound() : UpdateUserByIdResult;
	public sealed record UpdateFailed(
		string ErrorMessage
	) : UpdateUserByIdResult;
}

public abstract record FindTenantUsersResult {
	public sealed record Success(
		CursorPaginatedResult<TenantUserData> Data
	) : FindTenantUsersResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindTenantUsersResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindTenantUsersResult;
}

public record FindTenantUsersAsStaffFilters(
	string? Search,
	IReadOnlySet<TenantUserStatus>? Status
);

public record FindTenantUsersAsStaffArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindTenantUsersAsStaffFilters? Filters
);

public abstract record FindTenantUserCompaniesResult {
	public sealed record Success(
		CursorPaginatedResult<TenantUserCompanyData> Data
	) : FindTenantUserCompaniesResult;

	public sealed record NotFound() : FindTenantUserCompaniesResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindTenantUserCompaniesResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindTenantUserCompaniesResult;
}

public record FindTenantUserCompaniesForStaffArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindTenantUserCompaniesForStaffFilters? Filters
);

public record FindTenantUserCompaniesForStaffFilters(
	string? Search
);

public abstract record RemoveUserFromTenantResult {
	public sealed record Success() : RemoveUserFromTenantResult;
	public sealed record NotFound() : RemoveUserFromTenantResult;
	public sealed record CannotRemoveLastAdmin() : RemoveUserFromTenantResult;
}

public sealed record TenantUserCompanyIdsArgs(
	Guid UserId,
	IReadOnlyCollection<Guid> TenantIds
);

public sealed record AssignTenantUserCompaniesArgs(
	Guid UserId,
	IReadOnlyCollection<Guid> TenantIds,
	AccountLevel Level
);

public sealed record TenantUserCompanyBulkActionFailedItem(
	Guid TenantId,
	string Error
);

public sealed record TenantUserCompanyBulkActionResult(
	int SucceededCount,
	int FailedCount,
	List<TenantUserCompanyBulkActionFailedItem> FailedItems
);

public class TenantUserData {
	public required User User { get; set; }
	public required UserAccount Account { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

public class TenantUserCompanyData {
	public required UserAccount Account { get; set; }
	public required Tenant Tenant { get; set; }
	public required AccountLevel AccountLevel { get; set; }
	public required UserStatus UserStatus { get; set; }
}

public class TenantUserDetailsData {
	public required User User { get; set; }
	public required int CompanyCount { get; set; }
}

public class UpdateTenantUserDocument {
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
	public string? Level { get; set; }
}

public class UpdateTenantUserIdentityDocument {
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
}

public abstract record UpdateTenantUserResult {
	public sealed record Success(
		TenantUserData UserData
	) : UpdateTenantUserResult;
	public sealed record NotFound() : UpdateTenantUserResult;
	public sealed record CannotDemoteLastAdmin() : UpdateTenantUserResult;
}

public abstract record UpdateTenantUserIdentityResult {
	public sealed record Success(
		TenantUserDetailsData UserData
	) : UpdateTenantUserIdentityResult;
	public sealed record NotFound() : UpdateTenantUserIdentityResult;
}

public abstract record UpdateTenantUserEmailResult {
	public sealed record Success(
		TenantUserDetailsData UserData
	) : UpdateTenantUserEmailResult;
	public sealed record NotFound() : UpdateTenantUserEmailResult;
	public sealed record EmailAlreadyInUse() : UpdateTenantUserEmailResult;
}

public abstract record SuspendTenantUserIdentityResult {
	public sealed record Success(
		TenantUserDetailsData UserData
	) : SuspendTenantUserIdentityResult;
	public sealed record NotFound() : SuspendTenantUserIdentityResult;
	public sealed record AlreadySuspended() : SuspendTenantUserIdentityResult;
	public sealed record CannotSuspendLastAdmin() : SuspendTenantUserIdentityResult;
}

public abstract record ReactivateTenantUserIdentityResult {
	public sealed record Success(
		TenantUserDetailsData UserData
	) : ReactivateTenantUserIdentityResult;
	public sealed record NotFound() : ReactivateTenantUserIdentityResult;
	public sealed record NotSuspended() : ReactivateTenantUserIdentityResult;
}

public abstract record SuspendTenantUserResult {
	public sealed record Success(TenantUserData UserData) : SuspendTenantUserResult;
	public sealed record NotFound() : SuspendTenantUserResult;
	public sealed record AlreadySuspended() : SuspendTenantUserResult;
	public sealed record CannotSuspendLastAdmin() : SuspendTenantUserResult;
}

public abstract record ReactivateTenantUserResult {
	public sealed record Success(TenantUserData UserData) : ReactivateTenantUserResult;
	public sealed record NotFound() : ReactivateTenantUserResult;
	public sealed record NotSuspended() : ReactivateTenantUserResult;
}

public sealed record StaffUserProfileSummary(
	Guid Id,
	string Name,
	string? Description
);

public sealed record StaffUserProfilesSummary(
	List<StaffUserProfileSummary> AssignedProfiles
);

public abstract record UpdateStaffUserProfilesServiceResult {
	public sealed record Success(
		List<StaffUserProfileSummary> AssignedProfiles
	) : UpdateStaffUserProfilesServiceResult;

	public sealed record UserNotFound() : UpdateStaffUserProfilesServiceResult;

	public sealed record ProfilesNotFound(
		List<Guid> ProfileIds
	) : UpdateStaffUserProfilesServiceResult;

	public sealed record ProfilesNotStaffScope(
		List<Guid> ProfileIds
	) : UpdateStaffUserProfilesServiceResult;
}

public abstract record SuspendStaffUserResult {
	public sealed record Success(StaffUserData UserData) : SuspendStaffUserResult;
	public sealed record NotFound() : SuspendStaffUserResult;
	public sealed record AlreadySuspended() : SuspendStaffUserResult;
}

public abstract record ReactivateStaffUserResult {
	public sealed record Success(StaffUserData UserData) : ReactivateStaffUserResult;
	public sealed record NotFound() : ReactivateStaffUserResult;
	public sealed record NotSuspended() : ReactivateStaffUserResult;
}

public abstract record DeleteStaffUserResult {
	public sealed record Success(
		StaffUserData UserData,
		Guid UserAccountId
	) : DeleteStaffUserResult;
	public sealed record NotFound() : DeleteStaffUserResult;
	public sealed record NotSuspended() : DeleteStaffUserResult;
}

public sealed record BulkStaffUserFailedItem(
	Guid UserId,
	string Error
);

public sealed record BulkStaffUserActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkStaffUserFailedItem> FailedItems
);

public abstract record UpdateStaffUserEmailResult {
	public sealed record Success(StaffUserData UserData) : UpdateStaffUserEmailResult;
	public sealed record NotFound() : UpdateStaffUserEmailResult;
	public sealed record EmailAlreadyInUse() : UpdateStaffUserEmailResult;
}

public interface IUserService {
	Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailVerificationTokenAsync(string token, CancellationToken cancellationToken = default);
	Task<User?> GetUserByPasswordResetTokenAsync(string token, CancellationToken cancellationToken = default);
	Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByIdAsync(Guid? id, CancellationToken cancellationToken = default);
	Task<StaffUserData?> GetStaffUserUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<UpdateStaffUserEmailResult> UpdateStaffUserEmailAsync(Guid userId, string email, CancellationToken cancellationToken = default);
	Task<int> CountStaffUsersAsync(CancellationToken cancellationToken = default);
	Task<FindStaffUsersResult> FindStaffUsersAsync(
		FindStaffUsersArgs args,
		CancellationToken cancellationToken = default
	);
	Task<UpdateUserByIdResult> UpdateStaffUserByIdAsync(Guid userId, UpdateUserDocument document, CancellationToken cancellationToken = default);
	Task<FindTenantUsersResult> FindTenantUsersAsync(
		Guid tenantId,
		FindTenantUsersAsStaffArgs args,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserData?> GetTenantUserByIdAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserDetailsData?> GetTenantUserDetailsForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<FindTenantUserCompaniesResult> FindTenantUserCompaniesForStaffAsync(
		Guid userId,
		FindTenantUserCompaniesForStaffArgs args,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserCompanyBulkActionResult> AssignTenantUserCompaniesForStaffAsync(
		AssignTenantUserCompaniesArgs args,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserCompanyBulkActionResult> BulkRemoveTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserCompanyBulkActionResult> BulkSuspendTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserCompanyBulkActionResult>
	BulkReactivateTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	);
	Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<UpdateTenantUserResult> UpdateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		UpdateTenantUserDocument document,
		CancellationToken cancellationToken = default
	);
	Task<UpdateTenantUserIdentityResult> UpdateTenantUserIdentityForStaffAsync(
		Guid userId,
		UpdateTenantUserIdentityDocument document,
		CancellationToken cancellationToken = default
	);
	Task<UpdateTenantUserEmailResult> UpdateTenantUserEmailForStaffAsync(
		Guid userId,
		string email,
		CancellationToken cancellationToken = default
	);
	Task<SuspendTenantUserIdentityResult> SuspendTenantUserIdentityForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<ReactivateTenantUserIdentityResult> ReactivateTenantUserIdentityForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<SuspendTenantUserResult> SuspendTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<ReactivateTenantUserResult> ReactivateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class UserService : IUserService {
	private sealed class TenantUserCompanyQueryRow {
		public required UserAccount Account { get; init; }
		public required User User { get; init; }
		public required Tenant Tenant { get; init; }
		public required Guid TenantId { get; init; }
	}

	private readonly AppDbContext _dbContext;
	private readonly ILogger<UserService> _logger;

	public UserService(AppDbContext dbContext, ILogger<UserService> logger) {
		_dbContext = dbContext;
		_logger = logger;
	}

	private static int GetTenantUserStatusRank(
		bool isUserGloballySuspended,
		bool isMembershipSuspended
	) {
		// Sort order mirrors the tenant-user effective status:
		// Active = 0, Suspended = 1, GloballySuspended = 2.
		if (isUserGloballySuspended) {
			return 2;
		}

		if (isMembershipSuspended) {
			return 1;
		}

		return 0;
	}

	public async Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default) {
		// check if user already exists
		var existingUser = await _dbContext.User
			.FirstOrDefaultAsync(u => u.Email == user.Email, cancellationToken);

		if (existingUser is not null) {
			return new CreateUserResult.UserAlreadyExists(existingUser);
		}

		var result = await _dbContext.User.AddAsync(user, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new CreateUserResult.Success(result.Entity);
	}

	public async Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default) {
		var normalizedEmail = email.ToLowerInvariant();
		var query =
			from u in _dbContext.User
			where u.Email == normalizedEmail
			&& !u.IsDeleted
			// Check status and verification in the login handler so it can return tailored errors.
			select u;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default) {
		_dbContext.User.Update(user);
		await _dbContext.SaveChangesAsync(cancellationToken);
		return user;
	}

	public async Task<User?> GetUserByIdAsync(Guid? id, CancellationToken cancellationToken = default) {
		var query =
			from u in _dbContext.User
			where u.Id == id
			select u;
		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<User?> GetUserByEmailVerificationTokenAsync(string token, CancellationToken cancellationToken = default) {
		var query =
			from u in _dbContext.User
			where u.EmailVerifyToken == token
			select u;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<User?> GetUserByPasswordResetTokenAsync(string token, CancellationToken cancellationToken = default) {
		var query =
			from u in _dbContext.User
			where u.PasswordResetToken == token
			select u;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<StaffUserData?> GetStaffUserUserByIdAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// NOTE: We intentionally do NOT filter out suspended staff users here.
		// Staff must be able to view a suspended user to be able to reactivate them
		// (and to audit "who is suspended and why"). Soft-deleted records remain hidden.
		return await (
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new StaffUserData {
				User = ua.User,
				AccountLevel = ua.Level
			}
		).FirstOrDefaultAsync(cancellationToken);
	}


	public async Task<UpdateStaffUserEmailResult> UpdateStaffUserEmailAsync(
		Guid userId,
		string email,
		CancellationToken cancellationToken = default
	) {
		// Email change is a high-risk identity operation (affects sign-in).
		// We keep it on a dedicated service method (and endpoint) so the API can enforce
		// stricter validation/permission and clients cannot "accidentally" update email via PATCH.
		var normalizedEmail = email.Trim().ToLowerInvariant();

		var query =
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new StaffUserData { User = ua.User, AccountLevel = ua.Level };

		var userData = await query.FirstOrDefaultAsync(cancellationToken);
		if (userData is null) {
			return new UpdateStaffUserEmailResult.NotFound();
		}

		if (!string.Equals(userData.User.Email, normalizedEmail, StringComparison.Ordinal)) {
			var existing = await GetUserByEmailAsync(normalizedEmail, cancellationToken);
			if (existing is not null && existing.GetRequiredId() != userId) {
				return new UpdateStaffUserEmailResult.EmailAlreadyInUse();
			}

			userData.User.Email = normalizedEmail;
			await _dbContext.SaveChangesAsync(cancellationToken);
		}

		return new UpdateStaffUserEmailResult.Success(userData);
	}

	public async Task<int> CountStaffUsersAsync(CancellationToken cancellationToken = default) {
		// For staff admin screens, we count all staff users (including suspended) so staff can
		// see who exists even if they are currently suspended. Soft-deleted records stay hidden.
		var query =
			from ua in _dbContext.UserAccount
			where ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.User;
		return await query.CountAsync(cancellationToken);
	}

	public async Task<FindStaffUsersResult> FindStaffUsersAsync(
		FindStaffUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		// Staff discovery intentionally includes suspended users so admins can
		// search, audit, and reactivate them from the same list.
		var effectiveLimit = args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortId = args.SortId ?? "created_at";
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var isAsc = effectiveSortOrder == SortOrder.Asc;

		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<UserAccount>>(
			StringComparer.OrdinalIgnoreCase
		) {
			["created_at"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.CreatedAt,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.CreatedAt, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorCreatedAt, cursorId) = ((DateTime, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.CreatedAt > cursorCreatedAt
								|| (ua.User.CreatedAt == cursorCreatedAt
									&& ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.CreatedAt < cursorCreatedAt
								|| (ua.User.CreatedAt == cursorCreatedAt
									&& ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.CreatedAt, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.CreatedAt descending, ua.UserId descending
						select ua
			),
			["updated_at"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.UpdatedAt,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.UpdatedAt, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorUpdatedAt, cursorId) = ((DateTime, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.UpdatedAt > cursorUpdatedAt
								|| (ua.User.UpdatedAt == cursorUpdatedAt
									&& ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.UpdatedAt < cursorUpdatedAt
								|| (ua.User.UpdatedAt == cursorUpdatedAt
									&& ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.UpdatedAt, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.UpdatedAt descending, ua.UserId descending
						select ua
			),
			["email"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.Email,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.Email, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorEmail, cursorId) = ((string, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.Email.CompareTo(cursorEmail) > 0
								|| (ua.User.Email == cursorEmail && ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.Email.CompareTo(cursorEmail) < 0
								|| (ua.User.Email == cursorEmail && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.Email, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.Email descending, ua.UserId descending
						select ua
			),
			["first_name"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								FirstName = ua.User.FirstName ?? string.Empty,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.FirstName, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorFirstName, cursorId) = ((string, Guid))cursorValue;
					return asc
						? from ua in q
							let firstName = ua.User.FirstName ?? string.Empty
							where firstName.CompareTo(cursorFirstName) > 0
								|| (firstName == cursorFirstName && ua.UserId > cursorId)
							select ua
						: from ua in q
							let firstName = ua.User.FirstName ?? string.Empty
							where firstName.CompareTo(cursorFirstName) < 0
								|| (firstName == cursorFirstName && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						let firstName = ua.User.FirstName ?? string.Empty
						orderby firstName, ua.UserId
						select ua
					: from ua in q
						let firstName = ua.User.FirstName ?? string.Empty
						orderby firstName descending, ua.UserId descending
						select ua
			),
			["last_name"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								LastName = ua.User.LastName ?? string.Empty,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.LastName, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorLastName, cursorId) = ((string, Guid))cursorValue;
					return asc
						? from ua in q
							let lastName = ua.User.LastName ?? string.Empty
							where lastName.CompareTo(cursorLastName) > 0
								|| (lastName == cursorLastName && ua.UserId > cursorId)
							select ua
						: from ua in q
							let lastName = ua.User.LastName ?? string.Empty
							where lastName.CompareTo(cursorLastName) < 0
								|| (lastName == cursorLastName && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						let lastName = ua.User.LastName ?? string.Empty
						orderby lastName, ua.UserId
						select ua
					: from ua in q
						let lastName = ua.User.LastName ?? string.Empty
						orderby lastName descending, ua.UserId descending
						select ua
			),
			["status"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.Status,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.Status, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorStatus, cursorId) = ((UserStatus, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.Status > cursorStatus
								|| (ua.User.Status == cursorStatus && ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.Status < cursorStatus
								|| (ua.User.Status == cursorStatus && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.Status, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.Status descending, ua.UserId descending
						select ua
			),
			["level"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.Level,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.Level, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorLevel, cursorId) = ((AccountLevel, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.Level > cursorLevel
								|| (ua.Level == cursorLevel && ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.Level < cursorLevel
								|| (ua.Level == cursorLevel && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.Level, ua.UserId
						select ua
					: from ua in q
						orderby ua.Level descending, ua.UserId descending
						select ua
			),
		};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<UserAccount>? handler
			)
		) {
			return new FindStaffUsersResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua;

		IQueryable<UserAccount> query = baseQuery;

		if (args.Filters?.Search is { } search) {
			var trimmed = search.Trim();
			if (trimmed.Length > 0) {
				// Search is intentionally substring-based so staff can quickly find
				// records by partial email or name fragments.
				var pattern = $"%{trimmed}%";
				query =
					from ua in query
					where (ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern))
						|| (ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern))
						|| EF.Functions.ILike(ua.User.Email, pattern)
					select ua;
			}
		}

		if (args.Filters?.Status is { Count: > 0 } statuses) {
			query =
				from ua in query
				where statuses.Contains(ua.User.Status)
				select ua;
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(args.Cursor);
			if (cursorValue is null) {
				return new FindStaffUsersResult.CursorNotFound(
					args.Cursor.ToString()
				);
			}

			query = handler.ApplyFilter(query, cursorValue, isAsc);
		}

		var orderedQuery = handler.ApplyOrdering(query, isAsc);
		var results = await (
			from ua in orderedQuery
			select new StaffUserData {
				User = ua.User,
				AccountLevel = ua.Level
			}
		)
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			// Fetch one extra row so we can emit the next cursor without a separate count query.
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().User.GetRequiredId().ToString();
		}

		return new FindStaffUsersResult.Success(
			new CursorPaginatedResult<StaffUserData> {
				Data = results,
				NextCursor = nextCursor,
			}
		);
	}


	public async Task<FindTenantUsersResult>
	FindTenantUsersAsync(
		Guid tenantId,
		FindTenantUsersAsStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "id";

		var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<UserAccount>>(
				StringComparer.OrdinalIgnoreCase
			) {
				["id"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var ua = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select (Guid?)x.UserId
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return ua;
					},
					applyFilter: (q, val, isAsc) => {
						var id = (Guid?)val;
						if (id is null) {
							return q;
						}
						return isAsc
							? q.Where(x => x.UserId > id)
							: q.Where(x => x.UserId < id);
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.UserId
						)
				),

				["email"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.User.Email,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.Email, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (email, id) =
							((string, Guid))val;
						return isAsc
							? q.Where(x =>
								x.User.Email
									.CompareTo(
										email
									) > 0
								|| (x.User.Email == email
									&& x.UserId > id))
							: q.Where(x =>
								x.User.Email
									.CompareTo(
										email
									) < 0
								|| (x.User.Email == email
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.User.Email)
							.ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.Email
						).ThenByDescending(
							x => x.UserId
						)
				),

				["status"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								IsUserGloballySuspended = x.User.Status == UserStatus.Suspended,
								IsMembershipSuspended = x.Status == AccountStatus.Suspended,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (
								GetTenantUserStatusRank(
									item.IsUserGloballySuspended,
									item.IsMembershipSuspended
								),
								item.UserId
							)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (statusRank, id) =
							((int, Guid))val;
						// Keep this expression EF-translatable; do not call GetTenantStatus() here.
						return isAsc
							? q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Status == AccountStatus.Suspended
										? 1
										: 0) > statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.UserId > id))
							: q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Status == AccountStatus.Suspended
										? 1
										: 0) < statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.UserId < id));
					},
					// Same EF-translatable rank expression as applyFilter for stable keyset pagination.
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenByDescending(
							x => x.UserId
						)
				),

				["level"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.Level,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.Level, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (level, id) =
							((AccountLevel, Guid))val;
						return isAsc
							? q.Where(x =>
								x.Level > level
								|| (x.Level == level
									&& x.UserId > id))
							: q.Where(x =>
								x.Level < level
								|| (x.Level == level
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.Level
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.Level
						).ThenByDescending(
							x => x.UserId
						)
				),

				["created_at"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.User.CreatedAt,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.CreatedAt, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (createdAt, id) =
							((DateTime, Guid))val;
						return isAsc
							? q.Where(x =>
								x.User.CreatedAt
									> createdAt
								|| (x.User.CreatedAt
										== createdAt
									&& x.UserId > id))
							: q.Where(x =>
								x.User.CreatedAt
									< createdAt
								|| (x.User.CreatedAt
										== createdAt
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.User.CreatedAt
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.CreatedAt
						).ThenByDescending(
							x => x.UserId
						)
				),
			};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<UserAccount>? handler
			)
		) {
			return new FindTenantUsersResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua;

		IQueryable<UserAccount> query = baseQuery;

		// Apply search filter (by name or email)
		// Search semantics: substring match (ILIKE %q%) for case-insensitive search
		if (args.Filters?.Search is { } search) {
			var effectiveQ = search.Trim();
			var pattern = $"%{effectiveQ}%";
			query = query.Where(ua =>
				(ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern)) ||
				(ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern)) ||
				EF.Functions.ILike(ua.User.Email, pattern)
			);
		}

		// Apply status filter
		if (args.Filters?.Status is { } statuses && statuses.Count > 0) {
			var includesActive = statuses.Contains(TenantUserStatus.Active);
			var includesSuspended = statuses.Contains(TenantUserStatus.Suspended);
			var includesGloballySuspended = statuses.Contains(
				TenantUserStatus.GloballySuspended
			);

			query = query.Where(ua =>
				// These are effective tenant-user statuses, not only persisted account statuses.
				(includesGloballySuspended
					&& ua.User.Status == UserStatus.Suspended)
				|| (includesSuspended
					&& ua.User.Status != UserStatus.Suspended
					&& ua.Status == AccountStatus.Suspended)
				|| (includesActive
					&& ua.User.Status != UserStatus.Suspended
					&& ua.Status != AccountStatus.Suspended)
			);
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue =
				await handler.GetCursorValue(args.Cursor);

			if (cursorValue is null) {
				return new FindTenantUsersResult
					.CursorNotFound(args.Cursor.ToString());
			}

			query = handler.ApplyFilter(
				query,
				cursorValue,
				effectiveSortOrder == SortOrder.Asc
			);
		}

		var orderedQuery = handler.ApplyOrdering(
			query,
			effectiveSortOrder == SortOrder.Asc
		);

		var results = await orderedQuery
			.Select(ua => new TenantUserData {
				User = ua.User,
				Account = ua,
				AccountLevel = ua.Level,
			})
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last()
				.User.GetRequiredId().ToString();
		}

		return new FindTenantUsersResult.Success(
			new CursorPaginatedResult<TenantUserData> {
				Data = results,
				NextCursor = nextCursor,
			}
		);
	}

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

	public async Task<TenantUserDetailsData?> GetTenantUserDetailsForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Treat tenant user details as a shared identity page. Live company
		// memberships are counted separately so unlinking the last company does
		// not imply the User record was deleted.
		var user = await (
			from u in _dbContext.User.AsNoTracking()
			where u.Id == userId
				&& !u.IsDeleted
				&& (
					from ua in _dbContext.UserAccount.AsNoTracking()
					where ua.UserId == u.Id
						&& ua.Scope == AccountScope.Tenant
					select ua
				).Any()
			select u
		).FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			return null;
		}

		var companyCount = await (
			from ua in _dbContext.UserAccount.AsNoTracking()
			join tenant in _dbContext.Tenant.AsNoTracking()
				on ua.TenantId equals tenant.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !tenant.IsDeleted
			select ua
		).CountAsync(cancellationToken);

		return new TenantUserDetailsData {
			User = user,
			CompanyCount = companyCount,
		};
	}

	public async Task<FindTenantUserCompaniesResult>
	FindTenantUserCompaniesForStaffAsync(
		Guid userId,
		FindTenantUserCompaniesForStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "tenant_name";

		var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<TenantUserCompanyQueryRow>>(
				StringComparer.OrdinalIgnoreCase
			) {
				["tenant_name"] = new CursorSortFieldHandler<TenantUserCompanyQueryRow>(
					getCursorValue: async (guid) => {
						var item = await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							join tenant in _dbContext.Tenant.AsNoTracking()
								on ua.TenantId equals tenant.Id
							where ua.UserId == userId
								&& ua.TenantId == guid
								&& ua.Scope == AccountScope.Tenant
								&& ua.TenantId != null
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
								&& !tenant.IsDeleted
							select new {
								tenant.Name,
								TenantId = ua.TenantId ?? Guid.Empty,
							}
						).FirstOrDefaultAsync(cancellationToken);
						return item is not null
							? (item.Name, item.TenantId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (name, tenantId) = ((string, Guid))val;
						return isAsc
							? q.Where(x =>
								x.Tenant.Name.CompareTo(name) > 0
								|| (x.Tenant.Name == name
									&& x.TenantId > tenantId))
							: q.Where(x =>
								x.Tenant.Name.CompareTo(name) < 0
								|| (x.Tenant.Name == name
									&& x.TenantId < tenantId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.Tenant.Name)
							.ThenBy(x => x.TenantId)
						: q.OrderByDescending(x => x.Tenant.Name)
							.ThenByDescending(x => x.TenantId)
				),

				["status"] = new CursorSortFieldHandler<TenantUserCompanyQueryRow>(
					getCursorValue: async (guid) => {
						var item = await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							join u in _dbContext.User.AsNoTracking()
								on ua.UserId equals u.Id
							join tenant in _dbContext.Tenant.AsNoTracking()
								on ua.TenantId equals tenant.Id
							where ua.UserId == userId
								&& ua.TenantId == guid
								&& ua.Scope == AccountScope.Tenant
								&& ua.TenantId != null
								&& !ua.IsDeleted
								&& !u.IsDeleted
								&& !tenant.IsDeleted
							select new {
								IsUserGloballySuspended = u.Status == UserStatus.Suspended,
								IsMembershipSuspended = ua.Status == AccountStatus.Suspended,
								TenantId = ua.TenantId ?? Guid.Empty,
							}
						).FirstOrDefaultAsync(cancellationToken);
						return item is not null
							? (
								GetTenantUserStatusRank(
									item.IsUserGloballySuspended,
									item.IsMembershipSuspended
								),
								item.TenantId
							)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (statusRank, tenantId) = ((int, Guid))val;
						return isAsc
							? q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Account.Status == AccountStatus.Suspended
										? 1
										: 0) > statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Account.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.TenantId > tenantId))
							: q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Account.Status == AccountStatus.Suspended
										? 1
										: 0) < statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Account.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.TenantId < tenantId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Account.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenBy(x => x.TenantId)
						: q.OrderByDescending(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Account.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenByDescending(x => x.TenantId)
				),

				["level"] = new CursorSortFieldHandler<TenantUserCompanyQueryRow>(
					getCursorValue: async (guid) => {
						var item = await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							join tenant in _dbContext.Tenant.AsNoTracking()
								on ua.TenantId equals tenant.Id
							where ua.UserId == userId
								&& ua.TenantId == guid
								&& ua.Scope == AccountScope.Tenant
								&& ua.TenantId != null
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
								&& !tenant.IsDeleted
							select new {
								ua.Level,
								TenantId = ua.TenantId ?? Guid.Empty,
							}
						).FirstOrDefaultAsync(cancellationToken);
						return item is not null
							? (item.Level, item.TenantId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (level, tenantId) = ((AccountLevel, Guid))val;
						return isAsc
							? q.Where(x =>
								x.Account.Level > level
								|| (x.Account.Level == level
									&& x.TenantId > tenantId))
							: q.Where(x =>
								x.Account.Level < level
								|| (x.Account.Level == level
									&& x.TenantId < tenantId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.Account.Level)
							.ThenBy(x => x.TenantId)
						: q.OrderByDescending(x => x.Account.Level)
							.ThenByDescending(x => x.TenantId)
				),

				["created_at"] = new CursorSortFieldHandler<TenantUserCompanyQueryRow>(
					getCursorValue: async (guid) => {
						var item = await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							join tenant in _dbContext.Tenant.AsNoTracking()
								on ua.TenantId equals tenant.Id
							where ua.UserId == userId
								&& ua.TenantId == guid
								&& ua.Scope == AccountScope.Tenant
								&& ua.TenantId != null
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
								&& !tenant.IsDeleted
							select new {
								ua.CreatedAt,
								TenantId = ua.TenantId ?? Guid.Empty,
							}
						).FirstOrDefaultAsync(cancellationToken);
						return item is not null
							? (item.CreatedAt, item.TenantId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (createdAt, tenantId) = ((DateTime, Guid))val;
						return isAsc
							? q.Where(x =>
								x.Account.CreatedAt > createdAt
								|| (x.Account.CreatedAt == createdAt
									&& x.TenantId > tenantId))
							: q.Where(x =>
								x.Account.CreatedAt < createdAt
								|| (x.Account.CreatedAt == createdAt
									&& x.TenantId < tenantId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.Account.CreatedAt)
							.ThenBy(x => x.TenantId)
						: q.OrderByDescending(x => x.Account.CreatedAt)
							.ThenByDescending(x => x.TenantId)
				),
			};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<TenantUserCompanyQueryRow>? handler
			)
		) {
			return new FindTenantUserCompaniesResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount.AsNoTracking()
			join u in _dbContext.User.AsNoTracking()
				on ua.UserId equals u.Id
			join tenant in _dbContext.Tenant.AsNoTracking()
				on ua.TenantId equals tenant.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& ua.TenantId != null
				&& !ua.IsDeleted
				&& !u.IsDeleted
				&& !tenant.IsDeleted
			select new TenantUserCompanyQueryRow {
				Account = ua,
				User = u,
				Tenant = tenant,
				TenantId = ua.TenantId ?? Guid.Empty,
			};

		// Route-resource existence is independent from cursor validity. Missing
		// tenant users must remain a 404; bad cursors for existing identities are
		// reported as 400 below.
		var hasTenantUserIdentity = await (
			from ua in _dbContext.UserAccount.IgnoreQueryFilters()
			join u in _dbContext.User.AsNoTracking()
				on ua.UserId equals u.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !u.IsDeleted
			select ua
		).AnyAsync(cancellationToken);

		if (!hasTenantUserIdentity) {
			return new FindTenantUserCompaniesResult.NotFound();
		}

		IQueryable<TenantUserCompanyQueryRow> query = baseQuery;
		var search = args.Filters?.Search?.Trim();
		if (!string.IsNullOrEmpty(search)) {
			var searchPattern = $"%{search}%";
			query =
				from row in query
				where EF.Functions.ILike(row.Tenant.Name, searchPattern)
					|| EF.Functions.ILike(row.Tenant.Code, searchPattern)
				select row;
		}

		var hasAnyCompany =
			await baseQuery.AnyAsync(cancellationToken);
		if (!hasAnyCompany) {
			if (args.Cursor != Guid.Empty) {
				return new FindTenantUserCompaniesResult
					.CursorNotFound(args.Cursor.ToString());
			}

			return new FindTenantUserCompaniesResult.Success(
				new CursorPaginatedResult<TenantUserCompanyData> {
					Data = [],
					NextCursor = null,
				}
			);
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue =
				await handler.GetCursorValue(args.Cursor);

			if (cursorValue is null) {
				return new FindTenantUserCompaniesResult
					.CursorNotFound(args.Cursor.ToString());
			}

			query = handler.ApplyFilter(
				query,
				cursorValue,
				effectiveSortOrder == SortOrder.Asc
			);
		}

		var orderedQuery = handler.ApplyOrdering(
			query,
			effectiveSortOrder == SortOrder.Asc
		);

		var results = await orderedQuery
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last()
				.Tenant.GetRequiredId().ToString();
		}

		return new FindTenantUserCompaniesResult.Success(
			new CursorPaginatedResult<TenantUserCompanyData> {
				Data = results.Select(row => new TenantUserCompanyData {
					Account = row.Account,
					Tenant = row.Tenant,
					AccountLevel = row.Account.Level,
					UserStatus = row.User.Status,
				}).ToList(),
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<TenantUserCompanyBulkActionResult>
	AssignTenantUserCompaniesForStaffAsync(
		AssignTenantUserCompaniesArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantIds = args.TenantIds.Distinct().ToList();
		var failedItems = new List<TenantUserCompanyBulkActionFailedItem>();
		var succeededCount = 0;

		var identityError = await GetTenantUserIdentityAssignmentErrorAsync(
			args.UserId,
			cancellationToken
		);

		if (identityError is not null) {
			return BuildTenantUserCompanyBulkFailure(
				tenantIds,
				identityError
			);
		}

		foreach (var tenantId in tenantIds) {
			var tenantExists = await (
				from tenant in _dbContext.Tenant.AsNoTracking()
				where tenant.Id == tenantId
					&& !tenant.IsDeleted
				select tenant.Id
			).AnyAsync(cancellationToken);

			if (!tenantExists) {
				failedItems.Add(
					new TenantUserCompanyBulkActionFailedItem(
						tenantId,
						"Tenant not found"
					)
				);
				continue;
			}

			var existingAccount = await (
				from account in _dbContext.UserAccount.IgnoreQueryFilters()
				where account.UserId == args.UserId
					&& account.TenantId == tenantId
					&& account.Scope == AccountScope.Tenant
					&& account.ProjectId == null
				select account
			).FirstOrDefaultAsync(cancellationToken);

			if (existingAccount is not null && !existingAccount.IsDeleted) {
				failedItems.Add(
					new TenantUserCompanyBulkActionFailedItem(
						tenantId,
						"Already assigned"
					)
				);
				continue;
			}

			await using var transaction =
				await _dbContext.Database.BeginTransactionAsync(
					cancellationToken
				);

			var tenantAccount = existingAccount;
			var now = DateTime.UtcNow;
			var isRestoringRemovedAccount = tenantAccount is not null;
			try {
				if (tenantAccount is null) {
					tenantAccount = UserAccount.CreateTenantAccount(
						args.UserId,
						tenantId,
						args.Level
					);
					tenantAccount.ValidateAccountType();
					await _dbContext.UserAccount.AddAsync(
						tenantAccount,
						cancellationToken
					);
				} else {
					tenantAccount.IsDeleted = false;
					tenantAccount.DeletedAt = null;
					tenantAccount.Status = AccountStatus.Active;
					tenantAccount.Level = args.Level;
					tenantAccount.UpdatedAt = now;
					tenantAccount.ValidateAccountType();
				}

				await _dbContext.SaveChangesAsync(cancellationToken);
				if (isRestoringRemovedAccount) {
					// Removed memberships may still have old profile links. Purge
					// them before adding the tenant default profile so reassignment
					// cannot resurrect stale permissions.
					await RemoveUserAccountProfileLinksAsync(
						tenantAccount.GetRequiredId(),
						cancellationToken
					);
					await _dbContext.SaveChangesAsync(cancellationToken);
				}

				await AssignDefaultProfileToTenantAccountAsync(
					tenantAccount,
					tenantId,
					cancellationToken
				);
				await transaction.CommitAsync(cancellationToken);
			} catch {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}

			succeededCount++;
		}

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<TenantUserCompanyBulkActionResult>
	BulkRemoveTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	) {
		var failedItems = new List<TenantUserCompanyBulkActionFailedItem>();
		var succeededCount = 0;

		foreach (var tenantId in args.TenantIds.Distinct()) {
			var result = await RemoveUserFromTenantAsync(
				tenantId,
				args.UserId,
				cancellationToken
			);

			if (result is RemoveUserFromTenantResult.Success) {
				succeededCount++;
				continue;
			}

			failedItems.Add(
				new TenantUserCompanyBulkActionFailedItem(
					tenantId,
					GetRemoveTenantUserCompanyError(result)
				)
			);
		}

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<TenantUserCompanyBulkActionResult>
	BulkSuspendTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	) {
		var failedItems = new List<TenantUserCompanyBulkActionFailedItem>();
		var succeededCount = 0;

		foreach (var tenantId in args.TenantIds.Distinct()) {
			var result = await SuspendTenantUserAsync(
				tenantId,
				args.UserId,
				cancellationToken
			);

			if (result is SuspendTenantUserResult.Success) {
				succeededCount++;
				continue;
			}

			failedItems.Add(
				new TenantUserCompanyBulkActionFailedItem(
					tenantId,
					GetSuspendTenantUserCompanyError(result)
				)
			);
		}

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<TenantUserCompanyBulkActionResult>
	BulkReactivateTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	) {
		var failedItems = new List<TenantUserCompanyBulkActionFailedItem>();
		var succeededCount = 0;

		foreach (var tenantId in args.TenantIds.Distinct()) {
			var result = await ReactivateTenantUserAsync(
				tenantId,
				args.UserId,
				cancellationToken
			);

			if (result is ReactivateTenantUserResult.Success) {
				succeededCount++;
				continue;
			}

			failedItems.Add(
				new TenantUserCompanyBulkActionFailedItem(
					tenantId,
					GetReactivateTenantUserCompanyError(result)
				)
			);
		}

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	private async Task<string?> GetTenantUserIdentityAssignmentErrorAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var userExists = await (
			from user in _dbContext.User.AsNoTracking()
			where user.Id == userId
				&& !user.IsDeleted
			select user.Id
		).AnyAsync(cancellationToken);

		if (!userExists) {
			return "Tenant user not found";
		}

		var hasTenantIdentity = await (
			from account in _dbContext.UserAccount.IgnoreQueryFilters()
			where account.UserId == userId
				&& account.Scope == AccountScope.Tenant
			select account.Id
		).AnyAsync(cancellationToken);

		if (!hasTenantIdentity) {
			return "Tenant user not found";
		}

		var hasStaffAccount = await (
			from account in _dbContext.UserAccount.AsNoTracking()
			where account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account.Id
		).AnyAsync(cancellationToken);

		if (hasStaffAccount) {
			return "User has a staff account";
		}

		return null;
	}

	private static TenantUserCompanyBulkActionResult
	BuildTenantUserCompanyBulkFailure(
		IReadOnlyCollection<Guid> tenantIds,
		string error
	) {
		var failedItems = tenantIds
			.Select(tenantId => new TenantUserCompanyBulkActionFailedItem(
				tenantId,
				error
			))
			.ToList();

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: 0,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	private async Task AssignDefaultProfileToTenantAccountAsync(
		UserAccount account,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		if (account.Level == AccountLevel.Admin) {
			return;
		}

		var accountId = account.GetRequiredId();
		var defaultProfile = await GetOrCreateDefaultTenantProfileAsync(
			tenantId,
			cancellationToken
		);
		var profileId = defaultProfile.GetRequiredId();

		var linkExists = await (
			from link in _dbContext.UserAccountProfile
			where link.UserAccountId == accountId
				&& link.ProfileId == profileId
			select link
		).AnyAsync(cancellationToken);

		if (linkExists) {
			return;
		}

		await _dbContext.UserAccountProfile.AddAsync(
			new UserAccountProfile {
				UserAccountId = accountId,
				ProfileId = profileId,
			},
			cancellationToken
		);
		await _dbContext.SaveChangesAsync(cancellationToken);
	}

	private async Task<Profile> GetOrCreateDefaultTenantProfileAsync(
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		var defaultProfile = await (
			from profile in _dbContext.Profile
			where profile.Scope == ProfileScope.Tenant
				&& profile.TenantId == tenantId
				&& profile.IsDefault
				&& !profile.IsDeleted
			select profile
		).FirstOrDefaultAsync(cancellationToken);

		if (defaultProfile is not null) {
			return defaultProfile;
		}

		defaultProfile = Profile.CreateTenantProfile(
			tenantId,
			name: "Default profile",
			description: "Default profile with no permissions",
			isDefault: true
		);

		var savedProfile = await _dbContext.Profile.AddAsync(
			defaultProfile,
			cancellationToken
		);
		await _dbContext.SaveChangesAsync(cancellationToken);

		return savedProfile.Entity;
	}

	private static string GetRemoveTenantUserCompanyError(
		RemoveUserFromTenantResult result
	) {
		return result switch {
			RemoveUserFromTenantResult.NotFound => "User not found in tenant",
			RemoveUserFromTenantResult.CannotRemoveLastAdmin =>
				"Cannot remove the last admin from the tenant",
			_ => "Failed to remove user from tenant",
		};
	}

	private static string GetSuspendTenantUserCompanyError(
		SuspendTenantUserResult result
	) {
		return result switch {
			SuspendTenantUserResult.NotFound => "User not found in tenant",
			SuspendTenantUserResult.AlreadySuspended => "Already suspended",
			SuspendTenantUserResult.CannotSuspendLastAdmin =>
				"Cannot suspend the last admin from the tenant",
			_ => "Failed to suspend user in tenant",
		};
	}

	private static string GetReactivateTenantUserCompanyError(
		ReactivateTenantUserResult result
	) {
		return result switch {
			ReactivateTenantUserResult.NotFound => "User not found in tenant",
			ReactivateTenantUserResult.NotSuspended => "User is not suspended",
			_ => "Failed to reactivate user in tenant",
		};
	}

	public async Task<UpdateUserByIdResult> UpdateStaffUserByIdAsync(
		Guid userId,
		UpdateUserDocument document,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			UserStatus? parsedStatus = null;
			if (document.Status.IsPresent && document.Status.Value is not null) {
				parsedStatus = User.ParseStatus(document.Status.Value);
			}

			var updatedCount = await _dbContext.User
				.Where(u => u.Id == userId)
				.ExecuteUpdateAsync(setters => setters
					.SetProperty(u => u.Email, u => document.Email ?? u.Email)
					.SetProperty(u => u.LastName, u => document.LastName.IsPresent ? document.LastName.Value : u.LastName)
					.SetProperty(u => u.FirstName, u => document.FirstName.IsPresent ? document.FirstName.Value : u.FirstName)
					.SetProperty(u => u.AvatarUrl, u => document.AvatarUrl.IsPresent ? document.AvatarUrl.Value : u.AvatarUrl)
					.SetProperty(u => u.Status,
						u => parsedStatus.HasValue
							? parsedStatus.Value
							: u.Status
					)
					.SetProperty(u => u.UpdatedAt, DateTime.UtcNow), cancellationToken);

			if (updatedCount == 0) {
				await transaction.RollbackAsync(cancellationToken);
				return new UpdateUserByIdResult.UserNotFound();
			}

			if (document.AccountLevel is not null) {
				var accountLevel = UserAccount.ParseLevel(document.AccountLevel);

				if (accountLevel is null) {
					await transaction.RollbackAsync(cancellationToken);
					throw new ArgumentException($"Invalid account level: '{document.AccountLevel}'");
				}

				var staffAccountCount = await _dbContext.UserAccount
					.CountAsync(ua => ua.UserId == userId && ua.Scope == AccountScope.Staff, cancellationToken);

				if (staffAccountCount == 0) {
					await transaction.RollbackAsync(cancellationToken);
					return new UpdateUserByIdResult.UserAccountNotFound();
				}

				if (staffAccountCount > 1) {
					await transaction.RollbackAsync(cancellationToken);
					throw new InvalidOperationException(
						$"Data integrity violation: User {userId} has {staffAccountCount} staff accounts"
					);
				}

				await _dbContext.UserAccount
					.Where(ua => ua.UserId == userId && ua.Scope == AccountScope.Staff)
					.ExecuteUpdateAsync(setters => setters
						.SetProperty(ua => ua.Level, accountLevel)
						.SetProperty(ua => ua.UpdatedAt, DateTime.UtcNow), cancellationToken);
			}

			await transaction.CommitAsync(cancellationToken);

			// Re-fetch updated user data to return
			var updatedUser = await (
				from ua in _dbContext.UserAccount
					.AsNoTracking()
				where ua.UserId == userId
					&& ua.Scope == AccountScope.Staff
					&& !ua.IsDeleted
				select new StaffUserData {
					User = ua.User,
					AccountLevel = ua.Level
				}
			).FirstOrDefaultAsync(cancellationToken);

			if (updatedUser is null) {
				throw new InvalidOperationException(
					"User not found after successful "
					+ "update. This indicates a data "
					+ "integrity issue."
				);
			}

			return new UpdateUserByIdResult.Success(
				updatedUser
			);
		} catch (Exception exception) {
			await transaction.RollbackAsync(cancellationToken);
			if (_logger.IsEnabled(LogLevel.Error)) {
				_logger.LogError(exception, "Failed to update staff member {UserId}", userId);
			}
			return new UpdateUserByIdResult.UpdateFailed(
				exception.Message
			);
		}
	}

	public async Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Find the user account for this tenant
		var userAccount = await (
			from ua in _dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
			select ua
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new RemoveUserFromTenantResult.NotFound();
		}

		// Wrap admin check and soft delete in a transaction to prevent race conditions
		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(
				IsolationLevel.Serializable,
				cancellationToken
			);

		try {
			// Check if this user is the last admin
			if (userAccount.Level == AccountLevel.Admin) {
				var isRemovingActiveAdmin = await IsActiveTenantAdminAsync(
					tenantId,
					userId,
					cancellationToken
				);
				var activeAdminCount = isRemovingActiveAdmin
					? await CountActiveTenantAdminsAsync(
						tenantId,
						cancellationToken
					)
					: 0;

				if (isRemovingActiveAdmin && activeAdminCount <= 1) {
					return new RemoveUserFromTenantResult.CannotRemoveLastAdmin();
				}
			}

			// Soft delete the user account
			userAccount.IsDeleted = true;
			userAccount.DeletedAt = DateTime.UtcNow;
			await RemoveUserAccountProfileLinksAsync(
				userAccount.GetRequiredId(),
				cancellationToken
			);
			await _dbContext.SaveChangesAsync(cancellationToken);

			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		return new RemoveUserFromTenantResult.Success();
	}

	public async Task<UpdateTenantUserResult> UpdateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		UpdateTenantUserDocument document,
		CancellationToken cancellationToken = default
	) {
		// Find the user and their account for this tenant
		var userAccount = await (
			from ua in _dbContext.UserAccount
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new UpdateTenantUserResult.NotFound();
		}

		var user = userAccount.User;
		var account = userAccount.Account;

		// Determine new level if provided
		AccountLevel? newLevel = null;
		if (document.Level is not null) {
			newLevel = UserAccount.ParseLevel(document.Level);
			if (newLevel is null) {
				return new UpdateTenantUserResult.NotFound();
			}
		}

		// Determine if we need a transaction for the last-admin invariant check
		var needsAdminInvariantTransaction =
			document.Level is not null
			&& account.Level == AccountLevel.Admin
			&& newLevel != AccountLevel.Admin;

		await using var transaction =
			needsAdminInvariantTransaction
				? await _dbContext.Database.BeginTransactionAsync(
					IsolationLevel.Serializable,
					cancellationToken
				)
				: null;

		try {
			// Check last-admin invariant if demoting from admin
			if (needsAdminInvariantTransaction) {
				var isDemotingActiveAdmin = await IsActiveTenantAdminAsync(
					tenantId,
					userId,
					cancellationToken
				);
				var hasAnotherActiveAdmin = isDemotingActiveAdmin
					&& await TenantHasAnotherActiveAdminAsync(
						tenantId,
						userId,
						cancellationToken
					);

				if (isDemotingActiveAdmin && !hasAnotherActiveAdmin) {
					return new UpdateTenantUserResult.CannotDemoteLastAdmin();
				}
			}

			// Apply all changes: account level + user profile fields
			if (newLevel is not null) {
				account.Level = newLevel.Value;
			}
			if (document.FirstName.IsPresent) {
				user.FirstName = document.FirstName.Value;
			}
			if (document.LastName.IsPresent) {
				user.LastName = document.LastName.Value;
			}
			if (document.AvatarUrl.IsPresent) {
				user.AvatarUrl = document.AvatarUrl.Value;
			}

			account.UpdatedAt = DateTime.UtcNow;
			user.UpdatedAt = DateTime.UtcNow;

			await _dbContext.SaveChangesAsync(cancellationToken);

			if (transaction is not null) {
				await transaction.CommitAsync(cancellationToken);
			}
		} catch {
			if (transaction is not null) {
				await transaction.RollbackAsync(cancellationToken);
			}
			throw;
		}

		return new UpdateTenantUserResult.Success(
			new TenantUserData {
				User = user,
				Account = account,
				AccountLevel = account.Level
			}
		);
	}

	public async Task<UpdateTenantUserIdentityResult> UpdateTenantUserIdentityForStaffAsync(
		Guid userId,
		UpdateTenantUserIdentityDocument document,
		CancellationToken cancellationToken = default
	) {
		var tenantUserQuery =
			from u in _dbContext.User
			where u.Id == userId
				&& !u.IsDeleted
			where (
				from ua in _dbContext.UserAccount
				where ua.UserId == userId
					&& ua.Scope == AccountScope.Tenant
				select ua
			).Any()
			select u;

		var user = await tenantUserQuery
			.FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			return new UpdateTenantUserIdentityResult.NotFound();
		}

		if (document.FirstName.IsPresent) {
			user.FirstName = document.FirstName.Value;
		}

		if (document.LastName.IsPresent) {
			user.LastName = document.LastName.Value;
		}

		if (document.AvatarUrl.IsPresent) {
			user.AvatarUrl = document.AvatarUrl.Value;
		}

		user.UpdatedAt = DateTime.UtcNow;
		await _dbContext.SaveChangesAsync(cancellationToken);

		var userData = await GetTenantUserDetailsForStaffAsync(
			userId,
			cancellationToken
		);

		if (userData is null) {
			throw new InvalidOperationException(
				"Tenant user not found after successful identity update. "
				+ "This indicates a data integrity issue."
			);
		}

		return new UpdateTenantUserIdentityResult.Success(userData);
	}

	public async Task<UpdateTenantUserEmailResult> UpdateTenantUserEmailForStaffAsync(
		Guid userId,
		string email,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmail = email.Trim().ToLowerInvariant();

		var user = await BuildLiveTenantUserIdentityMutationQuery(userId)
			.FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			return new UpdateTenantUserEmailResult.NotFound();
		}

		if (!string.Equals(user.Email, normalizedEmail, StringComparison.Ordinal)) {
			var existing = await GetUserByEmailAsync(
				normalizedEmail,
				cancellationToken
			);
			if (existing is not null && existing.GetRequiredId() != userId) {
				return new UpdateTenantUserEmailResult.EmailAlreadyInUse();
			}

			user.Email = normalizedEmail;
			user.UpdatedAt = DateTime.UtcNow;
			await _dbContext.SaveChangesAsync(cancellationToken);
		}

		var userData = await GetTenantUserDetailsForStaffAsync(
			userId,
			cancellationToken
		);

		if (userData is null) {
			throw new InvalidOperationException(
				"Tenant user not found after successful email update. "
				+ "This indicates a data integrity issue."
			);
		}

		return new UpdateTenantUserEmailResult.Success(userData);
	}

	public async Task<SuspendTenantUserIdentityResult>
	SuspendTenantUserIdentityForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		var userData = await GetTenantUserDetailsForStaffAsync(
			userId,
			cancellationToken
		);

		if (userData is null) {
			return new SuspendTenantUserIdentityResult.NotFound();
		}

		if (userData.User.IsSuspended()) {
			return new SuspendTenantUserIdentityResult.AlreadySuspended();
		}

		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(
				IsolationLevel.Serializable,
				cancellationToken
			);

		try {
			// Global suspension disables this user in every tenant. The last-admin
			// guard must therefore scan all active admin memberships atomically.
			var hasTenantWithoutAnotherActiveAdmin = await (
				from ua in _dbContext.UserAccount
				join u in _dbContext.User on ua.UserId equals u.Id
				where ua.UserId == userId
					&& ua.Scope == AccountScope.Tenant
					&& ua.TenantId != null
					&& ua.Level == AccountLevel.Admin
					&& ua.Status != AccountStatus.Suspended
					&& !ua.IsDeleted
					&& !u.IsDeleted
					&& u.Status != UserStatus.Suspended
				where !(
					from otherUa in _dbContext.UserAccount
					join otherUser in _dbContext.User
						on otherUa.UserId equals otherUser.Id
					where otherUa.TenantId == ua.TenantId
						&& otherUa.UserId != userId
						&& otherUa.Scope == AccountScope.Tenant
						&& otherUa.Level == AccountLevel.Admin
						&& otherUa.Status != AccountStatus.Suspended
						&& !otherUa.IsDeleted
						&& !otherUser.IsDeleted
						&& otherUser.Status != UserStatus.Suspended
					select otherUa
				).Any()
				select ua
			).AnyAsync(cancellationToken);

			if (hasTenantWithoutAnotherActiveAdmin) {
				await transaction.RollbackAsync(cancellationToken);
				return new SuspendTenantUserIdentityResult
					.CannotSuspendLastAdmin();
			}

			var now = DateTime.UtcNow;
			var updatedUserCount = await BuildLiveTenantUserIdentityMutationQuery(
				userId
			)
				.Where(x => x.Status != UserStatus.Suspended)
				.ExecuteUpdateAsync(
					setters => setters
						.SetProperty(x => x.Status, UserStatus.Suspended)
						.SetProperty(x => x.UpdatedAt, now),
					cancellationToken
				);

			if (updatedUserCount == 0) {
				await transaction.RollbackAsync(cancellationToken);
				return await ResolveSuspendTenantUserIdentityAfterNoRowsAsync(
					userId,
					cancellationToken
				);
			}

			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		var updatedUserData = await GetTenantUserDetailsForStaffAsync(
			userId,
			cancellationToken
		);

		if (updatedUserData is null) {
			throw new InvalidOperationException(
				"Tenant user not found after successful global suspend. "
				+ "This indicates a data integrity issue."
			);
		}

		return new SuspendTenantUserIdentityResult.Success(updatedUserData);
	}

	public async Task<ReactivateTenantUserIdentityResult>
	ReactivateTenantUserIdentityForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		var userData = await GetTenantUserDetailsForStaffAsync(
			userId,
			cancellationToken
		);

		if (userData is null) {
			return new ReactivateTenantUserIdentityResult.NotFound();
		}

		if (!userData.User.IsSuspended()) {
			return new ReactivateTenantUserIdentityResult.NotSuspended();
		}

		var now = DateTime.UtcNow;
		var updatedUserCount = await BuildLiveTenantUserIdentityMutationQuery(userId)
			.Where(x => x.Status == UserStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, UserStatus.Active)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (updatedUserCount == 0) {
			return await ResolveReactivateTenantUserIdentityAfterNoRowsAsync(
				userId,
				cancellationToken
			);
		}

		var updatedUserData = await GetTenantUserDetailsForStaffAsync(
			userId,
			cancellationToken
		);

		if (updatedUserData is null) {
			throw new InvalidOperationException(
				"Tenant user not found after successful global reactivation. "
				+ "This indicates a data integrity issue."
			);
		}

		return new ReactivateTenantUserIdentityResult.Success(updatedUserData);
	}

	private IQueryable<User> BuildLiveTenantUserIdentityMutationQuery(Guid userId) {
		return _dbContext.User.Where(u =>
			u.Id == userId
			&& !u.IsDeleted
			&& _dbContext.UserAccount.Any(ua =>
				ua.UserId == u.Id
				&& ua.Scope == AccountScope.Tenant
			)
		);
	}

	private IQueryable<UserAccount> BuildActiveTenantAdminAccountsQuery(
		Guid tenantId
	) {
		// A globally suspended User cannot satisfy tenant last-admin protection,
		// even when the tenant membership row itself is still active.
		return
			from ua in _dbContext.UserAccount
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.Level == AccountLevel.Admin
				&& ua.Status != AccountStatus.Suspended
				&& !ua.IsDeleted
				&& !u.IsDeleted
				&& u.Status != UserStatus.Suspended
			select ua;
	}

	private async Task<bool> IsActiveTenantAdminAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in BuildActiveTenantAdminAccountsQuery(tenantId)
			where ua.UserId == userId
			select ua
		).AnyAsync(cancellationToken);
	}

	private async Task<int> CountActiveTenantAdminsAsync(
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		return await BuildActiveTenantAdminAccountsQuery(tenantId)
			.CountAsync(cancellationToken);
	}

	private async Task<bool> TenantHasAnotherActiveAdminAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in BuildActiveTenantAdminAccountsQuery(tenantId)
			where ua.UserId != userId
			select ua
		).AnyAsync(cancellationToken);
	}

	private async Task RemoveUserAccountProfileLinksAsync(
		Guid userAccountId,
		CancellationToken cancellationToken
	) {
		// UserAccountProfile is current membership state. Hard-delete links when
		// membership is removed or restored so stale permissions cannot return.
		var links = await (
			from link in _dbContext.UserAccountProfile
			where link.UserAccountId == userAccountId
			select link
		).ToListAsync(cancellationToken);

		_dbContext.UserAccountProfile.RemoveRange(links);
	}

	private async Task<SuspendTenantUserIdentityResult>
	ResolveSuspendTenantUserIdentityAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await GetTenantUserDetailsForStaffAsync(
			userId,
			cancellationToken
		);
		if (currentUserData is null) {
			return new SuspendTenantUserIdentityResult.NotFound();
		}

		if (currentUserData.User.IsSuspended()) {
			return new SuspendTenantUserIdentityResult.AlreadySuspended();
		}

		throw new InvalidOperationException(
			"Tenant user still matched global suspend preconditions after a 0-row update."
		);
	}

	private async Task<ReactivateTenantUserIdentityResult>
	ResolveReactivateTenantUserIdentityAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await GetTenantUserDetailsForStaffAsync(
			userId,
			cancellationToken
		);
		if (currentUserData is null) {
			return new ReactivateTenantUserIdentityResult.NotFound();
		}

		if (!currentUserData.User.IsSuspended()) {
			return new ReactivateTenantUserIdentityResult.NotSuspended();
		}

		throw new InvalidOperationException(
			"Tenant user still matched global reactivate preconditions after a 0-row update."
		);
	}

	public async Task<SuspendTenantUserResult> SuspendTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Find the user account for this tenant
		var userAccount = await (
			from ua in _dbContext.UserAccount
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new SuspendTenantUserResult.NotFound();
		}

		var account = userAccount.Account;

		if (account.IsSuspended()) {
			return new SuspendTenantUserResult.AlreadySuspended();
		}

		// Check last-admin invariant: cannot suspend the last active admin
		if (account.Level == AccountLevel.Admin) {
			var isSuspendingActiveAdmin = await IsActiveTenantAdminAsync(
				tenantId,
				userId,
				cancellationToken
			);
			var activeAdminCount = isSuspendingActiveAdmin
				? await CountActiveTenantAdminsAsync(
					tenantId,
					cancellationToken
				)
				: 0;

			if (isSuspendingActiveAdmin && activeAdminCount <= 1) {
				return new SuspendTenantUserResult.CannotSuspendLastAdmin();
			}
		}

		// Use atomic update for race-condition safety
		var rowsAffected = await _dbContext.UserAccount
			.Where(ua =>
				ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
			)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(ua => ua.Status, AccountStatus.Suspended)
				.SetProperty(ua => ua.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			return new SuspendTenantUserResult.AlreadySuspended();
		}

		// Re-fetch to return current state
		var updatedAccount = await (
			from ua in _dbContext.UserAccount
				.AsNoTracking()
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (updatedAccount is null) {
			throw new InvalidOperationException(
				"User account not found after successful suspend. "
				+ "This indicates a data integrity issue."
			);
		}

		return new SuspendTenantUserResult.Success(
			new TenantUserData {
				User = updatedAccount.User,
				Account = updatedAccount.Account,
				AccountLevel = updatedAccount.Account.Level
			}
		);
	}

	public async Task<ReactivateTenantUserResult> ReactivateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Find the user account for this tenant
		var userAccount = await (
			from ua in _dbContext.UserAccount
				.AsNoTracking()
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new ReactivateTenantUserResult.NotFound();
		}

		var account = userAccount.Account;

		if (!account.IsSuspended()) {
			return new ReactivateTenantUserResult.NotSuspended();
		}

		// Use atomic update for race-condition safety
		var rowsAffected = await _dbContext.UserAccount
			.Where(ua =>
				ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& ua.Status == AccountStatus.Suspended
			)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(ua => ua.Status, AccountStatus.Active)
				.SetProperty(ua => ua.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			return new ReactivateTenantUserResult.NotSuspended();
		}

		// Re-fetch to return current state
		var updatedAccount = await (
			from ua in _dbContext.UserAccount
				.AsNoTracking()
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (updatedAccount is null) {
			throw new InvalidOperationException(
				"User account not found after successful reactivate. "
				+ "This indicates a data integrity issue."
			);
		}

		return new ReactivateTenantUserResult.Success(
			new TenantUserData {
				User = updatedAccount.User,
				Account = updatedAccount.Account,
				AccountLevel = updatedAccount.Account.Level
			}
		);
	}
}
