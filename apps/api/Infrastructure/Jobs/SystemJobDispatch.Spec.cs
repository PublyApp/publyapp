using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Entities;
using PublyApp.Api.Modules.Auth.Jobs;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

public sealed class SystemJobDispatchSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SystemJobDispatchSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldApplySessionCleanupThroughTheWorkerDispatchPath() {
		var marker = $"dispatch-cleanup-{Guid.NewGuid():N}";
		Guid? jobId = null;

		var connectionString = await GetTestConnectionStringAsync();
		var builder = Program.CreateWorkerHostBuilder([]);
		builder.Services.RemoveAll<AppDbContext>();
		builder.Services.RemoveAll<DbContextOptions<AppDbContext>>();
		builder.Services.AddDbContext<AppDbContext>(
			options => options.UseNpgsql(connectionString)
		);
		using var host = builder.Build();

		try {
			await using (var scope = host.Services.CreateAsyncScope()) {
				var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
				var userIdQuery = from user in dbContext.User
													where user.Email == TestConstants.StaffAdminEmail
													select user.Id;
				var userId = await userIdQuery.SingleAsync();

				if (userId is null) {
					throw new InvalidOperationException("Seed staff user id was null.");
				}

				dbContext.Session.Add(new Session {
					UserId = userId.Value,
					Token = marker,
					ExpiresAt = DateTime.UtcNow.AddMinutes(-5),
				});
				await dbContext.SaveChangesAsync();

				var enqueuer = scope.ServiceProvider.GetRequiredService<IJobEnqueuer>();
				jobId = await enqueuer.EnqueueAsync(
					new JobDefinition<EmptySystemJobPayload> {
						JobType = CleanupExpiredSessionsHandler.JobKey,
						Priority = 1000,
					},
					new EmptySystemJobPayload()
				);
			}

			var processor = host.Services
				.GetServices<IHostedService>()
				.OfType<JobQueueProcessor>()
				.Single();
			var result = await processor.ProcessBatchAsync(CancellationToken.None);

			result.Dispatched.Should().BeGreaterThan(0);
			result.Completed.Should().BeGreaterThan(0);

			await using var verifyScope = host.Services.CreateAsyncScope();
			var verifyContext = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
			(await verifyContext.Session.AnyAsync(session => session.Token == marker))
				.Should().BeFalse("the registered cleanup handler must run");
			(await verifyContext.JobQueue.AnyAsync(job => job.Id == jobId))
				.Should().BeFalse("the successful outcome must remove the claimed queue row");
		} finally {
			await using var cleanupScope = host.Services.CreateAsyncScope();
			var cleanupContext = cleanupScope.ServiceProvider.GetRequiredService<AppDbContext>();
			var sessions = from session in cleanupContext.Session
										 where session.Token == marker
										 select session;
			await sessions.ExecuteDeleteAsync();

			if (jobId is not null) {
				var jobs = from job in cleanupContext.JobQueue
									 where job.Id == jobId
									 select job;
				await jobs.ExecuteDeleteAsync();
			}
		}
	}

	private async Task<string> GetTestConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return connectionString;
	}

	private sealed record EmptySystemJobPayload;
}
