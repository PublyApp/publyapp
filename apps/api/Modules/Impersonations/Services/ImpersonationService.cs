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

public record EndImpersonationSessionArgs(
	Guid SessionId,
	Guid EndedByStaffUserId
);

/// <summary>
/// Outcome of ending an impersonation session. <see cref="NotFound"/> means the id is
/// unknown (never existed, or its tombstone aged out after the retention window);
/// <see cref="AlreadyEnded"/> means the session is known to be over — expired (swept, deleted
/// at presentation), revoked (ended, revoke-all) or cascaded away with its user. Every
/// removal of an impersonation row writes the tombstone via a database trigger (#1519).
/// </summary>
public enum ImpersonationEndResult {
	Ended,
	NotFound,
	AlreadyEnded
}

public interface IImpersonationService {
	Task<ImpersonationEndResult> EndImpersonationSessionForStaffAsync(
		EndImpersonationSessionArgs args,
		CancellationToken cancellationToken = default);

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
		this._DbContext = dbContext;
		this._HttpContextAccessor = httpContextAccessor;
		this._Logger = logger;
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
			from ua in this._DbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.Status != AccountStatus.Suspended
			orderby this._DbContext.UserAccountRole.Any(uap =>
				uap.UserAccountId == ua.Id
				&& !uap.Role.IsDeleted
				&& uap.Role.IsFullAccess) descending,
				ua.CreatedAt ascending
			select ua;

		var tenantUserAccount = await tenantAccountQuery.FirstOrDefaultAsync(cancellationToken);

		if (tenantUserAccount is null) {
			throw new InvalidOperationException($"No active user account found for tenant {tenantId}");
		}

		var expiresAt = DateTime.UtcNow.AddMinutes(durationMinutes);

		var session = new Session {
			UserId = tenantUserAccount.UserId,
			Token = ImpersonationService._GenerateSessionToken(),
			ExpiresAt = expiresAt,
			IsImpersonation = true,
			ImpersonatingStaffUserId = staffUserId,
			ImpersonationReason = reason,
			ImpersonationExpiresAt = expiresAt
		};

		await using var tx = await this._DbContext.Database.BeginTransactionAsync(cancellationToken);
		await this._DbContext.Session.AddAsync(session, cancellationToken);
		this._AddAuditEntry(staffUserId, tenantId, reason, durationMinutes);
		await this._DbContext.SaveChangesAsync(cancellationToken);
		await tx.CommitAsync(cancellationToken);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Staff user {StaffUserId} started impersonation session for tenant {TenantId}",
				staffUserId,
				tenantId
			);
		}

		return session;
	}

	public async Task<ImpersonationEndResult> EndImpersonationSessionForStaffAsync(
		EndImpersonationSessionArgs args,
		CancellationToken cancellationToken = default
	) {
		var sessionId = args.SessionId;

		var sessionQuery =
			from s in this._DbContext.Session
			where s.Id == sessionId && s.IsImpersonation
			select s;
		var session = await sessionQuery.FirstOrDefaultAsync(cancellationToken);

		if (session is null) {
			// No live row: the tombstone (written when the session ended, expired or was
			// swept) is the only durable evidence that the id was once a real session.
			var tombstoneQuery =
				from e in this._DbContext.ImpersonationSessionEnd
				where e.SessionId == sessionId
				select e.SessionId;
			var tombstoned = await tombstoneQuery.AnyAsync(cancellationToken);

			return tombstoned
				? ImpersonationEndResult.AlreadyEnded
				: ImpersonationEndResult.NotFound;
		}

		if (!session.IsImpersonationValid()) {
			// Expired but not removed yet: already over; whichever path removes the row
			// later writes the tombstone (trigger).
			return ImpersonationEndResult.AlreadyEnded;
		}

		// Atomic claim: the DELETE is the arbiter between concurrent ends. Whoever
		// removes the row wins and writes the audit row; the loser sees 0 rows and
		// answers AlreadyEnded. The tombstone is written by the sessions delete trigger.
		await using var tx = await this._DbContext.Database.BeginTransactionAsync(cancellationToken);
		var removed = await this._DbContext.Session
			.Where(s => s.Id == sessionId && s.IsImpersonation)
			.ExecuteDeleteAsync(cancellationToken);
		if (removed == 0) {
			return ImpersonationEndResult.AlreadyEnded;
		}

		this._AddEndAuditEntry(args, session);
		await this._DbContext.SaveChangesAsync(cancellationToken);
		await tx.CommitAsync(cancellationToken);

		return ImpersonationEndResult.Ended;
	}

	private void _AddEndAuditEntry(EndImpersonationSessionArgs args, Session session) {
		var httpContext = this._HttpContextAccessor.HttpContext;
		var auditLog = AuditLog.CreateEntry(
			userId: args.EndedByStaffUserId,
			action: AuditActions.ImpersonationEnded,
			targetId: args.SessionId,
			details: new {
				ImpersonatedUserId = session.UserId,
				ImpersonatingStaffUserId = session.ImpersonatingStaffUserId,
				Reason = session.ImpersonationReason
			},
			ipAddress: httpContext?.Connection.RemoteIpAddress?.ToString(),
			userAgent: httpContext?.Request.Headers.UserAgent.ToString()
		);

		_ = this._DbContext.AuditLog.Add(auditLog);
	}

	private void _AddAuditEntry(
		Guid staffUserId,
		Guid tenantId,
		string reason,
		int durationMinutes
	) {
		var httpContext = this._HttpContextAccessor.HttpContext;
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

		_ = this._DbContext.AuditLog.Add(auditLog);
	}

	public async Task<bool> ValidateImpersonationSessionAsync(
		string sessionToken,
		CancellationToken cancellationToken = default
	) {
		var sessionQuery =
			from s in this._DbContext.Session
			where s.Token == sessionToken && s.IsImpersonation
			select s;

		var session = await sessionQuery.FirstOrDefaultAsync(cancellationToken);

		return session is not null && session.IsImpersonationValid();
	}

	private static string _GenerateSessionToken() {
		return CryptoUtils.RandomString(32);
	}
}
