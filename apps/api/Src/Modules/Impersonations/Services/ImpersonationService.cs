using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.DI;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Auth.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Impersonations.Services;

public record CreateImpersonationSessionArgs(
	Guid TenantId,
	Guid StaffUserId,
	string Reason,
	int DurationMinutes = 60
);

public interface IImpersonationService {
	Task<Session> CreateImpersonationSessionAsync(
		CreateImpersonationSessionArgs args,
		CancellationToken cancellationToken = default);

	Task<bool> ValidateImpersonationSessionAsync(
		string sessionToken,
		CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
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
		CreateImpersonationSessionArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantId = args.TenantId;
		var staffUserId = args.StaffUserId;
		var reason = args.Reason;
		var durationMinutes = args.DurationMinutes;

		var tenantAccountQuery =
			from ua in _dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.Status != AccountStatus.Suspended
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
			new CreateAuditLogArgs(
				UserId: staffUserId,
				Action: AuditActions.ImpersonationStarted,
				TargetId: tenantId,
				Details: new { Reason = reason, Duration = durationMinutes }
			),
			cancellationToken
		);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Staff user {StaffUserId} started impersonation session for tenant {TenantId}",
				staffUserId,
				tenantId
			);
		}

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
