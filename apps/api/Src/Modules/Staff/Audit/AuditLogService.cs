using System.Text.Json;
using MainApi.Src.Data.DbContext;

namespace MainApi.Src.Modules.Staff.Audit;

public interface IAuditLogService {
	Task LogAsync(
		Guid userId,
		string action,
		Guid? targetId = null,
		object? details = null,
		CancellationToken cancellationToken = default);
}

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
		Guid userId,
		string action,
		Guid? targetId = null,
		object? details = null,
		CancellationToken cancellationToken = default
	) {
		var httpContext = _httpContextAccessor.HttpContext;

		var auditLog = new AuditLog {
			UserId = userId,
			Action = action,
			TargetId = targetId,
			Details = details is not null ? JsonSerializer.Serialize(details) : null,
			IpAddress = httpContext?.Connection.RemoteIpAddress?.ToString(),
			UserAgent = httpContext?.Request.Headers.UserAgent.ToString()
		};

		await _dbContext.AuditLog.AddAsync(auditLog, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		_logger.LogInformation(
			"Audit log created for action {Action} by user {UserId} targeting {TargetId}",
			action,
			userId,
			targetId
		);
	}
}
