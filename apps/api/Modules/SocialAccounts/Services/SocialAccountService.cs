using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Domain service for social account operations.
/// Methods added here MUST use their tenantId parameter
/// (enforced by SocialAccountArchitecture.Spec).
/// </summary>
public sealed class SocialAccountService {
	private readonly AppDbContext _db;

	public SocialAccountService(AppDbContext db) {
		_db = db;
	}

	public async Task<SocialAccount?> FindByExternalAccountAsync(
		Guid tenantId,
		SocialProvider provider,
		string externalAccountId,
		CancellationToken ct = default
	) {
		return await _db.SocialAccount
			.Where(a => a.TenantId == tenantId
				&& a.Provider == provider
				&& a.ExternalAccountId == externalAccountId
				&& !a.IsDeleted)
			.FirstOrDefaultAsync(ct);
	}
}
