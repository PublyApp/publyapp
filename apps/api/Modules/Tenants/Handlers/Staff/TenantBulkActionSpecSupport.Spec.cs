
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

internal static class TenantBulkActionSpecSupport {
	public static string GetBulkSuspendUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.BulkSuspend
		);
	}

	public static string GetBulkReactivateUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.BulkReactivate
		);
	}

	public static string GetBulkDeleteUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.BulkDelete
		);
	}

	public static HttpRequestMessage CreateJsonRequest(
		string url,
		string? sessionToken,
		object body
	) {
		var request = CreateRequest(url, sessionToken);
		request.Content = JsonContent.Create(body);

		return request;
	}

	public static HttpRequestMessage CreateRawJsonRequest(
		string url,
		string? sessionToken,
		string body
	) {
		var request = CreateRequest(url, sessionToken);
		request.Content = new StringContent(
			body,
			Encoding.UTF8,
			"application/json"
		);

		return request;
	}

	public static async Task<SeededTenantSnapshot> SeedTenantAsync(
		ApiFixture fixture,
		string namePrefix,
		TenantStatus status
	) {
		await using var scope =
			fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = 10,
		};

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return new SeededTenantSnapshot(
			TenantId: tenant.GetRequiredId(),
			Name: tenant.Name
		);
	}

	public static async Task<Tenant?> GetTenantIgnoringFiltersAsync(
		ApiFixture fixture,
		Guid tenantId
	) {
		await using var scope =
			fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from tenant in dbContext.Tenant.IgnoreQueryFilters()
			where tenant.Id == tenantId
			select tenant;

		return await query.FirstOrDefaultAsync();
	}

	public static async Task<List<AuditLog>> GetAuditLogsAsync(
		ApiFixture fixture,
		string action,
		Guid actorUserId,
		DateTime startedAt
	) {
		await using var scope =
			fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from log in dbContext.AuditLog
			where log.Action == action
				&& log.UserId == actorUserId
				&& log.CreatedAt >= startedAt
			orderby log.CreatedAt
			select log;

		return await query.ToListAsync();
	}

	public static async Task<string> CreateStaffUserTokenWithoutPermissionAsync(
		ApiFixture fixture,
		TestAuthClient authClient,
		string emailPrefix
	) {
		var email = $"{emailPrefix}-{Guid.NewGuid():N}@example.com";
		await StaffUserTestHelper.SeedStaffUserAsync(
			fixture,
			email
		);

		return await authClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	public static async Task<string> CreateStaffUserTokenWithPermissionAsync(
		ApiFixture fixture,
		TestAuthClient authClient,
		string emailPrefix,
		string permissionKey
	) {
		var email = $"{emailPrefix}-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			fixture,
			email
		);

		await using var scope =
			fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var staffAccountQuery =
			from account in dbContext.UserAccount
			where account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account;
		var staffAccount =
			await staffAccountQuery.FirstAsync();

		var profile = Profile.CreateStaffProfile(
			$"{emailPrefix}-permission-{Guid.NewGuid():N}",
			"Test-only staff profile for tenant bulk action permissions"
		);

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		await dbContext.ProfilePermission.AddAsync(
			new ProfilePermission {
				ProfileId = profile.GetRequiredId(),
				PermissionKey = permissionKey,
			}
		);
		await dbContext.UserAccountProfile.AddAsync(
			new UserAccountProfile {
				UserAccountId = staffAccount.GetRequiredId(),
				ProfileId = profile.GetRequiredId(),
			}
		);
		await dbContext.SaveChangesAsync();

		return await authClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	public static void AssertAuditDetails(
		AuditLog auditLog,
		int expectedCount,
		int expectedFailedCount,
		string? expectedReason = null
	) {
		auditLog.Details.Should().NotBeNull();
		if (auditLog.Details is null) {
			throw new InvalidOperationException(
				"Bulk tenant audit log details were empty."
			);
		}

		using var document = JsonDocument.Parse(
			auditLog.Details
		);
		var details = document.RootElement;

		details.GetProperty("Count").GetInt32()
			.Should().Be(expectedCount);
		details.GetProperty("FailedCount").GetInt32()
			.Should().Be(expectedFailedCount);

		if (expectedReason is not null) {
			details.GetProperty("Reason").GetString()
				.Should().Be(expectedReason);
		}
	}

	private static HttpRequestMessage CreateRequest(
		string url,
		string? sessionToken
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		);

		if (!string.IsNullOrWhiteSpace(sessionToken)) {
			request = request.WithSessionToken(sessionToken);
		}

		return request;
	}
}

internal sealed record SeededTenantSnapshot(
	Guid TenantId,
	string Name
);

internal sealed record BulkTenantActionResponse {
	public int SucceededCount { get; init; }
	public int FailedCount { get; init; }
	public List<BulkTenantFailedItem> FailedItems { get; init; } = [];
}

internal sealed record BulkTenantFailedItem {
	public Guid TenantId { get; init; }
	public string Error { get; init; } = string.Empty;
}

internal static class BulkTenantIdJsonFactory {
	public static string CreateTooManyTenantIdsJson() {
		var builder = new StringBuilder();

		for (var i = 0; i < 101; i++) {
			if (i > 0) {
				builder.Append(',');
			}

			builder.Append('"');
			builder.Append(Guid.NewGuid());
			builder.Append('"');
		}

		return builder.ToString();
	}
}
