using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Messaging.Email;

// Exercises InvitationEmailOutboxDispatcher.SendOneAsync directly on rows scheduled
// far in the future, so the live background dispatcher started by the test host (it
// only picks up rows with NextAttemptAt <= now) never races these assertions.
public sealed class InvitationEmailOutboxDispatcherSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public InvitationEmailOutboxDispatcherSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldMarkRowSentWhenDeliverySucceeds() {
		var dispatcher = CreateDispatcher();
		await using var dbContext = await CreateDbContextAsync();

		var row = InvitationEmailOutbox.CreateStaffInvitation("succeed@example.com", "tok-succeed");
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.InvitationEmailOutbox.AddAsync(row);
		await dbContext.SaveChangesAsync();

		var emailService = new StubEmailService(shouldThrow: false);

		await dispatcher.SendOneAsync(dbContext, emailService, row, CancellationToken.None);

		row.Status.Should().Be(InvitationEmailOutboxStatus.Sent);
		row.SentAt.Should().NotBeNull();
		row.AttemptCount.Should().Be(0);
		emailService.StaffInvitationsSent.Should().Contain(("succeed@example.com", "tok-succeed"));
	}

	[Fact]
	public async Task ItShouldScheduleBackoffRetryWhenDeliveryFailsAndAttemptsRemain() {
		var dispatcher = CreateDispatcher();
		await using var dbContext = await CreateDbContextAsync();

		var row = InvitationEmailOutbox.CreateStaffInvitation("retry@example.com", "tok-retry");
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.InvitationEmailOutbox.AddAsync(row);
		await dbContext.SaveChangesAsync();

		var emailService = new StubEmailService(shouldThrow: true);
		var beforeAttempt = DateTime.UtcNow;

		await dispatcher.SendOneAsync(dbContext, emailService, row, CancellationToken.None);

		row.Status.Should().Be(InvitationEmailOutboxStatus.Pending);
		row.AttemptCount.Should().Be(1);
		row.LastError.Should().NotBeNullOrWhiteSpace();
		// Backoff for attempt 1 is 2^1 = 2 seconds.
		row.NextAttemptAt.Should().BeAfter(beforeAttempt.AddSeconds(1));
		row.NextAttemptAt.Should().BeBefore(beforeAttempt.AddSeconds(10));
	}

	[Fact]
	public async Task ItShouldMarkRowPermanentlyFailedWhenAttemptsAreExhausted() {
		var dispatcher = CreateDispatcher();
		await using var dbContext = await CreateDbContextAsync();

		var row = InvitationEmailOutbox.CreateStaffInvitation("exhausted@example.com", "tok-exhausted");
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		row.AttemptCount = InvitationEmailOutboxDispatcher.MaxAttempts - 1;
		await dbContext.InvitationEmailOutbox.AddAsync(row);
		await dbContext.SaveChangesAsync();

		var emailService = new StubEmailService(shouldThrow: true);

		await dispatcher.SendOneAsync(dbContext, emailService, row, CancellationToken.None);

		row.Status.Should().Be(InvitationEmailOutboxStatus.Failed);
		row.AttemptCount.Should().Be(InvitationEmailOutboxDispatcher.MaxAttempts);
	}

	[Fact]
	public async Task ItShouldDeliverTenantInvitationWithTenantNameAndAccountLevel() {
		var dispatcher = CreateDispatcher();
		await using var dbContext = await CreateDbContextAsync();

		var row = InvitationEmailOutbox.CreateTenantInvitation(
			"tenant-invite@example.com",
			"Acme Corp",
			"tok-tenant",
			AccountLevel.Admin
		);
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.InvitationEmailOutbox.AddAsync(row);
		await dbContext.SaveChangesAsync();

		var emailService = new StubEmailService(shouldThrow: false);

		await dispatcher.SendOneAsync(dbContext, emailService, row, CancellationToken.None);

		row.Status.Should().Be(InvitationEmailOutboxStatus.Sent);
		emailService.TenantInvitationsSent.Should().ContainSingle(
			e => e.Email == "tenant-invite@example.com"
				&& e.TenantName == "Acme Corp"
				&& e.Token == "tok-tenant"
				&& e.Level == AccountLevel.Admin
		);
	}

	private InvitationEmailOutboxDispatcher CreateDispatcher() {
		return new InvitationEmailOutboxDispatcher(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			_fixture.Factory.Services.GetRequiredService<IInvitationEmailOutboxSignal>(),
			NullLogger<InvitationEmailOutboxDispatcher>.Instance
		);
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was unexpectedly null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private sealed class StubEmailService : IEmailService {
		private readonly bool _shouldThrow;

		public List<(string Email, string Token)> StaffInvitationsSent { get; } = [];
		public List<(string Email, string TenantName, string Token, AccountLevel Level)>
			TenantInvitationsSent { get; } = [];

		public StubEmailService(bool shouldThrow) {
			_shouldThrow = shouldThrow;
		}

		public Task SendWelComeEmailAsync(string email, string token) {
			throw new NotImplementedException();
		}

		public Task SendEmailVerificationRequestAsync(string email, string token) {
			throw new NotImplementedException();
		}

		public Task SendEmailVerifiedNotificationAsync(string email) {
			throw new NotImplementedException();
		}

		public Task SendStaffWelcomeEmailAsync(string email, string token) {
			throw new NotImplementedException();
		}

		public Task SendJoinedStaffNotificationEmailAsync(string email) {
			throw new NotImplementedException();
		}

		public Task SendResetPasswordRequestEmailAsync(string email, string token) {
			throw new NotImplementedException();
		}

		public Task SendPasswordResetNotificationEmailAsync(string email) {
			throw new NotImplementedException();
		}

		public Task SendInvitationToJoinStaffEmailAsync(string email, string token) {
			if (_shouldThrow) {
				throw new InvalidOperationException("StubEmailService: simulated send failure");
			}

			StaffInvitationsSent.Add((email, token));
			return Task.CompletedTask;
		}

		public Task SendTenantInvitationEmailAsync(
			string email,
			string tenantName,
			string token,
			AccountLevel level
		) {
			if (_shouldThrow) {
				throw new InvalidOperationException("StubEmailService: simulated send failure");
			}

			TenantInvitationsSent.Add((email, tenantName, token, level));
			return Task.CompletedTask;
		}
	}
}
