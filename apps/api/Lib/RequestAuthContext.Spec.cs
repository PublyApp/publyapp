using FluentAssertions;

using Xunit;

using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib;

/// <summary>
/// Pins the two principal accessors added for #2255: a handler behind the permission filter
/// always has the scope's account, and the accessor is the single place that says so. The
/// thrown message names the middleware to add, because it is the only diagnosis a developer
/// gets from the generic 500 the exception handler maps every InvalidOperationException to.
/// </summary>
public sealed class RequestAuthContextSpec {
	private static RequestAuthContext _NewStaffContext() {
		var context = new RequestAuthContext {
			SessionToken = "session-token",
			UserId = Guid.NewGuid()
		};
		context.AccountStaff = UserAccount.CreateStaffAccount(context.UserId.Value);
		return context;
	}

	private static RequestAuthContext _NewTenantContext() {
		var context = new RequestAuthContext {
			SessionToken = "session-token",
			UserId = Guid.NewGuid()
		};
		context.AccountTenant = UserAccount.CreateTenantAccount(context.UserId.Value, Guid.NewGuid());
		return context;
	}

	[Fact]
	public void ItShouldReturnTheStaffAccountWhenOneIsInTheContext() {
		var context = RequestAuthContextSpec._NewStaffContext();

		UserAccount account = context.GetRequiredStaffAccount();

		account.Should().BeSameAs(context.AccountStaff);
	}

	[Fact]
	public void ItShouldThrowNamingThePermissionMiddlewareWhenTheStaffAccountIsAbsent() {
		var context = new RequestAuthContext();

		Action act = () => context.GetRequiredStaffAccount();

		act.Should()
			.Throw<InvalidOperationException>()
			.Which.Message.Should()
			.Be(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
	}

	[Fact]
	public void ItShouldReturnTheTenantAccountWhenOneIsInTheContext() {
		var context = RequestAuthContextSpec._NewTenantContext();

		UserAccount account = context.GetRequiredTenantAccount();

		account.Should().BeSameAs(context.AccountTenant);
	}

	[Fact]
	public void ItShouldThrowNamingTheTenantPermissionMiddlewareWhenTheTenantAccountIsAbsent() {
		var context = new RequestAuthContext();

		Action act = () => context.GetRequiredTenantAccount();

		act.Should()
			.Throw<InvalidOperationException>()
			.Which.Message.Should()
			.Be(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has .WithTenantPermission(...) middleware."
			);
	}
}
