using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.Users.Entities;

public sealed class UserSpec {
	[Fact]
	public void ItShouldDefaultToSuspendedWhenStatusIsNotExplicitlyAssigned() {
		var user = new User {
			Email = "default-status@example.com",
			Password = "hashed-password",
		};

		user.Status.Should().Be(UserStatus.Suspended);
	}
}
