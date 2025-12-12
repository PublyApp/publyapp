using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Shared.Auth;
using MainApi.Src.Modules.Shared.Users;
using MainApi.Src.Modules.Staff.AuditLogs;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Staff.Impersonation;

public interface IImpersonationService {
	Task<Session> CreateImpersonationSessionAsync(
		Guid tenantId,
		Guid staffUserId,
		string reason,
		int durationMinutes = 60,
		CancellationToken cancellationToken = default);

	Task<bool> ValidateImpersonationSessionAsync(
		string sessionToken,
		CancellationToken cancellationToken = default);
}

public class ImpersonationService : IImpersonationService {
	private readonly MainApiDbContext _dbContext;
	private readonly IAuditLogService _auditLogService;
	private readonly ILogger<ImpersonationService> _logger;

	public ImpersonationService(
		MainApiDbContext dbContext,
		IAuditLogService auditLogService,
		ILogger<ImpersonationService> logger
	) {
		_dbContext = dbContext;
		_auditLogService = auditLogService;
		_logger = logger;
	}

	public async Task<Session> CreateImpersonationSessionAsync(
		Guid tenantId,
		Guid staffUserId,
		string reason,
		int durationMinutes = 60,
		CancellationToken cancellationToken = default
	) {
		var tenantAccountQuery =
			from ua in _dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.IsSuspended == false
			orderby ua.Level descending, ua.CreatedAt ascending
			select ua;

		var tenantUserAccount = await tenantAccountQuery.FirstOrDefaultAsync(cancellationToken);

		if (tenantUserAccount is null) {
			throw new InvalidOperationException($"No active user account found for tenant {tenantId}");
		}

		var expiresAt = DateTime.UtcNow.AddMinutes(durationMinutes);

		var session = new Session {
			UserId = tenantUserAccount.UserId,
			Token = GenerateSessionToken(),
			ExpiresAt = expiresAt,
			IsImpersonation = true,
			ImpersonatingStaffUserId = staffUserId,
			ImpersonationReason = reason,
			ImpersonationExpiresAt = expiresAt
		};

		await _dbContext.Session.AddAsync(session, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		await _auditLogService.LogAsync(
			staffUserId,
			AuditActions.ImpersonationStarted,
			tenantId,
			new { Reason = reason, Duration = durationMinutes },
			cancellationToken
		);

		_logger.LogInformation(
			"Staff user {StaffUserId} started impersonation session for tenant {TenantId}",
			staffUserId,
			tenantId
		);

		return session;
	}

	public async Task<bool> ValidateImpersonationSessionAsync(
		string sessionToken,
		CancellationToken cancellationToken = default
	) {
		var sessionQuery =
			from s in _dbContext.Session
			where s.Token == sessionToken && s.IsImpersonation
			select s;

		var session = await sessionQuery.FirstOrDefaultAsync(cancellationToken);

		return session is not null && session.IsImpersonationValid();
	}

	private static string GenerateSessionToken() {
		return CryptoUtils.RandomString(32);
	}
}
