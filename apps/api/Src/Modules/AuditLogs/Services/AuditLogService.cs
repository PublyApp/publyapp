using System.Text.Json;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.AuditLogs.Entities;

namespace MainApi.Src.Modules.AuditLogs.Services;

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
}

[Service(ServiceLifetime.Scoped)]
public class AuditLogService : IAuditLogService {
	private readonly MainApiDbContext _dbContext;
	private readonly IHttpContextAccessor _httpContextAccessor;
	private readonly ILogger<AuditLogService> _logger;

	public AuditLogService(
		MainApiDbContext dbContext,
		IHttpContextAccessor httpContextAccessor,
		ILogger<AuditLogService> logger
	) {
		_dbContext = dbContext;
		_httpContextAccessor = httpContextAccessor;
		_logger = logger;
	}

	public async Task LogAsync(
		CreateAuditLogArgs args,
		CancellationToken cancellationToken = default
	) {
		var httpContext = _httpContextAccessor.HttpContext;

		var auditLog = new AuditLog {
			UserId = args.UserId,
			Action = args.Action,
			TargetId = args.TargetId,
			Details = args.Details is not null
				? JsonSerializer.Serialize(args.Details)
				: null,
			IpAddress = httpContext?.Connection.RemoteIpAddress?.ToString(),
			UserAgent = httpContext?.Request.Headers.UserAgent.ToString()
		};

		await _dbContext.AuditLog.AddAsync(auditLog, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Audit log created for action {Action} by user {UserId} targeting {TargetId}",
				args.Action,
				args.UserId,
				args.TargetId
			);
		}
	}
}
