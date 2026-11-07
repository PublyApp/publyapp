using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// Seeds tenant members for permission specs. A member created here holds ONLY the
/// permission keys it is given — no seeded role, no full-access role — so a
/// 403 assertion proves the route's permission list rather than the seed data.
/// </summary>
internal static class TenantMemberTestHelper {
	/// <summary>The seeded tenant's id, read straight from the test database.</summary>
	public static async Task<Guid> GetTenantIdAsync(ApiFixture fixture, string tenantName) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await db.Tenant
			.Where(tenant => tenant.Name == tenantName)
			.Select(tenant => tenant.GetRequiredId())
			.SingleAsync();
	}

	/// <summary>
	/// Creates an active, verified member of <paramref name="tenantId"/> with no
	/// full-access role and, when permission keys are given, grants them
	/// through a fresh tenant role (the same role machinery production uses).
	/// Returns the email to log in with.
	/// </summary>
	public static async Task<string> SeedMemberAsync(
		ApiFixture fixture,
		Guid tenantId,
		string[] permissionKeys,
		string emailPrefix = "spec-tenant-member"
	) {
		await using var scope = fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var email = $"{emailPrefix}-{Guid.NewGuid():N}@example.com";
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			IsVerified = true,
			Status = UserStatus.Active,
		};
		await db.User.AddAsync(user);
		await db.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(
			user.GetRequiredId(),
			tenantId
		);
		account.ValidateAccountType();
		await db.UserAccount.AddAsync(account);
		await db.SaveChangesAsync();

		if (permissionKeys.Length == 0) {
			return email;
		}

		var role = Role.CreateTenantRole(
			tenantId,
			$"{emailPrefix}-role-{Guid.NewGuid():N}",
			"Test-only role holding an explicit subset of permissions"
		);
		role.ValidateRoleType();
		await db.Role.AddAsync(role);
		await db.SaveChangesAsync();

		foreach (var permissionKey in permissionKeys) {
			await db.RolePermission.AddAsync(new RolePermission {
				RoleId = role.GetRequiredId(),
				PermissionKey = permissionKey,
			});
		}

		await db.UserAccountRole.AddAsync(new UserAccountRole {
			UserAccountId = account.GetRequiredId(),
			RoleId = role.GetRequiredId(),
		});
		await db.SaveChangesAsync();

		return email;
	}
}
