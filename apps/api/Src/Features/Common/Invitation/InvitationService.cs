using System.Security.Cryptography;
using System.Text;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Common.User;
using Microsoft.EntityFrameworkCore;
using UserEntity = MainApi.Src.Features.Common.User.User;

namespace MainApi.Src.Features.Common.Invitation;

public interface IInvitationService {
	Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
		string email,
		Guid profileId,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default);

	Task<(Invitation Invitation, string Token)> CreateTenantInvitationAsync(
		string email,
		Guid tenantId,
		Guid profileId,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default);

	Task<Invitation?> ValidateInvitationTokenAsync(
		string token,
		CancellationToken cancellationToken = default);

	Task<bool> RevokeInvitationAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);

	Task<Profile.Profile?> GetStaffProfileAsync(
		Guid profileId,
		CancellationToken cancellationToken = default);

	Task<bool> UserExistsAsync(
		string email,
		CancellationToken cancellationToken = default);

	Task<bool> PendingInvitationExistsAsync(
		string email,
		InvitationScope scope,
		CancellationToken cancellationToken = default);

	Task<List<InvitationListItem>> FindStaffInvitationsAsync(
		CancellationToken cancellationToken = default);

	Task<UserEntity> AcceptStaffInvitationAsync(
		Invitation invitation,
		string firstName,
		string lastName,
		string passwordHash,
		CancellationToken cancellationToken = default);
}

public record InvitationListItem {
	public required Guid Id { get; init; }
	public required string Email { get; init; }
	public required string Scope { get; init; }
	public required string ProfileName { get; init; }
	public required DateTime ExpiresAt { get; init; }
	public required bool IsAccepted { get; init; }
	public required bool IsRevoked { get; init; }
	public required DateTime CreatedAt { get; init; }
	public string? InvitedByName { get; init; }
}

public class InvitationService : IInvitationService {
	private readonly MainApiDbContext _dbContext;
	private readonly ILogger<InvitationService> _logger;

	public InvitationService(
		MainApiDbContext dbContext,
		ILogger<InvitationService> logger
	) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
		string email,
		Guid profileId,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	) {
		var (token, tokenHash) = GenerateToken();
		var expiresAt = DateTime.UtcNow.AddDays(7);

		var invitation = Invitation.CreateStaffInvitation(
			email,
			profileId,
			invitedByUserId,
			expiresAt,
			tokenHash
		);

		invitation.ValidateInvitationType();

		await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		_logger.LogInformation(
			"Created staff invitation for {Email} by user {InvitedByUserId}",
			email,
			invitedByUserId
		);

		return (invitation, token);
	}

	public async Task<(Invitation Invitation, string Token)> CreateTenantInvitationAsync(
		string email,
		Guid tenantId,
		Guid profileId,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	) {
		var (token, tokenHash) = GenerateToken();
		var expiresAt = DateTime.UtcNow.AddDays(7);

		var invitation = Invitation.CreateTenantInvitation(
			email,
			tenantId,
			profileId,
			invitedByUserId,
			expiresAt,
			tokenHash
		);

		invitation.ValidateInvitationType();

		await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		_logger.LogInformation(
			"Created tenant invitation for {Email} in tenant {TenantId} by user {InvitedByUserId}",
			email,
			tenantId,
			invitedByUserId
		);

		return (invitation, token);
	}

	public async Task<Invitation?> ValidateInvitationTokenAsync(
		string token,
		CancellationToken cancellationToken = default
	) {
		var tokenHash = HashToken(token);

		var invitationQuery =
			from inv in _dbContext.Invitation
			where inv.TokenHash == tokenHash
			select inv;

		var invitation = await invitationQuery.FirstOrDefaultAsync(cancellationToken);

		if (invitation is null) {
			return null;
		}

		if (invitation.CanBeAccepted() is false) {
			_logger.LogWarning(
				"Invitation {InvitationId} cannot be accepted (expired, revoked, or deleted)",
				invitation.Id
			);
			return null;
		}

		return invitation;
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
			_logger.LogInformation(
				"Invitation {InvitationId} is already revoked; no-op",
				invitationId
			);
			return true;
		}

		if (invitation.IsAccepted) {
			_logger.LogWarning(
				"Attempt to revoke accepted invitation {InvitationId} blocked",
				invitationId
			);
			return false;
		}

		invitation.IsRevoked = true;
		invitation.RevokedAt = DateTime.UtcNow;

		await _dbContext.SaveChangesAsync(cancellationToken);

		_logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
		return true;
	}

	public async Task<Profile.Profile?> GetStaffProfileAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	) {
		var profileQuery =
			from p in _dbContext.Profile
			where p.Id == profileId && p.ProfileScope == ProfileScope.Staff
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

	public async Task<List<InvitationListItem>> FindStaffInvitationsAsync(
		CancellationToken cancellationToken = default
	) {
		var invitationsQuery =
			from inv in _dbContext.Invitation
			where inv.Scope == InvitationScope.Staff
			join profile in _dbContext.Profile on inv.ProfileId equals profile.Id
			join inviter in _dbContext.User on inv.InvitedByUserId equals inviter.Id
			orderby inv.CreatedAt descending
			select new InvitationListItem {
				Id = inv.GetRequiredId(),
				Email = inv.Email,
				Scope = "Staff",
				ProfileName = profile.Name,
				ExpiresAt = inv.ExpiresAt,
				IsAccepted = inv.IsAccepted,
				IsRevoked = inv.IsRevoked,
				CreatedAt = inv.CreatedAt,
				InvitedByName = $"{inviter.FirstName} {inviter.LastName}"
			};

		return await invitationsQuery.ToListAsync(cancellationToken);
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

			// Assign profile
			await _dbContext.UserAccountProfile.AddAsync(
				new UserAccountProfile {
					UserAccountId = account.GetRequiredId(),
					ProfileId = invitation.ProfileId
				},
				cancellationToken
			);

			// Mark invitation as accepted
			invitation.IsAccepted = true;
			invitation.AcceptedAt = DateTime.UtcNow;
			await _dbContext.SaveChangesAsync(cancellationToken);

			await tx.CommitAsync(cancellationToken);

			_logger.LogInformation(
				"Staff invitation accepted: User {UserId} created from invitation {InvitationId}",
				user.GetRequiredId(),
				invitation.GetRequiredId()
			);

			return user;
		} catch {
			await tx.RollbackAsync(cancellationToken);
			throw;
		}
	}

	private static (string Token, string TokenHash) GenerateToken() {
		var bytes = new byte[32];
		RandomNumberGenerator.Fill(bytes);
		var token = Convert.ToBase64String(bytes)
			.Replace("+", "-")
			.Replace("/", "_")
			.TrimEnd('=');

		var tokenHash = HashToken(token);
		return (token, tokenHash);
	}

	private static string HashToken(string token) {
		var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
		return Convert.ToHexString(hashBytes).ToLowerInvariant();
	}
}
