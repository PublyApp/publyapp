using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Messaging.Jobs;

// Processor-dispatch sibling of EmailJobHandlersSpec: these two tests drive the
// production JobHandlerRegistry, which resolves IEmailSender through DI rather than
// taking a locally constructed ControllableSender — so they must observe the
// DI-registered FakeEmailSender. xUnit instantiates a test class fresh per test method;
// because this class owns its ApiFixture directly (constructed here, not injected via
// IClassFixture), each method gets its own DI container and its own FakeEmailSender.
// Neither test needs to Clear() it, and neither depends on the other having run first
// or not at all. See docs/guides/api-integration-tests.md ("Fixture Lifecycle and
// Mutable Test State").
public sealed class EmailJobHandlersDispatchSpec : IAsyncLifetime {
	private readonly ApiFixture _Fixture = new();

	public Task InitializeAsync() {
		return _Fixture.InitializeAsync();
	}

	public Task DisposeAsync() {
		return _Fixture.DisposeAsync();
	}

	[Fact]
	public async Task ItShouldDispatchSubmittedEmailThroughTheRegisteredProcessor() {
		var (invitationId, _) = await _SeedStaffInvitationAsync();
		var jobId = await _SeedQueuedStaffInvitationAsync(invitationId);
		var sender = _Fixture.GetFakeEmailSender();

		var result = await _CreateProcessor().ProcessBatchAsync(CancellationToken.None);

		result.Should().Be(new JobQueueProcessor.BatchResult(1, 1, 1, true));
		sender.Sends.Should().ContainSingle(send =>
			send.IdempotencyKey == jobId.ToString("N")
		);

		await using var assertDb = _CreateDbContext();
		(await assertDb.JobQueue.AsNoTracking().AnyAsync(job => job.Id == jobId))
			.Should().BeFalse();
		var log = await assertDb.EmailLog.AsNoTracking()
			.SingleAsync(entry => entry.JobId == jobId);
		log.Outcome.Should().Be(EmailLogOutcome.Submitted);
		(await assertDb.EmailPreparedSend.AsNoTracking().AnyAsync(send => send.JobId == jobId))
			.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldDispatchPermanentEmailFailureThroughTheRegisteredProcessor() {
		var (invitationId, _) = await _SeedStaffInvitationAsync();
		var jobId = await _SeedQueuedStaffInvitationAsync(invitationId);
		var sender = _Fixture.GetFakeEmailSender();
		sender.FailWith = _ => new EmailProviderPermanentException("provider_rejected:422");

		var result = await _CreateProcessor().ProcessBatchAsync(CancellationToken.None);

		result.Should().Be(new JobQueueProcessor.BatchResult(1, 1, 1, true));
		sender.Sends.Should().BeEmpty();

		await using var assertDb = _CreateDbContext();
		(await assertDb.JobQueue.AsNoTracking().AnyAsync(job => job.Id == jobId))
			.Should().BeFalse();
		(await assertDb.JobDeadLetter.AsNoTracking()
			.AnyAsync(deadLetter => deadLetter.OriginalJobId == jobId))
			.Should().BeTrue();
		var log = await assertDb.EmailLog.AsNoTracking()
			.SingleAsync(entry => entry.JobId == jobId);
		log.Outcome.Should().Be(EmailLogOutcome.PermanentlyFailed);
		(await assertDb.EmailPreparedSend.AsNoTracking().AnyAsync(send => send.JobId == jobId))
			.Should().BeFalse();
	}

	private JobQueueProcessor _CreateProcessor() {
		var instance = new JobWorkerInstance();

		return new JobQueueProcessor(
			_Fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			_Fixture.Factory.Services.GetRequiredService<JobHandlerRegistry>(),
			new JobsMetrics(instance, NullLogger<JobsMetrics>.Instance),
			instance,
			NullLogger<JobQueueProcessor>.Instance,
			null,
			new JobQueueProcessorOptions {
				BatchSize = 1,
				LeaseSeconds = 60
			}
		);
	}

	private async Task<(Guid InvitationId, string Token)> _SeedStaffInvitationAsync() {
		var token = $"tok-{Guid.NewGuid():N}";
		await using var db = _CreateDbContext();
		var invitedBy = await _SeedUserInAsync(db);
		var invitation = Invitation.CreateStaffInvitationWithProfiles(
			$"invitee-{Guid.NewGuid():N}@example.com",
			new List<Guid>(),
			invitedBy,
			DateTime.UtcNow.AddDays(7),
			token
		);
		invitation.ValidateInvitationType();
		db.Invitation.Add(invitation);
		await db.SaveChangesAsync();
		return (invitation.GetRequiredId(), token);
	}

	private async Task<Guid> _SeedQueuedStaffInvitationAsync(Guid invitationId) {
		await using var db = _CreateDbContext();
		var job = new JobQueueItem {
			JobType = InvitationEmailJobs.StaffInvitationV1.JobType,
			Payload = $"{{\"invitationId\":\"{invitationId}\"}}",
			Priority = 1000,
			MaxAttempts = 10
		};
		db.JobQueue.Add(job);
		await db.SaveChangesAsync();

		if (job.Id is null) {
			throw new InvalidOperationException("job_queue insert did not populate the id.");
		}

		return job.Id.Value;
	}

	private static async Task<Guid> _SeedUserInAsync(AppDbContext db) {
		var user = new User {
			Email = $"inviter-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private AppDbContext _CreateDbContext() {
		using var scope = _Fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}
}
