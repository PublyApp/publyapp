
using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Entities;

public sealed class SessionSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public SessionSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldPhysicallyDeleteWhenRemovedFromDbContext() {
		await using var db = this._Fixture.OpenDb();

		var user = await db.Context.User.FirstAsync(
			u => u.Email == TestConstants.StaffAdminEmail
		);

		var session = new Session {
			UserId = user.GetRequiredId(),
			Token = $"test-session-{Guid.NewGuid():N}",
			ExpiresAt = DateTime.UtcNow.AddMinutes(15)
		};

		await db.Context.Session.AddAsync(session);
		await db.Context.SaveChangesAsync();

		session.Id.Should().NotBeNull();
		if (session.Id is null) {
			throw new InvalidOperationException("Saved session id was not generated.");
		}

		var sessionId = session.Id.Value;

		db.Context.Session.Remove(session);
		await db.Context.SaveChangesAsync();

		var remainingCount = await db.Context.Session
			.CountAsync(s => s.Id == sessionId);
		remainingCount.Should().Be(0);
	}
}
