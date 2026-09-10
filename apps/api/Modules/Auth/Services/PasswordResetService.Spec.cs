using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Messaging.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Services;

// #809 (design §5.4/F6): PasswordResetService owns ONE transaction for token reuse/issue
// + the email.password-reset.v1 enqueue. These specs drive the service directly and
// assert the enqueue + token persistence (durability), the constant-shape no-ops, and
// token reuse — the transactional atomicity means both the token and the job commit
// together or not at all.
public sealed class PasswordResetServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public PasswordResetServiceSpec(ApiFixture fixture) {
		_Fixture = fixture;
	}

	[Fact]
	public async Task ItShouldEnqueueResetJobAndPersistTokenWhenUserIsVerified() {
		var email = $"reset-{Guid.NewGuid():N}@example.com";
		var userId = await _SeedUserAsync(email, verified: true);

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider.GetRequiredService<IPasswordResetService>();
		await service.RequestAsync(email, CancellationToken.None);

		await using var db = _CreateDbContext();

		var user = await db.User.AsNoTracking().FirstAsync(u => u.Id == userId);
		user.PasswordResetToken.Should().NotBeNullOrEmpty();
		user.PasswordResetTokenExpiresAt.Should().NotBeNull();

		var jobs = await _ResetJobsForUserAsync(db, userId);
		jobs.Should().HaveCount(1);
	}

	[Fact]
	public async Task ItShouldReuseLiveTokenAndStillEnqueueWhenTokenNotExpired() {
		var email = $"reset-{Guid.NewGuid():N}@example.com";
		var userId = await _SeedUserAsync(email, verified: true);

		var liveToken = "existing-live-token";
		await using (var seed = _CreateDbContext()) {
			var user = await seed.User.FirstAsync(u => u.Id == userId);
			user.PasswordResetToken = liveToken;
			user.PasswordResetTokenExpiresAt = DateTime.UtcNow.AddHours(1);
			await seed.SaveChangesAsync();
		}

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider.GetRequiredService<IPasswordResetService>();
		await service.RequestAsync(email, CancellationToken.None);

		await using var db = _CreateDbContext();
		var reloaded = await db.User.AsNoTracking().FirstAsync(u => u.Id == userId);
		reloaded.PasswordResetToken.Should().Be(liveToken, "a still-live token is reused, not rotated");

		var jobs = await _ResetJobsForUserAsync(db, userId);
		jobs.Should().HaveCount(1);
	}

	[Fact]
	public async Task ItShouldNotEnqueueWhenUserIsUnverified() {
		var email = $"reset-{Guid.NewGuid():N}@example.com";
		var userId = await _SeedUserAsync(email, verified: false);

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider.GetRequiredService<IPasswordResetService>();
		await service.RequestAsync(email, CancellationToken.None);

		await using var db = _CreateDbContext();
		var user = await db.User.AsNoTracking().FirstAsync(u => u.Id == userId);
		user.PasswordResetToken.Should().BeNull();
		(await _ResetJobsForUserAsync(db, userId)).Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldNotEnqueueWhenUserDoesNotExist() {
		var email = $"missing-{Guid.NewGuid():N}@example.com";

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider.GetRequiredService<IPasswordResetService>();

		// A missing user is a committed no-op — no throw, no enumeration signal.
		var act = async () => await service.RequestAsync(email, CancellationToken.None);
		await act.Should().NotThrowAsync();
	}

	[Fact]
	public async Task ItShouldRollBackTokenIssuanceWhenEnqueueFails() {
		// Direction (a): the enqueue is the LAST write in the single transaction. If it
		// throws, the whole unit of work rolls back — the freshly-issued token is never
		// persisted and no job row exists. Proven with a real transaction (a poisoned
		// enqueuer that throws), not a mock verification.
		var email = $"reset-{Guid.NewGuid():N}@example.com";
		var userId = await _SeedUserAsync(email, verified: true);

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var service = new PasswordResetService(db, new ThrowingEnqueuer());

		var act = async () => await service.RequestAsync(email, CancellationToken.None);
		await act.Should().ThrowAsync<InvalidOperationException>();

		await using var verify = _CreateDbContext();
		var user = await verify.User.AsNoTracking().FirstAsync(u => u.Id == userId);
		user.PasswordResetToken.Should().BeNull("the enqueue failure rolls the token issuance back");
		user.PasswordResetTokenExpiresAt.Should().BeNull();
		(await _ResetJobsForUserAsync(verify, userId)).Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldLeaveNoJobRowWhenTheOperationFailsAfterEnqueue() {
		// Direction (b): a REAL enqueue stages a job row inside the transaction (its
		// SaveChanges flushes it), then a post-enqueue failure aborts the same transaction.
		// The job row must not survive — proving the enqueue truly joined the caller's
		// transaction rather than committing independently.
		var email = $"reset-{Guid.NewGuid():N}@example.com";
		var userId = await _SeedUserAsync(email, verified: true);

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var realEnqueuer = scope.ServiceProvider.GetRequiredService<IJobEnqueuer>();
		var service = new PasswordResetService(db, new ThrowAfterEnqueue(realEnqueuer));

		var act = async () => await service.RequestAsync(email, CancellationToken.None);
		await act.Should().ThrowAsync<InvalidOperationException>();

		await using var verify = _CreateDbContext();
		(await _ResetJobsForUserAsync(verify, userId))
			.Should().BeEmpty("the post-enqueue failure rolls the staged job row back");
		var user = await verify.User.AsNoTracking().FirstAsync(u => u.Id == userId);
		user.PasswordResetToken.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldSerializeConcurrentRequestsBeforeChoosingTheResetToken() {
		var email = $"reset-{Guid.NewGuid():N}@example.com";
		var userId = await _SeedUserAsync(email, verified: true);
		var secondAppName = $"password-reset-race-{Guid.NewGuid():N}";

		await using var firstDb = _CreateDbContext("password-reset-race-first");
		await using var secondDb = _CreateDbContext(secondAppName);
		var firstGate = new GatedEnqueuer(
			new JobEnqueuer(firstDb, new RequestAuthContext())
		);
		var secondGate = new GatedEnqueuer(
			new JobEnqueuer(secondDb, new RequestAuthContext())
		);
		var firstService = new PasswordResetService(firstDb, firstGate);
		var secondService = new PasswordResetService(secondDb, secondGate);

		var firstTask = firstService.RequestAsync(email, CancellationToken.None);
		Task? secondTask = null;

		try {
			await firstGate.Reached.Task.WaitAsync(TimeSpan.FromSeconds(10));
			secondTask = secondService.RequestAsync(email, CancellationToken.None);

			await _WaitUntilBackendWaitsOnLockAsync(secondAppName);
			secondGate.Reached.Task.IsCompleted.Should().BeFalse(
				"the second request must lock before its reuse-versus-rotate decision"
			);
		} finally {
			firstGate.Release.TrySetResult();
			secondGate.Release.TrySetResult();
		}

		await firstTask.WaitAsync(TimeSpan.FromSeconds(10));
		if (secondTask is null) {
			throw new InvalidOperationException("The second password-reset request was not started.");
		}

		await secondGate.Reached.Task.WaitAsync(TimeSpan.FromSeconds(10));
		await secondTask.WaitAsync(TimeSpan.FromSeconds(10));

		await using var assertDb = _CreateDbContext();
		var user = await assertDb.User.AsNoTracking().SingleAsync(u => u.Id == userId);
		var retainedToken = user.PasswordResetToken;
		retainedToken.Should().NotBeNullOrEmpty();
		if (retainedToken is null) {
			throw new InvalidOperationException("The retained password-reset token was null.");
		}
		user.PasswordResetTokenExpiresAt.Should().BeAfter(DateTime.UtcNow);

		var jobs = await _ResetJobsForUserAsync(assertDb, userId);
		jobs.Should().HaveCount(2);

		var sender = new RecordingEmailSender();
		foreach (var job in jobs) {
			if (job.Id is null) {
				throw new InvalidOperationException("A password-reset job id was null.");
			}

			await using var handlerDb = _CreateDbContext();
			var handler = new PasswordResetEmailJobHandler(
				handlerDb,
				sender,
				new EmailLogWriter(handlerDb),
				new JobsMetrics(new JobWorkerInstance(), NullLogger<JobsMetrics>.Instance)
			);
			await handler.HandleAsync(
				new JobContext {
					JobId = job.Id.Value,
					JobType = job.JobType,
					Payload = job.Payload,
					Attempts = job.Attempts,
					MaxAttempts = job.MaxAttempts
				},
				CancellationToken.None
			);
		}

		sender.Requests.Should().HaveCount(2);
		sender.Requests.Should().OnlyContain(request =>
			request.HtmlBody.Contains(retainedToken, StringComparison.Ordinal)
		);
	}

	// A poisoned enqueuer that fails before staging anything (direction a).
	private sealed class ThrowingEnqueuer : IJobEnqueuer {
		public Task<Guid> EnqueueAsync<TPayload>(
			JobDefinition<TPayload> definition,
			TPayload payload,
			EnqueueOptions? options = null,
			CancellationToken cancellationToken = default
		) {
			throw new InvalidOperationException("enqueue failed");
		}
	}

	// Delegates to the real enqueuer (staging a job row in the shared transaction), then
	// throws to simulate a later failure in the same unit of work (direction b).
	private sealed class ThrowAfterEnqueue : IJobEnqueuer {
		private readonly IJobEnqueuer _Inner;

		public ThrowAfterEnqueue(IJobEnqueuer inner) {
			_Inner = inner;
		}

		public async Task<Guid> EnqueueAsync<TPayload>(
			JobDefinition<TPayload> definition,
			TPayload payload,
			EnqueueOptions? options = null,
			CancellationToken cancellationToken = default
		) {
			await _Inner.EnqueueAsync(definition, payload, options, cancellationToken);
			throw new InvalidOperationException("token-side failure after enqueue");
		}
	}

	private sealed class GatedEnqueuer : IJobEnqueuer {
		private readonly IJobEnqueuer _Inner;

		public TaskCompletionSource Reached { get; } =
			new(TaskCreationOptions.RunContinuationsAsynchronously);
		public TaskCompletionSource Release { get; } =
			new(TaskCreationOptions.RunContinuationsAsynchronously);

		public GatedEnqueuer(IJobEnqueuer inner) {
			_Inner = inner;
		}

		public async Task<Guid> EnqueueAsync<TPayload>(
			JobDefinition<TPayload> definition,
			TPayload payload,
			EnqueueOptions? options = null,
			CancellationToken cancellationToken = default
		) {
			Reached.TrySetResult();
			await Release.Task.WaitAsync(cancellationToken);
			return await _Inner.EnqueueAsync(definition, payload, options, cancellationToken);
		}
	}

	private sealed class RecordingEmailSender : IEmailSender {
		public List<EmailRequest> Requests { get; } = [];

		public Task<EmailSendReceipt> SendAsync(
			EmailRequest request,
			string? idempotencyKey = null,
			CancellationToken cancellationToken = default
		) {
			Requests.Add(request);
			return Task.FromResult(new EmailSendReceipt(Guid.NewGuid().ToString()));
		}
	}

	private async Task _WaitUntilBackendWaitsOnLockAsync(string applicationName) {
		var deadline = DateTime.UtcNow.AddSeconds(10);
		await using var connection = new NpgsqlConnection(_BaseConnectionString());
		await connection.OpenAsync();

		while (DateTime.UtcNow < deadline) {
			await using var command = new NpgsqlCommand(
				"""
				SELECT EXISTS (
					SELECT 1
					FROM pg_stat_activity
					WHERE application_name = @application_name
					  AND wait_event_type = 'Lock'
				)
				""",
				connection
			);
			command.Parameters.AddWithValue("application_name", applicationName);

			var waiting = await command.ExecuteScalarAsync();
			if (waiting is true) {
				return;
			}

			await Task.Delay(TimeSpan.FromMilliseconds(25));
		}

		throw new TimeoutException("The second password-reset request did not wait on a row lock.");
	}

	private static async Task<List<JobQueueItem>> _ResetJobsForUserAsync(AppDbContext db, Guid userId) {
		var jobs = await db.JobQueue.AsNoTracking()
			.Where(j => j.JobType == "email.password-reset.v1")
			.ToListAsync();

		return jobs
			.Where(j => _PayloadGuid(j.Payload, "userId") == userId)
			.ToList();
	}

	private static Guid? _PayloadGuid(string payload, string property) {
		using var document = JsonDocument.Parse(payload);
		if (document.RootElement.TryGetProperty(property, out var value)
			&& value.TryGetGuid(out var guid)) {
			return guid;
		}

		return null;
	}

	private async Task<Guid> _SeedUserAsync(string email, bool verified) {
		await using var db = _CreateDbContext();
		var user = new User {
			Email = email,
			Password = "unused-password-hash",
			IsVerified = verified
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private AppDbContext _CreateDbContext() {
		return _CreateDbContext(applicationName: null);
	}

	private AppDbContext _CreateDbContext(string? applicationName) {
		var connectionString = _BaseConnectionString();
		if (applicationName is not null) {
			var builder = new NpgsqlConnectionStringBuilder(connectionString) {
				ApplicationName = applicationName
			};
			connectionString = builder.ConnectionString;
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private string _BaseConnectionString() {
		using var scope = _Fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return connectionString;
	}
}
