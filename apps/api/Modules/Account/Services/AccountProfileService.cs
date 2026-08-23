using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Uploads.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Account.Services;

public record UpdateAccountProfileArgs(
	Guid UserId,
	Guid TenantId,
	PatchField<string?> FirstName,
	PatchField<string?> LastName,
	PatchField<string?> AvatarUrl
);

/// <summary>
/// Service-layer projection of the tenant user's own profile. Handlers map
/// this to the wire <c>AccountProfileResult</c>, keeping the service layer
/// free of handler types.
/// </summary>
public sealed record AccountProfileData(
	Guid Id,
	string Email,
	string? FirstName,
	string? LastName,
	string? AvatarUrl
);

public interface IAccountProfileService {
	Task<AccountProfileData?> GetAccountProfileAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	);
	Task<AccountProfileData?> UpdateAccountProfileAsync(
		UpdateAccountProfileArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class AccountProfileService : IAccountProfileService {
	private readonly AppDbContext _dbContext;
	private readonly IUploadAssetReferenceService _uploadReferences;

	public AccountProfileService(
		AppDbContext dbContext,
		IUploadAssetReferenceService uploadReferences
	) {
		_dbContext = dbContext;
		_uploadReferences = uploadReferences;
	}

	public async Task<AccountProfileData?> GetAccountProfileAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var user = await FindTenantAccountUserAsync(
			userId,
			tenantId,
			cancellationToken
		);

		return user is null ? null : ToResult(user);
	}

	public async Task<AccountProfileData?> UpdateAccountProfileAsync(
		UpdateAccountProfileArgs args,
		CancellationToken cancellationToken = default
	) {
		var user = await FindTenantAccountUserAsync(
			args.UserId,
			args.TenantId,
			cancellationToken
		);

		if (user is null) {
			return null;
		}

		// Captured before mutation: the replaced avatar's reference is released
		// after SaveChanges, in the same transaction scope (#807 F5).
		var previousAvatarUrlValue = user.AvatarUrl;

		if (args.FirstName.IsPresent) {
			user.FirstName = args.FirstName.Value;
		}

		if (args.LastName.IsPresent) {
			user.LastName = args.LastName.Value;
		}

		if (args.AvatarUrl.IsPresent) {
			// Acquire the new blob's reference BEFORE the entity write so the URL
			// can never commit while its asset still reads zero references (#807 F5).
			if (ServedUploadPath.ExtractOrNull(args.AvatarUrl.Value) is { } acquiredPath) {
				await _uploadReferences.TryAddReferenceAsync(acquiredPath, cancellationToken);
			}
			user.AvatarUrl = args.AvatarUrl.Value;
		}

		user.UpdatedAt = DateTime.UtcNow;

		await _dbContext.SaveChangesAsync(cancellationToken);

		// Release the replaced avatar's reference in the SAME unit of work as the
		// entity write; physical deletion stays exclusively the sweeper's.
		if (args.AvatarUrl.IsPresent && previousAvatarUrlValue is not null
			&& ServedUploadPath.ExtractOrNull(previousAvatarUrlValue) is { } releasedPath
			&& previousAvatarUrlValue != user.AvatarUrl) {
			await _uploadReferences.TryReleaseReferenceAsync(releasedPath, cancellationToken);
		}

		return ToResult(user);
	}

	// Same active-tenant-membership predicate as IAccountService
	// .GetUserTenantAccountAsync — the TenantAuthFilter already ran it, so a
	// null here is defense-in-depth (e.g. the account was removed between the
	// filter and this read) rather than the expected outcome.
	private async Task<User?> FindTenantAccountUserAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
				&& !ua.User.IsDeleted
				&& ua.User.Status != UserStatus.Suspended
			select ua.User
		).FirstOrDefaultAsync(cancellationToken);
	}

	private static AccountProfileData ToResult(User user) {
		return new AccountProfileData(
			user.GetRequiredId(),
			user.Email,
			user.FirstName,
			user.LastName,
			user.AvatarUrl
		);
	}
}
