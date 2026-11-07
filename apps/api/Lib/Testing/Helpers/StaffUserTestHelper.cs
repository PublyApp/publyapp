using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Utils;
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
}
