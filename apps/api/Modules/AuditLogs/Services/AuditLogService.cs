using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.AuditLogs.Entities;

namespace PublyApp.Api.Modules.AuditLogs.Services;

public record CreateAuditLogArgs(
	Guid UserId,
	string Action,
	Guid? TargetId = null,
	object? Details = null
);

public interface IAuditLogService {
	Task LogAsync(
		CreateAuditLogArgs args,
		CancellationToken cancellationToken = default);

	Task LogManyAsync(
		IReadOnlyCollection<CreateAuditLogArgs> argsList,
		CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public class AuditLogService : IAuditLogService {
	private readonly AppDbContext _DbContext;
	private readonly IHttpContextAccessor _HttpContextAccessor;
	private readonly ILogger<AuditLogService> _Logger;

	public AuditLogService(
		AppDbContext dbContext,
		IHttpContextAccessor httpContextAccessor,
		ILogger<AuditLogService> logger
	) {
		this._DbContext = dbContext;
		this._HttpContextAccessor = httpContextAccessor;
		this._Logger = logger;
	}

	public async Task LogAsync(
		CreateAuditLogArgs args,
		CancellationToken cancellationToken = default
	) {
		var auditLog = this._BuildAuditLog(args);

		await this._DbContext.AuditLog.AddAsync(auditLog, cancellationToken);
		await this._DbContext.SaveChangesAsync(cancellationToken);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Audit log created for action {Action} by user {UserId} targeting {TargetId}",
				args.Action,
				args.UserId,
				args.TargetId
			);
		}
	}

	public async Task LogManyAsync(
		IReadOnlyCollection<CreateAuditLogArgs> argsList,
		CancellationToken cancellationToken = default
	) {
		if (argsList.Count == 0) {
			return;
		}

		var auditLogs = argsList.Select(this._BuildAuditLog).ToList();

		await this._DbContext.AuditLog.AddRangeAsync(auditLogs, cancellationToken);
		await this._DbContext.SaveChangesAsync(cancellationToken);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Audit log batch of {Count} entries created",
				argsList.Count
			);
		}
	}

	private AuditLog _BuildAuditLog(CreateAuditLogArgs args) {
		var httpContext = this._HttpContextAccessor.HttpContext;

		return AuditLog.CreateEntry(
			args.UserId,
			args.Action,
			args.TargetId,
			args.Details,
			httpContext?.Connection.RemoteIpAddress?.ToString(),
			httpContext?.Request.Headers.UserAgent.ToString()
		);
	}
}
