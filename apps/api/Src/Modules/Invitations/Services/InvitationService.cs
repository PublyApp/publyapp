using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

using UserEntity = MainApi.Src.Modules.Users.Entities.User;

namespace MainApi.Src.Modules.Invitations.Services;

public interface IInvitationService {
	Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
		string email,
		List<Guid> profileIds,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default);

	Task<(Invitation Invitation, string Token)> CreateTenantInvitationAsync(
		string email,
		Guid tenantId,
		List<Guid> profileIds,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default);

	Task<Invitation?> GetInvitationByTokenAsync(
		string token,
		CancellationToken cancellationToken = default);

	Task<Invitation?> GetStaffInvitationByIdAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);

	Task<StaffInvitationDetailsResult?> GetStaffInvitationDetailsAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);

	Task<bool> RevokeInvitationAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);

	Task<Profile?> GetStaffProfileAsync(
		Guid profileId,
		CancellationToken cancellationToken = default);

	Task<bool> UserExistsAsync(
		string email,
		CancellationToken cancellationToken = default);

	Task<bool> PendingInvitationExistsAsync(
		string email,
		InvitationScope scope,
		CancellationToken cancellationToken = default);

	Task<FindStaffInvitationsResult> FindStaffInvitationsAsync(
		Guid cursor,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		string? status = null,
		CancellationToken cancellationToken = default);

	Task<UserEntity> AcceptStaffInvitationAsync(
		Invitation invitation,
		string firstName,
		string lastName,
		string passwordHash,
		CancellationToken cancellationToken = default);

	Task<UserEntity> AcceptTenantInvitationAsync(
		Invitation invitation,
		string firstName,
		string lastName,
		string passwordHash,
		CancellationToken cancellationToken = default);

	// Batch validation methods for bulk operations
	Task<List<string>> GetExistingUserEmailsAsync(
		List<string> emails,
		CancellationToken cancellationToken = default);

	Task<List<string>> GetPendingInvitationEmailsAsync(
		List<string> emails,
		InvitationScope scope,
		CancellationToken cancellationToken = default);

	Task<List<Guid>> ValidateStaffProfilesAsync(
		List<Guid> profileIds,
		CancellationToken cancellationToken = default);

	// Bulk creation method
	Task<List<(string Email, string Token)>> BulkCreateStaffInvitationsAsync(
		List<BulkStaffInvitationItem> invitations,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default);

	Task MarkInvitationAsAcceptedAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);
}

public record InvitationListItem {
	public required Guid Id { get; init; }
	public required string Email { get; init; }
	public required string Scope { get; init; }
	public required string ProfileName { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public DateTime? AcceptedAt { get; init; }
	public required bool IsAccepted { get; init; }
	public required bool IsRevoked { get; init; }
	public required DateTime CreatedAt { get; init; }
	public string? InvitedByName { get; init; }
}

public abstract record FindStaffInvitationsResult {
	public sealed record Success(
		CursorPaginatedResult<InvitationListItem> Data
	) : FindStaffInvitationsResult;

	public sealed record CursorNotFound(string Cursor) : FindStaffInvitationsResult;

	public sealed record InvalidSortId(string SortId) : FindStaffInvitationsResult;
}

public record BulkStaffInvitationItem {
	public required string Email { get; init; }
	public required List<Guid> ProfileIds { get; init; }
}

public record StaffInvitationProfileInfo {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
}

public record StaffInvitationDetailsResult {
	public required Guid Id { get; init; }
	public required string Email { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public DateTime? AcceptedAt { get; init; }
	public DateTime? RevokedAt { get; init; }
	public required bool IsAccepted { get; init; }
	public required bool IsRevoked { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required string InvitedByName { get; init; }
	public required Guid InvitedByUserId { get; init; }
	public required List<StaffInvitationProfileInfo> Profiles { get; init; }
}

public class InvitationService : IInvitationService {
	private readonly MainApiDbContext _dbContext;
	private readonly ILogger<InvitationService> _logger;
	private readonly IOptions<AppSettings> _appSettings;

	public InvitationService(
		MainApiDbContext dbContext,
		IOptions<AppSettings> appSettings,
		ILogger<InvitationService> logger
	) {
		_dbContext = dbContext;
		_logger = logger;
		_appSettings = appSettings;
	}

	public async Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
		string email,
		List<Guid> profileIds,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	) {
		var token = CryptoUtils.RandomString(_appSettings.Value.INVITATION_TOKEN_LENGTH);
		var expiresAt = DateTime.UtcNow.AddDays(7);

		var invitation = Invitation.CreateStaffInvitationWithProfiles(
			email,
			profileIds,
			invitedByUserId,
			expiresAt,
			token
		);

		invitation.ValidateInvitationType();

		await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Created staff invitation for {Email} with {ProfileCount} profiles by user {InvitedByUserId}",
				email,
				profileIds.Count,
				invitedByUserId
			);
		}

		return (invitation, token);
	}

	public async Task<(Invitation Invitation, string Token)> CreateTenantInvitationAsync(
		string email,
		Guid tenantId,
		List<Guid> profileIds,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	) {
		var token = CryptoUtils.RandomString(_appSettings.Value.INVITATION_TOKEN_LENGTH);
		var expiresAt = DateTime.UtcNow.AddDays(7);

		var invitation = Invitation.CreateTenantInvitationWithProfiles(
			email,
			tenantId,
			profileIds,
			invitedByUserId,
			expiresAt,
			token
		);

		invitation.ValidateInvitationType();

		await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Created tenant invitation for {Email} in tenant {TenantId} with {ProfileCount} profiles by user {InvitedByUserId}",
				email,
				tenantId,
				profileIds.Count,
				invitedByUserId
			);
		}

		return (invitation, token);
	}

	public async Task<Invitation?> GetInvitationByTokenAsync(
		string token,
		CancellationToken cancellationToken = default
	) {
		var invitationQuery =
			from inv in _dbContext.Invitation
			where inv.Token == token
			select inv;

		var invitation = await invitationQuery
			.Include(inv => inv.InvitationProfiles)
			.ThenInclude(ip => ip.Profile)
			.FirstOrDefaultAsync(cancellationToken);

		if (invitation is null) {
			return null;
		}

		if (invitation.CanBeAccepted() is false) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Invitation {InvitationId} cannot be accepted (expired, revoked, or deleted)",
					invitation.Id
				);
			}
			return null;
		}

		return invitation;
	}

	public async Task<Invitation?> GetStaffInvitationByIdAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		// Scope guard: only return staff invitations for staff-only actions.
		return await _dbContext.Invitation
			.Where(inv => inv.Id == invitationId && inv.Scope == InvitationScope.Staff)
			.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<StaffInvitationDetailsResult?> GetStaffInvitationDetailsAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		// Load invitation with invited-by user
		var invitationWithInviter = await (
			from inv in _dbContext.Invitation
			where inv.Id == invitationId && inv.Scope == InvitationScope.Staff
			join inviter in _dbContext.User on inv.InvitedByUserId equals inviter.Id
			select new {
				Invitation = inv,
				InviterFirstName = inviter.FirstName,
				InviterLastName = inviter.LastName
			}
		).FirstOrDefaultAsync(cancellationToken);

		if (invitationWithInviter is null) {
			return null;
		}

		var invitation = invitationWithInviter.Invitation;

		// Load profiles for the invitation
		var profiles = await (
			from ip in _dbContext.InvitationProfile
			where ip.InvitationId == invitationId
			join p in _dbContext.Profile on ip.ProfileId equals p.Id
			select new StaffInvitationProfileInfo {
				Id = p.Id!.Value,
				Name = p.Name
			}
		).ToListAsync(cancellationToken);

		var inviterName =
			$"{invitationWithInviter.InviterFirstName} {invitationWithInviter.InviterLastName}";

		return new StaffInvitationDetailsResult {
			Id = invitation.GetRequiredId(),
			Email = invitation.Email,
			ExpiresAt = invitation.ExpiresAt,
			AcceptedAt = invitation.AcceptedAt,
			RevokedAt = invitation.RevokedAt,
			IsAccepted = invitation.IsAccepted,
			IsRevoked = invitation.IsRevoked,
			CreatedAt = invitation.CreatedAt,
			InvitedByName = inviterName,
			InvitedByUserId = invitation.InvitedByUserId,
			Profiles = profiles
		};
	}

	public async Task<bool> RevokeInvitationAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		var invitation = await _dbContext.Invitation
			.FindAsync(new object[] { invitationId }, cancellationToken);

		if (invitation is null) {
			return false;
		}

		if (invitation.IsRevoked) {
			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Invitation {InvitationId} is already revoked; no-op",
					invitationId
				);
			}
			return true;
		}

		if (invitation.IsAccepted) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Attempt to revoke accepted invitation {InvitationId} blocked",
					invitationId
				);
			}
			return false;
		}

		invitation.IsRevoked = true;
		invitation.RevokedAt = DateTime.UtcNow;

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
		}
		return true;
	}

	public async Task<Profile?> GetStaffProfileAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	) {
		var profileQuery =
			from p in _dbContext.Profile
			where p.Id == profileId && p.Scope == ProfileScope.Staff
			select p;

		return await profileQuery.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<bool> UserExistsAsync(
		string email,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmail = email.ToLowerInvariant();
		var userQuery =
			from u in _dbContext.User
			where u.Email == normalizedEmail
			select u;

		return await userQuery.AnyAsync(cancellationToken);
	}

	public async Task<bool> PendingInvitationExistsAsync(
		string email,
		InvitationScope scope,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmail = email.ToLowerInvariant();
		var invitationQuery =
			from inv in _dbContext.Invitation
			where inv.Email == normalizedEmail
				&& inv.Scope == scope
				&& inv.IsAccepted == false
				&& inv.IsRevoked == false
				&& inv.ExpiresAt > DateTime.UtcNow
			select inv;

		return await invitationQuery.AnyAsync(cancellationToken);
	}

	public async Task<FindStaffInvitationsResult> FindStaffInvitationsAsync(
		Guid cursor,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		string? status = null,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = limit ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
		var effectiveSortId = (sortId ?? "created_at").ToLowerInvariant();

		// Keyset pagination handlers per sortId (cursor stays a Guid).
		var sortFieldHandlers = new Dictionary<string, SortFieldHandler> {
			["created_at"] = new SortFieldHandler(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Staff)
						.Select(inv => new { inv.CreatedAt, inv.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.CreatedAt, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(inv => inv.CreatedAt > cursorCreatedAt || (inv.CreatedAt == cursorCreatedAt && inv.Id > cursorId))
						: q.Where(inv => inv.CreatedAt < cursorCreatedAt || (inv.CreatedAt == cursorCreatedAt && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.CreatedAt).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.CreatedAt).ThenByDescending(inv => inv.Id)
			),
			["expires_at"] = new SortFieldHandler(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Staff)
						.Select(inv => new { inv.ExpiresAt, inv.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.ExpiresAt, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorExpiresAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(inv => inv.ExpiresAt > cursorExpiresAt || (inv.ExpiresAt == cursorExpiresAt && inv.Id > cursorId))
						: q.Where(inv => inv.ExpiresAt < cursorExpiresAt || (inv.ExpiresAt == cursorExpiresAt && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.ExpiresAt).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.ExpiresAt).ThenByDescending(inv => inv.Id)
			),
			["email"] = new SortFieldHandler(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Staff)
						.Select(inv => new { inv.Email, inv.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.Email, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorEmail, cursorId) = ((string, Guid?))cursorValue;
					return isAsc
						? q.Where(inv => inv.Email.CompareTo(cursorEmail) > 0 || (inv.Email == cursorEmail && inv.Id > cursorId))
						: q.Where(inv => inv.Email.CompareTo(cursorEmail) < 0 || (inv.Email == cursorEmail && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.Email).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.Email).ThenByDescending(inv => inv.Id)
			),
			["accepted_at"] = new SortFieldHandler(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Staff)
						.Select(inv => new {
							// Treat null AcceptedAt as min value to keep ordering stable.
							AcceptedAt = inv.AcceptedAt ?? DateTime.MinValue,
							inv.Id
						})
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.AcceptedAt, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorAcceptedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(inv =>
							(inv.AcceptedAt ?? DateTime.MinValue) > cursorAcceptedAt
							|| ((inv.AcceptedAt ?? DateTime.MinValue) == cursorAcceptedAt && inv.Id > cursorId))
						: q.Where(inv =>
							(inv.AcceptedAt ?? DateTime.MinValue) < cursorAcceptedAt
							|| ((inv.AcceptedAt ?? DateTime.MinValue) == cursorAcceptedAt && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.AcceptedAt ?? DateTime.MinValue).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.AcceptedAt ?? DateTime.MinValue).ThenByDescending(inv => inv.Id)
			)
		};

		if (!sortFieldHandlers.TryGetValue(effectiveSortId, out SortFieldHandler? handler)) {
			return new FindStaffInvitationsResult.InvalidSortId(effectiveSortId);
		}

		var query = _dbContext.Invitation
			.Where(inv => inv.Scope == InvitationScope.Staff && inv.Id != null);

		if (!string.IsNullOrWhiteSpace(status)) {
			// Apply backend status semantics so UI filters match persisted state.
			var normalizedStatus = status.Trim().ToLowerInvariant();
			var now = DateTime.UtcNow;

			switch (normalizedStatus) {
				case "pending":
					query = query.Where(inv => !inv.IsAccepted && !inv.IsRevoked && inv.ExpiresAt > now);
					break;
				case "accepted":
					query = query.Where(inv => inv.IsAccepted);
					break;
				case "revoked":
					query = query.Where(inv => inv.IsRevoked);
					break;
				case "expired":
					query = query.Where(inv => !inv.IsAccepted && !inv.IsRevoked && inv.ExpiresAt <= now);
					break;
			}
		}

		if (cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(cursor);
			if (cursorValue is null) {
				return new FindStaffInvitationsResult.CursorNotFound(cursor.ToString());
			}

			query = handler.ApplyFilter(query, cursorValue, effectiveSortOrder == SortOrder.Asc);
		}

		var orderedQuery = handler.ApplyOrdering(query, effectiveSortOrder == SortOrder.Asc);

		// Fetch one extra row to compute the next cursor.
		var results = await orderedQuery
			.Join(
				_dbContext.User,
				inv => inv.InvitedByUserId,
				inviter => inviter.Id,
				(inv, inviter) => new {
					Invitation = inv,
					InviterName = $"{inviter.FirstName} {inviter.LastName}"
				}
			)
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().Invitation.GetRequiredId().ToString();
		}

		// Load profile names separately to avoid duplicating invitation rows.
		var invitationIds = results.Select(r => r.Invitation.GetRequiredId()).ToList();
		var profileNamesQuery =
			from ip in _dbContext.InvitationProfile
			where invitationIds.Contains(ip.InvitationId)
			join p in _dbContext.Profile on ip.ProfileId equals p.Id
			select new {
				InvitationId = ip.InvitationId,
				ProfileName = p.Name
			};

		var profileNames = await profileNamesQuery.ToListAsync(cancellationToken);
		var profileNamesByInvitation = profileNames
			.GroupBy(pn => pn.InvitationId)
			.ToDictionary(g => g.Key, g => string.Join(", ", g.Select(x => x.ProfileName)));

		var invitationItems = results.Select(r => {
			var invitationId = r.Invitation.GetRequiredId();
			var profileName = profileNamesByInvitation.TryGetValue(invitationId, out var name) ? name : "";
			return new InvitationListItem {
				Id = invitationId,
				Email = r.Invitation.Email,
				Scope = "Staff",
				ProfileName = profileName,
				ExpiresAt = r.Invitation.ExpiresAt,
				AcceptedAt = r.Invitation.AcceptedAt,
				IsAccepted = r.Invitation.IsAccepted,
				IsRevoked = r.Invitation.IsRevoked,
				CreatedAt = r.Invitation.CreatedAt,
				InvitedByName = r.InviterName
			};
		}).ToList();

		return new FindStaffInvitationsResult.Success(
			new CursorPaginatedResult<InvitationListItem> {
				Data = invitationItems,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<UserEntity> AcceptStaffInvitationAsync(
		Invitation invitation,
		string firstName,
		string lastName,
		string passwordHash,
		CancellationToken cancellationToken = default
	) {
		await using var tx = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);
		try {
			// Create user
			var user = new UserEntity {
				Email = invitation.Email,
				Password = passwordHash,
				FirstName = firstName,
				LastName = lastName,
				Status = UserStatus.Active,
				IsVerified = true
			};
			await _dbContext.User.AddAsync(user, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Create staff account
			var account = UserAccount.CreateStaffAccount(
				user.GetRequiredId(),
				AccountLevel.User
			);
			await _dbContext.UserAccount.AddAsync(account, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Load invitation profiles
			var invitationProfiles = await (
				from ip in _dbContext.InvitationProfile
				where ip.InvitationId == invitation.GetRequiredId()
				select ip
			).ToListAsync(cancellationToken);

			// Assign ALL profiles from the invitation
			foreach (var invitationProfile in invitationProfiles) {
				await _dbContext.UserAccountProfile.AddAsync(
					new UserAccountProfile {
						UserAccountId = account.GetRequiredId(),
						ProfileId = invitationProfile.ProfileId
					},
					cancellationToken
				);
			}

			// Mark invitation as accepted
			invitation.IsAccepted = true;
			invitation.AcceptedAt = DateTime.UtcNow;
			await _dbContext.SaveChangesAsync(cancellationToken);

			await tx.CommitAsync(cancellationToken);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Staff invitation accepted: User {UserId} created with {ProfileCount} profiles from invitation {InvitationId}",
					user.GetRequiredId(),
					invitationProfiles.Count,
					invitation.GetRequiredId()
				);
			}

			return user;
		} catch {
			await tx.RollbackAsync(cancellationToken);
			throw;
		}
	}

	public async Task<UserEntity> AcceptTenantInvitationAsync(
		Invitation invitation,
		string firstName,
		string lastName,
		string passwordHash,
		CancellationToken cancellationToken = default
	) {
		await using var tx = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);
		try {
			// Validate invitation has TenantId
			if (invitation.TenantId is null) {
				throw new InvalidOperationException(
					$"Tenant invitation {invitation.GetRequiredId()} has no TenantId"
				);
			}

			var tenantId = invitation.TenantId.Value;
			var accountLevel = invitation.AccountLevel ?? AccountLevel.User;

			// Create user
			var user = new UserEntity {
				Email = invitation.Email,
				Password = passwordHash,
				FirstName = firstName,
				LastName = lastName,
				Status = UserStatus.Active,
				IsVerified = true
			};
			await _dbContext.User.AddAsync(user, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Create tenant account
			var account = UserAccount.CreateTenantAccount(
				user.GetRequiredId(),
				tenantId,
				accountLevel
			);
			await _dbContext.UserAccount.AddAsync(account, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Load invitation profiles
			var invitationProfiles = await (
				from ip in _dbContext.InvitationProfile
				where ip.InvitationId == invitation.GetRequiredId()
				select ip
			).ToListAsync(cancellationToken);

			// Assign ALL profiles from the invitation
			foreach (var invitationProfile in invitationProfiles) {
				await _dbContext.UserAccountProfile.AddAsync(
					new UserAccountProfile {
						UserAccountId = account.GetRequiredId(),
						ProfileId = invitationProfile.ProfileId
					},
					cancellationToken
				);
			}

			// Mark invitation as accepted
			invitation.IsAccepted = true;
			invitation.AcceptedAt = DateTime.UtcNow;
			await _dbContext.SaveChangesAsync(cancellationToken);

			await tx.CommitAsync(cancellationToken);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Tenant invitation accepted: User {UserId} created in tenant {TenantId} with AccountLevel {AccountLevel} and {ProfileCount} profiles from invitation {InvitationId}",
					user.GetRequiredId(),
					tenantId,
					accountLevel,
					invitationProfiles.Count,
					invitation.GetRequiredId()
				);
			}

			return user;
		} catch {
			await tx.RollbackAsync(cancellationToken);
			throw;
		}
	}

	public async Task<List<string>> GetExistingUserEmailsAsync(
		List<string> emails,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmails = emails.Select(e => e.ToLowerInvariant()).ToList();

		var existingEmails = await (
			from u in _dbContext.User.AsNoTracking()
			where normalizedEmails.Contains(u.Email)
			select u.Email
		).ToListAsync(cancellationToken);

		return existingEmails;
	}

	public async Task<List<string>> GetPendingInvitationEmailsAsync(
		List<string> emails,
		InvitationScope scope,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmails = emails.Select(e => e.ToLowerInvariant()).ToList();

		var existingEmails = await (
			from inv in _dbContext.Invitation.AsNoTracking()
			where normalizedEmails.Contains(inv.Email)
				&& inv.Scope == scope
				&& inv.IsAccepted == false
				&& inv.IsRevoked == false
				&& inv.ExpiresAt > DateTime.UtcNow
			select inv.Email
		).ToListAsync(cancellationToken);

		return existingEmails;
	}

	public async Task<List<Guid>> ValidateStaffProfilesAsync(
		List<Guid> profileIds,
		CancellationToken cancellationToken = default
	) {
		var validProfileIds = await (
			from p in _dbContext.Profile.AsNoTracking()
			where p.Id != null
				&& profileIds.Contains(p.Id.Value)
				&& p.Scope == ProfileScope.Staff
			select p.Id!.Value
		).ToListAsync(cancellationToken);

		return validProfileIds;
	}

	public async Task<List<(string Email, string Token)>> BulkCreateStaffInvitationsAsync(
		List<BulkStaffInvitationItem> invitations,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	) {
		await using var tx = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);
		try {
			var expiresAt = DateTime.UtcNow.AddDays(7);
			var invitationTokens = new List<(string Email, string Token)>();

			foreach (var item in invitations) {
				// Generate unique token per invitation (one per email)
				var token = CryptoUtils.RandomString(_appSettings.Value.INVITATION_TOKEN_LENGTH);

				// Use factory to create invitation with multiple profiles
				var invitation = Invitation.CreateStaffInvitationWithProfiles(
					item.Email,
					item.ProfileIds,
					invitedByUserId,
					expiresAt,
					token
				);

				// Validate invitation type
				invitation.ValidateInvitationType();

				// Add invitation (EF Core will also track the InvitationProfile junction records)
				_dbContext.Invitation.Add(invitation);

				// Collect email and token for sending emails later
				invitationTokens.Add((item.Email, token));
			}

			// Save all changes (single database INSERT with multiple rows)
			await _dbContext.SaveChangesAsync(cancellationToken);

			// Commit transaction
			await tx.CommitAsync(cancellationToken);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Created {Count} staff invitations in bulk by user {InvitedByUserId}",
					invitationTokens.Count,
					invitedByUserId
				);
			}

			return invitationTokens;
		} catch {
			await tx.RollbackAsync(cancellationToken);
			throw;
		}
	}

	public async Task MarkInvitationAsAcceptedAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		var invitation = await _dbContext.Invitation
			.FindAsync(new object[] { invitationId }, cancellationToken);

		if (invitation is null) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Attempt to mark non-existent invitation {InvitationId} as accepted",
					invitationId
				);
			}
			return;
		}

		if (invitation.IsAccepted) {
			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Invitation {InvitationId} is already accepted; no-op",
					invitationId
				);
			}
			return;
		}

		invitation.IsAccepted = true;
		invitation.AcceptedAt = DateTime.UtcNow;

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Marked invitation {InvitationId} as accepted", invitationId);
		}
	}

	private class SortFieldHandler {
		public Func<Guid, Task<object?>> GetCursorValue { get; }
		public Func<IQueryable<Invitation>, object?, bool, IQueryable<Invitation>> ApplyFilter { get; }
		public Func<IQueryable<Invitation>, bool, IQueryable<Invitation>> ApplyOrdering { get; }

		public SortFieldHandler(
			Func<Guid, Task<object?>> getCursorValue,
			Func<IQueryable<Invitation>, object?, bool, IQueryable<Invitation>> applyFilter,
			Func<IQueryable<Invitation>, bool, IQueryable<Invitation>> applyOrdering
		) {
			GetCursorValue = getCursorValue;
			ApplyFilter = applyFilter;
			ApplyOrdering = applyOrdering;
		}
	}
}
