using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.Extensions.DependencyInjection;

namespace MainApi.Src.Lib.Testing.Helpers;

internal static class StaffUserTestHelper {
	public static async Task<Guid> SeedStaffUserAsync(
		ApiFixture fixture,
		string email,
		string firstName = "Staff",
		string lastName = "User",
		AccountLevel accountLevel = AccountLevel.User,
		UserStatus status = UserStatus.Active
	) {
		using var scope = fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

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
		var staffAccount = UserAccount.CreateStaffAccount(
			user.GetRequiredId(),
			accountLevel
		);
		_ = await dbContext.UserAccount.AddAsync(staffAccount);
		await dbContext.SaveChangesAsync();

		return user.GetRequiredId();
	}
}
