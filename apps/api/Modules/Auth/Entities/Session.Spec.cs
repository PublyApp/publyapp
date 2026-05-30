
using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Entities;

public sealed class SessionSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SessionSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldPhysicallyDeleteWhenRemovedFromDbContext() {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = await dbContext.User.FirstAsync(
			u => u.Email == TestConstants.StaffAdminEmail
		);

		var session = new Session {
			UserId = user.GetRequiredId(),
			Token = $"test-session-{Guid.NewGuid():N}",
			ExpiresAt = DateTime.UtcNow.AddMinutes(15)
		};

		await dbContext.Session.AddAsync(session);
		await dbContext.SaveChangesAsync();

		session.Id.Should().NotBeNull();
		if (session.Id is null) {
			throw new InvalidOperationException("Saved session id was not generated.");
		}

		var sessionId = session.Id.Value;

		dbContext.Session.Remove(session);
		await dbContext.SaveChangesAsync();

		var remainingCount = await dbContext.Session
			.CountAsync(s => s.Id == sessionId);
		remainingCount.Should().Be(0);
	}
}
