using System.Security.Cryptography;
using System.Text;
using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

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
}

public class InvitationService : IInvitationService {
	private readonly MainApiDbContext _dbContext;
	private readonly ILogger<InvitationService> _logger;

	public InvitationService(MainApiDbContext dbContext, ILogger<InvitationService> logger) {
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
