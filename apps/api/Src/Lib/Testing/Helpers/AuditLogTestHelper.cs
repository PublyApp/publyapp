namespace MainApi.Src.Lib.Testing.Helpers;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

internal static class AuditLogTestHelper {
	private static readonly string FindUrl =
		PathUtils.Join(
			Routes.Staff.Root,
			Routes.AuditLogs.ForStaff.Root,
			Routes.AuditLogs.ForStaff.Find
		);

	private static readonly string ActionsUrl =
		PathUtils.Join(
			Routes.Staff.Root,
			Routes.AuditLogs.ForStaff.Root,
			Routes.AuditLogs.ForStaff.Actions
		);

	private static readonly string ExportUrl =
		PathUtils.Join(
			Routes.Staff.Root,
			Routes.AuditLogs.ForStaff.Root,
			Routes.AuditLogs.ForStaff.Export
		);

	public static async Task<Guid> SeedAuditLogAsync(
		MainApiFactory factory,
		Guid userId,
		string action,
		Guid? targetId = null,
		string? details = null,
		string? ipAddress = "127.0.0.1",
		string? userAgent = "test-agent",
		CancellationToken ct = default
	) {
		using var scope =
			factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var log = new AuditLog {
			UserId = userId,
			Action = action,
			TargetId = targetId,
			Details = details,
			IpAddress = ipAddress,
			UserAgent = userAgent
		};

		await dbContext.AuditLog.AddAsync(log, ct);
		await dbContext.SaveChangesAsync(ct);

		return log.GetRequiredId();
	}

	public static async Task<Guid>
		GetUserIdByEmailAsync(
		MainApiFactory factory,
		string email,
		CancellationToken ct = default
	) {
		using var scope =
			factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var user = await dbContext.User
			.Where(u => u.Email == email.ToLower()
				&& u.IsDeleted == false)
			.Select(u => new {
				Id = u.Id ?? Guid.Empty
			})
			.FirstOrDefaultAsync(ct);

		if (user is null) {
			throw new InvalidOperationException(
				$"User not found: {email}"
			);
		}
		return user.Id;
	}

	public static string GetFindUrl(
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null,
		string? userId = null,
		string? action = null,
		string? targetId = null,
		string? startDate = null,
		string? endDate = null
	) {
		var queryParams = new List<string>();

		if (cursor is not null) {
			queryParams.Add($"cursor={cursor}");
		}
		if (limit.HasValue) {
			queryParams.Add($"limit={limit.Value}");
		}
		if (sortId is not null) {
			queryParams.Add($"sort_id={sortId}");
		}
		if (sortOrder is not null) {
			queryParams.Add(
				$"sort_order={sortOrder}"
			);
		}
		if (userId is not null) {
			queryParams.Add($"userId={userId}");
		}
		if (action is not null) {
			queryParams.Add($"action={action}");
		}
		if (targetId is not null) {
			queryParams.Add($"targetId={targetId}");
		}
		if (startDate is not null) {
			queryParams.Add(
				$"startDate={startDate}"
			);
		}
		if (endDate is not null) {
			queryParams.Add($"endDate={endDate}");
		}

		if (queryParams.Count == 0) {
			return FindUrl;
		}

		return FindUrl
			+ "?"
			+ string.Join("&", queryParams);
	}

	public static string GetDetailUrl(Guid logId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.AuditLogs.ForStaff.Root,
			Routes.AuditLogs.ForStaff.GetByIdFn(
				logId.ToString()
			)
		);
	}

	public static string GetActionsUrl() {
		return ActionsUrl;
	}

	public static string GetExportUrl(
		string format,
		string? userId = null,
		string? action = null,
		string? targetId = null,
		string? startDate = null,
		string? endDate = null
	) {
		var queryParams = new List<string> {
			$"format={format}"
		};

		if (userId is not null) {
			queryParams.Add($"userId={userId}");
		}
		if (action is not null) {
			queryParams.Add($"action={action}");
		}
		if (targetId is not null) {
			queryParams.Add($"targetId={targetId}");
		}
		if (startDate is not null) {
			queryParams.Add(
				$"startDate={startDate}"
			);
		}
		if (endDate is not null) {
			queryParams.Add($"endDate={endDate}");
		}

		return ExportUrl
			+ "?"
			+ string.Join("&", queryParams);
	}
}
