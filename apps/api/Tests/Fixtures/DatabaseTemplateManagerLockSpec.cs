using FluentAssertions;

using Npgsql;

using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Tests.Fixtures;

public sealed class DatabaseTemplateManagerLockSpec {
	[Fact]
	public async Task ItShouldWaitPastTheCommandTimeoutWhileTheTemplateLockIsHeld() {
		var fixture = await PostgresContainerFixture.GetSharedAsync();
		// A 1 s command timeout reproduces the hazard: before the fix the
		// advisory-lock wait inherited it and threw after one second.
		var admin = new NpgsqlConnectionStringBuilder(
			fixture.AdminConnectionString
		) {
			CommandTimeout = 1
		}.ConnectionString;
		var manager = new DatabaseTemplateManager(
			admin,
			fixture.TemplateDbName
		);

		await using var holder = new NpgsqlConnection(admin);
		await holder.OpenAsync();
		await using var waiter = new NpgsqlConnection(admin);
		await waiter.OpenAsync();
		await manager.AcquireLockAsync(holder, exclusive: true, default);

		var acquire = manager.AcquireLockAsync(waiter, exclusive: true, default);
		await Task.Delay(TimeSpan.FromSeconds(2.5));
		acquire.IsCompleted.Should().BeFalse(
			"the lock wait must not inherit the command timeout"
		);

		await manager.ReleaseLockAsync(holder, exclusive: true, default);
		await acquire.WaitAsync(TimeSpan.FromSeconds(15));
	}
}
