using System.Text.Json;

using MainApi.Data.DbContext;
using MainApi.Lib.DI;
using MainApi.Modules.AuditLogs.Entities;

namespace MainApi.Modules.AuditLogs.Services;

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
		var auditLog = BuildAuditLog(args);

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

	public async Task LogManyAsync(
		IReadOnlyCollection<CreateAuditLogArgs> argsList,
		CancellationToken cancellationToken = default
	) {
		if (argsList.Count == 0) {
			return;
		}

		var auditLogs = argsList.Select(BuildAuditLog).ToList();

		await _dbContext.AuditLog.AddRangeAsync(auditLogs, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Audit log batch of {Count} entries created",
				argsList.Count
			);
		}
	}

	private AuditLog BuildAuditLog(CreateAuditLogArgs args) {
		var httpContext = _httpContextAccessor.HttpContext;

		return new AuditLog {
			UserId = args.UserId,
			Action = args.Action,
			TargetId = args.TargetId,
			Details = args.Details is not null
				? JsonSerializer.Serialize(args.Details)
				: null,
			IpAddress = httpContext?.Connection.RemoteIpAddress?.ToString(),
			UserAgent = httpContext?.Request.Headers.UserAgent.ToString()
		};
	}
}
