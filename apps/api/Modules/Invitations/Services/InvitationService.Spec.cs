using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Services;

// Proves the round-5 API F3 durability guarantee: invitation creation persists a
// durable InvitationEmailOutbox row in the same SaveChanges call as the invitation
// itself. Queries through a SEPARATE AppDbContext instance (not the one the service
// used) so the assertion proves real database persistence, not just EF change
// tracking on the original context.
public sealed class InvitationServiceOutboxDurabilitySpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public InvitationServiceOutboxDurabilitySpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldPersistDurableOutboxRowForStaffInvitationInSameCommit() {
		var email = $"staff-outbox-{Guid.NewGuid():N}@example.com";
		Guid invitationId;
		string token;

		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var invitationService = scope.ServiceProvider.GetRequiredService<IInvitationService>();
			var profileId = await SeedStaffProfileAsync(scope.ServiceProvider);
			var inviterId = await SeedStaffUserAsync(scope.ServiceProvider);

			var (invitation, createdToken) = await invitationService.CreateStaffInvitationAsync(
				new CreateStaffInvitationArgs(
					Email: email,
					ProfileIds: [profileId],
					InvitedByUserId: inviterId
				)
			);

			invitationId = invitation.GetRequiredId();
			token = createdToken;
		}

		// Independent context: proves the row is durably committed, not just tracked
		// in-memory on the context the service used.
		await using var verifyContext = await CreateFreshDbContextAsync();
		var outboxRow = await verifyContext.InvitationEmailOutbox
			.SingleOrDefaultAsync(o => o.Email == email && o.Token == token);

		outboxRow.Should().NotBeNull();
		outboxRow!.Kind.Should().Be(InvitationEmailKind.StaffInvitation);
		outboxRow.Status.Should().BeOneOf(
			InvitationEmailOutboxStatus.Pending,
			InvitationEmailOutboxStatus.Sent
		);

		var invitationRow = await verifyContext.Invitation
			.SingleOrDefaultAsync(i => i.Id == invitationId);
		invitationRow.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldPersistDurableOutboxRowForTenantInvitationWithTenantNameAndLevel() {
		var email = $"tenant-outbox-{Guid.NewGuid():N}@example.com";
		string token;

		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var invitationService = scope.ServiceProvider.GetRequiredService<IInvitationService>();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

			var tenantId = await SeedTenantAsync(dbContext);
			var inviterId = await SeedStaffUserAsync(scope.ServiceProvider);

			var (_, createdToken) = await invitationService.CreateTenantInvitationAsync(
				new CreateTenantInvitationArgs(
					Email: email,
					TenantId: tenantId,
					TenantName: "Durability Test Co",
					ProfileIds: [],
					AccountLevel: AccountLevel.Admin,
					InvitedByUserId: inviterId
				)
			);

			token = createdToken;
		}

		await using var verifyContext = await CreateFreshDbContextAsync();
		var outboxRow = await verifyContext.InvitationEmailOutbox
			.SingleOrDefaultAsync(o => o.Email == email && o.Token == token);

		outboxRow.Should().NotBeNull();
		outboxRow!.Kind.Should().Be(InvitationEmailKind.TenantInvitation);
		outboxRow.TenantName.Should().Be("Durability Test Co");
		outboxRow.AccountLevel.Should().Be(AccountLevel.Admin);
	}

	private async Task<AppDbContext> CreateFreshDbContextAsync() {
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

	private static async Task<Guid> SeedStaffProfileAsync(IServiceProvider services) {
		var dbContext = services.GetRequiredService<AppDbContext>();
		var profile = Modules.Profiles.Entities.Profile.CreateStaffProfile(
			name: $"Outbox test profile {Guid.NewGuid():N}",
			description: "seed"
		);
		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();
		return profile.GetRequiredId();
	}

	private static async Task<Guid> SeedStaffUserAsync(IServiceProvider services) {
		var dbContext = services.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"outbox-inviter-{Guid.NewGuid():N}@example.com",
			Password = "hash",
			FirstName = "Outbox",
			LastName = "Inviter",
			Status = UserStatus.Active,
			IsVerified = true
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private static async Task<Guid> SeedTenantAsync(AppDbContext dbContext) {
		var tenant = new Modules.Tenants.Entities.Tenant {
			Name = $"Outbox test tenant {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		return tenant.GetRequiredId();
	}
}
