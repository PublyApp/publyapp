using System.Data;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Users.Services;

public abstract record CreateUserResult {
	public sealed record Success(User User) : CreateUserResult;
	public sealed record UserAlreadyExists(User User) : CreateUserResult;
}


public class StaffUserData {
	public required User User { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

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
		CursorPaginatedResult<StaffUserData> Data
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
	IReadOnlySet<UserStatus>? Status
);

public record FindTenantUsersAsStaffArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindTenantUsersAsStaffFilters? Filters
);

public abstract record RemoveUserFromTenantResult {
	public sealed record Success() : RemoveUserFromTenantResult;
	public sealed record NotFound() : RemoveUserFromTenantResult;
	public sealed record CannotRemoveLastAdmin() : RemoveUserFromTenantResult;
}

public class TenantUserData {
	public required User User { get; set; }
	public required UserAccount Account { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

public class UpdateTenantUserDocument {
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
	public string? Level { get; set; }
}

public abstract record UpdateTenantUserResult {
	public sealed record Success(
		TenantUserData UserData
	) : UpdateTenantUserResult;
	public sealed record NotFound() : UpdateTenantUserResult;
	public sealed record CannotDemoteLastAdmin() : UpdateTenantUserResult;
}

public interface IUserService {
	Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailVerificationTokenAsync(string token, CancellationToken cancellationToken = default);
	Task<User?> GetUserByPasswordResetTokenAsync(string token, CancellationToken cancellationToken = default);
	Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByIdAsync(Guid? id, CancellationToken cancellationToken = default);
	Task<StaffUserData?> GetStaffUserUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<int> CountStaffUsersAsync(CancellationToken cancellationToken = default);
	Task<List<StaffUserData>> FindStaffUsersAsync(
		int? page,
		int? limit,
		string? sortId,
		SortOrder? sortOrder,
		CancellationToken cancellationToken = default
	);
	Task<UpdateUserByIdResult> UpdateStaffUserByIdAsync(Guid userId, UpdateUserDocument document, CancellationToken cancellationToken = default);
	Task<FindTenantUsersResult> FindTenantUsersAsync(
		Guid tenantId,
		FindTenantUsersAsStaffArgs args,
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
}

public class UserService : IUserService {
	private readonly MainApiDbContext _dbContext;
	private readonly ILogger<UserService> _logger;

	public UserService(MainApiDbContext dbContext, ILogger<UserService> logger) {
		_dbContext = dbContext;
		_logger = logger;
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
			// * check these fields directly in the login handler
			// * for customized error responses
			// && !u.IsSuspended
			// && u.IsVerified
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
		var query =
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.IsSuspended
				&& !ua.User.IsDeleted
				&& !ua.User.IsSuspended
			select new StaffUserData { User = ua.User, AccountLevel = ua.Level };

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<int> CountStaffUsersAsync(CancellationToken cancellationToken = default) {
		var query =
			from ua in _dbContext.UserAccount
			where ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.IsSuspended
				&& !ua.User.IsDeleted
				&& !ua.User.IsSuspended
			select ua.User;
		return await query.CountAsync(cancellationToken);
	}

	public async Task<List<StaffUserData>> FindStaffUsersAsync(
		int? page = 1,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	) {
		var effectivePage = page ?? 1;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
		var effectiveLimit = limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;

		var query =
			from ua in _dbContext.UserAccount
			where ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.IsSuspended
				&& !ua.User.IsDeleted
				&& !ua.User.IsSuspended
			select new { User = ua.User, Level = ua.Level };

		if (sortId is not null) {
			var isAsc = effectiveSortOrder == SortOrder.Asc;
			if (string.Equals(sortId, "created_at", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(x => x.User.CreatedAt) : query.OrderByDescending(x => x.User.CreatedAt);
			}
			if (string.Equals(sortId, "updated_at", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(x => x.User.UpdatedAt) : query.OrderByDescending(x => x.User.UpdatedAt);
			}
			if (string.Equals(sortId, "email", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(x => x.User.Email) : query.OrderByDescending(x => x.User.Email);
			}
			if (string.Equals(sortId, "first_name", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(x => x.User.FirstName) : query.OrderByDescending(x => x.User.FirstName);
			}
			if (string.Equals(sortId, "last_name", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(x => x.User.LastName) : query.OrderByDescending(x => x.User.LastName);
			}
			if (string.Equals(sortId, "status", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(x => x.User.Status) : query.OrderByDescending(x => x.User.Status);
			}
			if (string.Equals(sortId, "level", StringComparison.OrdinalIgnoreCase)) {
				query = isAsc ? query.OrderBy(x => x.Level) : query.OrderByDescending(x => x.Level);
			}
		}

		var results = await query
			.Skip((effectivePage - 1) * effectiveLimit).Take(effectiveLimit)
			.ToListAsync(cancellationToken);

		return results.Select(x => new StaffUserData {
			User = x.User,
			AccountLevel = x.Level
		}).ToList();
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
			new Dictionary<string, SortFieldHandler>(
				StringComparer.OrdinalIgnoreCase
			) {
				["id"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var ua = await (
							from x in _dbContext.UserAccount
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

				["email"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount
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

				["status"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.User.Status,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.Status, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (status, id) =
							((UserStatus, Guid))val;
						return isAsc
							? q.Where(x =>
								x.User.Status > status
								|| (x.User.Status
										== status
									&& x.UserId > id))
							: q.Where(x =>
								x.User.Status < status
								|| (x.User.Status
										== status
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.User.Status
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.Status
						).ThenByDescending(
							x => x.UserId
						)
				),

				["level"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount
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

				["created_at"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount
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
				out SortFieldHandler? handler
			)
		) {
			return new FindTenantUsersResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.IsSuspended
				&& !ua.User.IsDeleted
				&& !ua.User.IsSuspended
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
			query = query.Where(ua =>
				statuses.Contains(ua.User.Status)
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
			.Select(ua => new StaffUserData {
				User = ua.User,
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
			new CursorPaginatedResult<StaffUserData> {
				Data = results,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<UpdateUserByIdResult> UpdateStaffUserByIdAsync(
		Guid userId,
		UpdateUserDocument document,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			var updatedCount = await _dbContext.User
				.Where(u => u.Id == userId)
				.ExecuteUpdateAsync(setters => setters
					.SetProperty(u => u.Email, u => document.Email ?? u.Email)
					.SetProperty(u => u.LastName, u => document.LastName.IsPresent ? document.LastName.Value : u.LastName)
					.SetProperty(u => u.FirstName, u => document.FirstName.IsPresent ? document.FirstName.Value : u.FirstName)
					.SetProperty(u => u.AvatarUrl, u => document.AvatarUrl.IsPresent ? document.AvatarUrl.Value : u.AvatarUrl)
					.SetProperty(u => u.Status, u => document.Status.IsPresent && document.Status.Value != null ? (UserStatus)(User.ParseStatus(document.Status.Value) ?? u.Status) : u.Status)
					.SetProperty(u => u.UpdatedAt, DateTime.UtcNow), cancellationToken);

			if (updatedCount == 0) {
				await transaction.RollbackAsync(cancellationToken);
				return new UpdateUserByIdResult.UserNotFound();
			}

			if (document.AccountLevel is not null) {
				var accountLevel = UserAccount.ParseAccountLevel(document.AccountLevel);

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

	private class SortFieldHandler(
		Func<Guid, Task<object?>> getCursorValue,
		Func<
			IQueryable<UserAccount>,
			object?,
			bool,
			IQueryable<UserAccount>
		> applyFilter,
		Func<
			IQueryable<UserAccount>,
			bool,
			IQueryable<UserAccount>
		> applyOrdering
	) {
		public Func<Guid, Task<object?>>
			GetCursorValue { get; } = getCursorValue;

		public Func<
			IQueryable<UserAccount>,
			object?,
			bool,
			IQueryable<UserAccount>
		> ApplyFilter { get; } = applyFilter;

		public Func<
			IQueryable<UserAccount>,
			bool,
			IQueryable<UserAccount>
		> ApplyOrdering { get; } = applyOrdering;
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
				var adminCount = await (
					from ua in _dbContext.UserAccount
					where ua.TenantId == tenantId
						&& ua.Scope == AccountScope.Tenant
						&& ua.Level == AccountLevel.Admin
						&& !ua.IsSuspended
						&& !ua.IsDeleted
					select ua
				).CountAsync(cancellationToken);

				if (adminCount <= 1) {
					return new RemoveUserFromTenantResult.CannotRemoveLastAdmin();
				}
			}

			// Soft delete the user account
			userAccount.IsDeleted = true;
			userAccount.DeletedAt = DateTime.UtcNow;
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
			newLevel = UserAccount.ParseAccountLevel(document.Level);
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
				var adminCount = await (
					from ua in _dbContext.UserAccount
					where ua.TenantId == tenantId
						&& ua.Scope == AccountScope.Tenant
						&& ua.Level == AccountLevel.Admin
						&& ua.UserId != userId
						&& !ua.IsSuspended
						&& !ua.IsDeleted
					select ua
				).CountAsync(cancellationToken);

				if (adminCount == 0) {
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
}
