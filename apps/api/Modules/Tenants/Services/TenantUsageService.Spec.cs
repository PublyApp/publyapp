using System.Data.Common;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Services;

/// <summary>
/// Specs for TenantUsageService.GetTenantUsageAsync (#168).
///
/// The cost trap: usage numbers are per-tenant aggregates read by staff on a
/// multi-tenant database. A naive implementation that scans every tenant's
/// rows does not scale, so ItShouldFilterEveryQueryOnTheRequestedTenantId
/// anchors the SHAPE of the queries (not just their results): a
/// DbCommandInterceptor records every SQL command the service emits and each
/// one must carry the requested tenant id as a parameter. Any regression to a
/// whole-table scan (or a cross-tenant join) emits commands without the
/// parameter and fails this spec with the offending SQL text.
/// </summary>
public sealed class TenantUsageServiceSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public TenantUsageServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldCountActiveAndTotalUsersProjectsAndScheduledPublications() {
		var tenantId = await SeedRichTenantAsync();

		var result = await NewService().GetTenantUsageAsync(tenantId);
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant usage snapshot was empty."
			);
		}

		result.UsersTotal.Should().Be(3);
		result.UsersActive.Should().Be(2);
		result.ProjectsCount.Should().Be(2);
		result.ScheduledPublicationsCount.Should().Be(2);
	}

	[Fact]
	public async Task ItShouldExcludeSoftDeletedAndForeignTenantRowsFromCounts() {
		var (tenantId, _) = await SeedTwoTenantsWithNoiseAsync();

		var result = await NewService().GetTenantUsageAsync(tenantId);
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant usage snapshot was empty."
			);
		}

		// Only this tenant's live rows count; soft-deleted rows and another
		// tenant's rows must never leak into the aggregate.
		result.UsersTotal.Should().Be(1);
		result.UsersActive.Should().Be(1);
		result.ProjectsCount.Should().Be(1);
		result.ScheduledPublicationsCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnLastActivityAtFromTheTenantRow() {
		var lastActivity = new DateTime(2026, 8, 1, 9, 30, 0, DateTimeKind.Utc);
		var tenantId = await SeedTenantWithLastActivityAsync(lastActivity);

		var result = await NewService().GetTenantUsageAsync(tenantId);
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant usage snapshot was empty."
			);
		}

		result.LastActivityAt.Should().Be(lastActivity);
	}

	[Fact]
	public async Task ItShouldReturnZeroesForATenantWithoutAnyActivity() {
		var tenantId = await SeedBareTenantAsync("usage empty");

		var result = await NewService().GetTenantUsageAsync(tenantId);
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant usage snapshot was empty."
			);
		}

		result.UsersTotal.Should().Be(0);
		result.UsersActive.Should().Be(0);
		result.ProjectsCount.Should().Be(0);
		result.ScheduledPublicationsCount.Should().Be(0);
		result.LastActivityAt.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldReturnNullForAnUnknownTenant() {
		var result = await NewService()
			.GetTenantUsageAsync(Guid.NewGuid());

		result.Should().BeNull();
	}

	// ── The cost anchor: every query filters on the requested tenant id ──

	[Fact]
	public async Task ItShouldFilterEveryQueryOnTheRequestedTenantId() {
		var tenantId = await SeedRichTenantAsync();
		var connectionString = await GetConnectionStringAsync();
		var interceptor = new TenantParameterCaptureInterceptor();

		await using var serviceDbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.AddInterceptors(interceptor)
				.Options
		);

		var service = new TenantUsageService(
			serviceDbContext,
			NullLogger<TenantUsageService>.Instance
		);

		var tenantIdText = tenantId.ToString();
		await service.GetTenantUsageAsync(tenantId);

		interceptor.Commands.Should().NotBeEmpty(
			"the service must issue its aggregate queries through EF Core so "
			+ "the shape guard can observe them"
		);
		var unfiltered = interceptor.Commands
			.Where(c => !c.Parameters.Contains(tenantIdText))
			.ToList();
		unfiltered.Should().BeEmpty(
			"every query emitted by GetTenantUsageAsync must filter on the "
			+ "requested tenant id — an unbounded cross-tenant scan is the "
			+ "exact cost failure mode #168 forbids. Offending commands:\n"
			+ string.Join("\n", unfiltered.Select(c => c.Text))
		);
	}

	private TenantUsageService NewService() {
		return new TenantUsageService(
			CreateServiceDbContext().GetAwaiter().GetResult(),
			NullLogger<TenantUsageService>.Instance
		);
	}

	private async Task<AppDbContext> CreateServiceDbContext() {
		var connectionString = await GetConnectionStringAsync();
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private async Task<string> GetConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var connectionString = dbContext.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return connectionString;
	}

	private async Task<Guid> SeedBareTenantAsync(string namePrefix) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> SeedTenantWithLastActivityAsync(
		DateTime lastActivityAt
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage activity {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
			LastActivityAt = lastActivityAt,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> SeedRichTenantAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage rich {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 20,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		async Task<User> AddUserAsync(AccountLevel level, bool suspendAccount) {
			var user = new User {
				Email = $"usage-rich-{Guid.NewGuid():N}@example.com",
				Password = "unused",
				Status = UserStatus.Active,
				IsVerified = true,
			};
			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			var account = UserAccount.CreateTenantAccount(
				user.GetRequiredId(), tenantId, level
			);
			if (suspendAccount) {
				account.Status = AccountStatus.Suspended;
			}
			await dbContext.UserAccount.AddAsync(account);
			await dbContext.SaveChangesAsync();

			return user;
		}

		var owner = await AddUserAsync(AccountLevel.Admin, suspendAccount: false);
		await AddUserAsync(AccountLevel.User, suspendAccount: false);
		await AddUserAsync(AccountLevel.User, suspendAccount: true);

		var activeProject = new Project {
			TenantId = tenantId,
			Name = $"usage-project-active-{Guid.NewGuid():N}",
		};
		var inactiveProject = new Project {
			TenantId = tenantId,
			Name = $"usage-project-inactive-{Guid.NewGuid():N}",
			Status = ProjectStatus.Inactive,
		};
		dbContext.Project.AddRange(activeProject, inactiveProject);
		await dbContext.SaveChangesAsync();

		var postA = new Post {
			TenantId = tenantId,
			Body = "usage spec post A",
			CreatedByUserId = owner.GetRequiredId(),
		};
		var postB = new Post {
			TenantId = tenantId,
			Body = "usage spec post B",
			CreatedByUserId = owner.GetRequiredId(),
		};
		var accountOne = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@usage-one.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		var accountTwo = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@usage-two.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		dbContext.Post.AddRange(postA, postB);
		dbContext.SocialAccount.AddRange(accountOne, accountTwo);
		await dbContext.SaveChangesAsync();

		// ux_publications_post_account allows one publication per (post,
		// account) pair, so spread the rows over distinct pairs.
		dbContext.Publication.AddRange(
			new Publication {
				TenantId = tenantId,
				PostId = postA.GetRequiredId(),
				SocialAccountId = accountOne.GetRequiredId(),
				Status = PublicationStatus.Scheduled,
				ScheduledAtUtc = DateTime.UtcNow.AddHours(2),
				ScheduledTimeZone = "Etc/UTC",
				IdempotencyKey = $"usage-sched-1-{Guid.NewGuid():N}",
			},
			new Publication {
				TenantId = tenantId,
				PostId = postA.GetRequiredId(),
				SocialAccountId = accountTwo.GetRequiredId(),
				Status = PublicationStatus.Scheduled,
				ScheduledAtUtc = DateTime.UtcNow.AddHours(3),
				ScheduledTimeZone = "Etc/UTC",
				IdempotencyKey = $"usage-sched-2-{Guid.NewGuid():N}",
			},
			new Publication {
				TenantId = tenantId,
				PostId = postB.GetRequiredId(),
				SocialAccountId = accountOne.GetRequiredId(),
				Status = PublicationStatus.Published,
				ScheduledAtUtc = DateTime.UtcNow.AddDays(-1),
				ScheduledTimeZone = "Etc/UTC",
				IdempotencyKey = $"usage-pub-1-{Guid.NewGuid():N}",
			}
		);
		await dbContext.SaveChangesAsync();

		return tenantId;
	}

	private async Task<(Guid TenantId, Guid OtherTenantId)>
	SeedTwoTenantsWithNoiseAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage noise {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		var otherTenant = new Tenant {
			Name = $"usage other {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		dbContext.Tenant.AddRange(tenant, otherTenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();
		var otherTenantId = otherTenant.GetRequiredId();

		var keptUser = new User {
			Email = $"usage-kept-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		var deletedUser = new User {
			Email = $"usage-deleted-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		dbContext.User.AddRange(keptUser, deletedUser);
		await dbContext.SaveChangesAsync();

		dbContext.UserAccount.Add(
			UserAccount.CreateTenantAccount(keptUser.GetRequiredId(), tenantId)
		);
		var doomedAccount = UserAccount.CreateTenantAccount(
			deletedUser.GetRequiredId(), tenantId
		);
		dbContext.UserAccount.Add(doomedAccount);
		// Foreign-tenant membership: must never appear in this tenant's counts.
		dbContext.UserAccount.Add(
			UserAccount.CreateTenantAccount(
				keptUser.GetRequiredId(), otherTenantId
			)
		);
		await dbContext.SaveChangesAsync();

		// Soft-delete AFTER insert: SaveChanges forces IsDeleted=false on Added
		// rows (audit interceptor), matching the existing specs' seeding note.
		doomedAccount.IsDeleted = true;
		deletedUser.IsDeleted = true;
		await dbContext.SaveChangesAsync();

		var keptProject = new Project {
			TenantId = tenantId,
			Name = $"usage-live-project-{Guid.NewGuid():N}",
		};
		var doomedProject = new Project {
			TenantId = tenantId,
			Name = $"usage-noise-project-{Guid.NewGuid():N}",
		};
		var otherProject = new Project {
			TenantId = otherTenantId,
			Name = $"usage-other-project-{Guid.NewGuid():N}",
		};
		dbContext.Project.AddRange(keptProject, doomedProject, otherProject);
		await dbContext.SaveChangesAsync();

		doomedProject.IsDeleted = true;
		await dbContext.SaveChangesAsync();

		var user = new User {
			Email = $"usage-other-owner-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		dbContext.User.Add(user);
		await dbContext.SaveChangesAsync();

		var otherPost = new Post {
			TenantId = otherTenantId,
			Body = "foreign post",
			CreatedByUserId = user.GetRequiredId(),
		};
		var otherAccount = new SocialAccount {
			TenantId = otherTenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@other.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		dbContext.Post.Add(otherPost);
		dbContext.SocialAccount.Add(otherAccount);
		await dbContext.SaveChangesAsync();

		dbContext.Publication.Add(new Publication {
			TenantId = otherTenantId,
			PostId = otherPost.GetRequiredId(),
			SocialAccountId = otherAccount.GetRequiredId(),
			Status = PublicationStatus.Scheduled,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(1),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = $"usage-other-{Guid.NewGuid():N}",
		});
		await dbContext.SaveChangesAsync();

		return (tenantId, otherTenantId);
	}

	private sealed record CapturedCommand(string Text, string Parameters) {
		public bool Contains(string value) {
			return Text.Contains(value, StringComparison.OrdinalIgnoreCase)
				|| Parameters.Contains(value, StringComparison.Ordinal);
		}
	}

	private sealed class TenantParameterCaptureInterceptor : DbCommandInterceptor {
		public List<CapturedCommand> Commands { get; } = [];

		public override InterceptionResult<DbDataReader> ReaderExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<DbDataReader> result
		) {
			Record(command);
			return base.ReaderExecuting(command, eventData, result);
		}

		public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<DbDataReader> result,
			CancellationToken cancellationToken = default
		) {
			Record(command);
			return new ValueTask<InterceptionResult<DbDataReader>>(result);
		}

		public override InterceptionResult<object> ScalarExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<object> result
		) {
			Record(command);
			return base.ScalarExecuting(command, eventData, result);
		}

		public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<object> result,
			CancellationToken cancellationToken = default
		) {
			Record(command);
			return new ValueTask<InterceptionResult<object>>(result);
		}

		private void Record(DbCommand command) {
			var parameters = string.Join(
				", ",
				command.Parameters
					.Cast<DbParameter>()
					.Select(p => $"{p.ParameterName}={p.Value}")
			);
			Commands.Add(new CapturedCommand(command.CommandText, parameters));
		}
	}
}
