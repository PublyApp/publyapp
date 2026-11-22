using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib.Testing.Helpers;

internal static class StaffUserTestHelper {
	/// <param name="fullAccess">
	/// When true the account is granted the staff full-access system role — the
	/// replacement for the removed per-account admin level.
	/// </param>
	public static async Task<Guid> SeedStaffUserAsync(
		ApiFixture fixture,
		string email,
		string firstName = "Staff",
		string lastName = "User",
		bool fullAccess = false,
		UserStatus status = UserStatus.Active
	) {
		using var scope = fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = firstName,
			LastName = lastName,
			Status = status,
			IsVerified = true,
		};

		_ = await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		// Direct seeding replaces the now-unmapped create endpoint in integration tests.
		var staffAccount = UserAccount.CreateStaffAccount(user.GetRequiredId());
		_ = await dbContext.UserAccount.AddAsync(staffAccount);
		await dbContext.SaveChangesAsync();

		if (fullAccess) {
			var roleId = await FullAccessRoleTestHelper.EnsureStaffRoleAsync(dbContext);
			await FullAccessRoleTestHelper.AssignAsync(
				dbContext,
				staffAccount.GetRequiredId(),
				roleId
			);
		}

		return user.GetRequiredId();
	}

	/// <summary>
	/// Returns the id of the first staff-scoped role, ordered by name.
	/// </summary>
	public static async Task<Guid> GetAnyStaffRoleIdAsync(ApiFixture fixture) {
		using IServiceScope scope = fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Role role = await dbContext.Role
			.Where(role =>
				role.Scope == RoleScope.Staff
				&& !role.IsDeleted
			)
			.OrderBy(role => role.Name)
			.FirstAsync();

		return role.GetRequiredId();
	}

	/// <summary>
	/// Resolves a non-deleted user id by email from the given context.
	/// </summary>
	public static async Task<Guid> GetUserIdByEmailAsync(
		AppDbContext dbContext,
		string email
	) {
		var userId = await (
			from user in dbContext.User
			where user.Email == email
				&& !user.IsDeleted
			select user.Id
		).FirstOrDefaultAsync();

		if (userId is null) {
			throw new InvalidOperationException("Seeded user was not found.");
		}

		return userId.Value;
	}

	/// <summary>
	/// Seeds a staff user with no roles and returns its session token.
	/// </summary>
	public static async Task<string> CreateUnprivilegedStaffUserTokenAsync(
		ApiFixture fixture,
		TestAuthClient authClient
	) {
		var email = $"no-perms-{Guid.NewGuid():N}@example.com";

		await using var db = fixture.OpenDb();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "User",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = db.Context.User.Add(user);
		_ = await db.Context.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId);
		staffAccount.ValidateAccountType();
		_ = db.Context.UserAccount.Add(staffAccount);
		_ = await db.Context.SaveChangesAsync();

		return await authClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	/// <summary>Sets a staff user's status directly, bypassing the API.</summary>
	public static async Task SetStaffUserStatusAsync(
		AppDbContext dbContext,
		Guid userId,
		UserStatus status,
		CancellationToken cancellationToken
	) {
		_ = await dbContext.User
			.Where(x => x.Id == userId && !x.IsDeleted)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, status)
					.SetProperty(x => x.UpdatedAt, DateTime.UtcNow),
				cancellationToken
			);
	}

	/// <summary>Seeds a plain verified user and returns its id.</summary>
	public static async Task<Guid> SeedUserAsync(AppDbContext db) {
		var user = new User {
			Email = $"inviter-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}
}
