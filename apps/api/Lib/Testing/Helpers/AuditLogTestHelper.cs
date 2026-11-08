
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.AuditLogs.Entities;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Lib.Testing.Helpers;

internal static class AuditLogTestHelper {
	private static readonly string _FindUrl =
		PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.AuditLogs.ForStaff.Root,
			AppRoutes.AuditLogs.ForStaff.Find
		);

	private static readonly string _ActionsUrl =
		PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.AuditLogs.ForStaff.Root,
			AppRoutes.AuditLogs.ForStaff.Actions
		);

	private static readonly string _ExportUrl =
		PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.AuditLogs.ForStaff.Root,
			AppRoutes.AuditLogs.ForStaff.Export
		);

	public static async Task<Guid> SeedAuditLogAsync(
		ApiFactory factory,
		Guid userId,
		string action,
		Guid? targetId = null,
		string? details = null,
		string? ipAddress = "127.0.0.1",
		string? userAgent = "test-agent",
		DateTime? createdAt = null,
		CancellationToken ct = default
	) {
		using var scope =
			factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

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

		var id = log.GetRequiredId();

		// SaveChanges stamps CreatedAt with "now"; a period-scoped spec needs
		// a historical row, so backdate it with an update (which the audit
		// stamping override does not rewrite).
		if (createdAt.HasValue) {
			await dbContext.AuditLog
				.Where(auditLog => auditLog.Id == id)
				.ExecuteUpdateAsync(
					setters => setters.SetProperty(
						auditLog => auditLog.CreatedAt,
						createdAt.Value
					),
					ct
				);
		}

		return id;
	}

	public static async Task<Guid>
		GetUserIdByEmailAsync(
		ApiFactory factory,
		string email,
		CancellationToken ct = default
	) {
		using var scope =
			factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

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
			return AuditLogTestHelper._FindUrl;
		}

		return AuditLogTestHelper._FindUrl
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
		return AuditLogTestHelper._ActionsUrl;
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

		return AuditLogTestHelper._ExportUrl
			+ "?"
			+ string.Join("&", queryParams);
	}
}
