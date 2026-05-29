
using MainApi.Data.DbContext;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Utils;
using MainApi.Modules.AuditLogs.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using AppRoutes = MainApi.Lib.Routes.Routes;

namespace MainApi.Lib.Testing.Helpers;

internal static class AuditLogTestHelper {
	private static readonly string FindUrl =
		PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.AuditLogs.ForStaff.Root,
			AppRoutes.AuditLogs.ForStaff.Find
		);

	private static readonly string ActionsUrl =
		PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.AuditLogs.ForStaff.Root,
			AppRoutes.AuditLogs.ForStaff.Actions
		);

	private static readonly string ExportUrl =
		PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.AuditLogs.ForStaff.Root,
			AppRoutes.AuditLogs.ForStaff.Export
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

		// Compare emails in memory to avoid ToLower in query
		// expressions; this helper is test-only and operates on
		// seeded test users.
		var users = await (
			from dbUser in dbContext.User
			where !dbUser.IsDeleted
			select new {
				Id = dbUser.Id ?? Guid.Empty,
				dbUser.Email
			}
		).ToListAsync(ct);

		var user = users.FirstOrDefault(u =>
			string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase)
		);

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
		IReadOnlyList<string>? actions = null,
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
			queryParams.Add($"user_id={userId}");
		}
		if (actions is not null && actions.Count > 0) {
			var csv = string.Join(
				",",
				actions.Select(Uri.EscapeDataString)
			);
			queryParams.Add($"actions={csv}");
		}
		if (targetId is not null) {
			queryParams.Add($"target_id={targetId}");
		}
		if (startDate is not null) {
			queryParams.Add(
				$"start_date={startDate}"
			);
		}
		if (endDate is not null) {
			queryParams.Add($"end_date={endDate}");
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
			AppRoutes.Staff.Root,
			AppRoutes.AuditLogs.ForStaff.Root,
			AppRoutes.AuditLogs.ForStaff.GetByIdFn(
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
		IReadOnlyList<string>? actions = null,
		string? targetId = null,
		string? startDate = null,
		string? endDate = null
	) {
		var queryParams = new List<string> {
			$"format={format}"
		};

		if (userId is not null) {
			queryParams.Add($"user_id={userId}");
		}
		if (actions is not null && actions.Count > 0) {
			var csv = string.Join(
				",",
				actions.Select(Uri.EscapeDataString)
			);
			queryParams.Add($"actions={csv}");
		}
		if (targetId is not null) {
			queryParams.Add($"target_id={targetId}");
		}
		if (startDate is not null) {
			queryParams.Add(
				$"start_date={startDate}"
			);
		}
		if (endDate is not null) {
			queryParams.Add($"end_date={endDate}");
		}

		return ExportUrl
			+ "?"
			+ string.Join("&", queryParams);
	}
}
