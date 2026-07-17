using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public class UpdateTenantUserIdentityDocument {
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
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

public interface ITenantUserIdentityService {
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
}

[Service(ServiceLifetime.Scoped)]
public sealed class TenantUserIdentityService : ITenantUserIdentityService {
	private readonly AppDbContext _dbContext;

	public TenantUserIdentityService(AppDbContext dbContext) {
		_dbContext = dbContext;
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

		var userData = await GetTenantUserDetailsForStaffForMutationAsync(
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

		var userData = await GetTenantUserDetailsForStaffForMutationAsync(
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
		var userData = await GetTenantUserDetailsForStaffForMutationAsync(
			userId,
			cancellationToken
		);

		if (userData is null) {
			return new SuspendTenantUserIdentityResult.NotFound();
		}

		if (userData.User.IsSuspended()) {
			return new SuspendTenantUserIdentityResult.AlreadySuspended();
		}

		// READ COMMITTED, not SERIALIZABLE: this guard shares the last-admin invariant with the
		// tenant removal/demotion paths, which now protect it with the tenant row lock under
		// READ COMMITTED (see TenantMembershipLockOrder). SSI protected this only while every
		// participant was SERIALIZABLE.
		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			// TenantMembershipLockOrder step 1, across every tenant this user belongs to: those
			// are exactly the tenants whose active-admin count this suspension can reduce. Taken
			// before the scan below so it sees concurrently committed admin changes, and in id
			// order so it cannot deadlock against a single-tenant path.
			var affectedTenantIds = (
				await (
					from ua in _dbContext.UserAccount
					where ua.UserId == userId
						&& ua.Scope == AccountScope.Tenant
						&& ua.TenantId != null
						&& !ua.IsDeleted
					select ua.TenantId
				).Distinct().ToListAsync(cancellationToken)
			)
				// OfType drops the nullable wrapper without a null-forgiving operator; the
				// query already excludes null tenant ids.
				.OfType<Guid>()
				.ToList();

			await TenantMembershipLockOrder.LockTenantRowsAsync(
				_dbContext,
				affectedTenantIds,
				cancellationToken
			);

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

		var updatedUserData = await GetTenantUserDetailsForStaffForMutationAsync(
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
		var userData = await GetTenantUserDetailsForStaffForMutationAsync(
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

		var updatedUserData = await GetTenantUserDetailsForStaffForMutationAsync(
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

	private async Task<User?> GetUserByEmailAsync(
		string email,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmail = email.ToLowerInvariant();
		var query =
			from u in _dbContext.User
			where u.Email == normalizedEmail
				&& !u.IsDeleted
			select u;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	private async Task<TenantUserDetailsData?> GetTenantUserDetailsForStaffForMutationAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserDetailsQueries.GetForStaffAsync(
			_dbContext,
			userId,
			cancellationToken
		);
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

	private async Task<SuspendTenantUserIdentityResult>
	ResolveSuspendTenantUserIdentityAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await GetTenantUserDetailsForStaffForMutationAsync(
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
		var currentUserData = await GetTenantUserDetailsForStaffForMutationAsync(
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
}
