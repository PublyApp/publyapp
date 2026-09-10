using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Entities;
using PublyApp.Api.Modules.Users.Entities;
namespace PublyApp.Api.Modules.Impersonations.Services;

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
	private readonly AppDbContext _DbContext;
	private readonly IHttpContextAccessor _HttpContextAccessor;
	private readonly ILogger<ImpersonationService> _Logger;

	public ImpersonationService(
		AppDbContext dbContext,
		IHttpContextAccessor httpContextAccessor,
		ILogger<ImpersonationService> logger
	) {
		_DbContext = dbContext;
		_HttpContextAccessor = httpContextAccessor;
		_Logger = logger;
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
			from ua in _DbContext.UserAccount
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
			Token = _GenerateSessionToken(),
			ExpiresAt = expiresAt,
			IsImpersonation = true,
			ImpersonatingStaffUserId = staffUserId,
			ImpersonationReason = reason,
			ImpersonationExpiresAt = expiresAt
		};

		await using var tx = await _DbContext.Database.BeginTransactionAsync(cancellationToken);
		await _DbContext.Session.AddAsync(session, cancellationToken);
		_AddAuditEntry(staffUserId, tenantId, reason, durationMinutes);
		await _DbContext.SaveChangesAsync(cancellationToken);
		await tx.CommitAsync(cancellationToken);

		if (_Logger.IsEnabled(LogLevel.Information)) {
			_Logger.LogInformation(
				"Staff user {StaffUserId} started impersonation session for tenant {TenantId}",
				staffUserId,
				tenantId
			);
		}

		return session;
	}

	private void _AddAuditEntry(
		Guid staffUserId,
		Guid tenantId,
		string reason,
		int durationMinutes
	) {
		var httpContext = _HttpContextAccessor.HttpContext;
		var auditLog = AuditLog.CreateEntry(
			userId: staffUserId,
			action: AuditActions.ImpersonationStarted,
			targetId: tenantId,
			details: new {
				Reason = reason,
				Duration = durationMinutes
			},
			ipAddress: httpContext?.Connection.RemoteIpAddress?.ToString(),
			userAgent: httpContext?.Request.Headers.UserAgent.ToString()
		);

		_ = _DbContext.AuditLog.Add(auditLog);
	}

	public async Task<bool> ValidateImpersonationSessionAsync(
		string sessionToken,
		CancellationToken cancellationToken = default
	) {
		var sessionQuery =
			from s in _DbContext.Session
			where s.Token == sessionToken && s.IsImpersonation
			select s;

		var session = await sessionQuery.FirstOrDefaultAsync(cancellationToken);

		return session is not null && session.IsImpersonationValid();
	}

	private static string _GenerateSessionToken() {
		return CryptoUtils.RandomString(32);
	}
}
