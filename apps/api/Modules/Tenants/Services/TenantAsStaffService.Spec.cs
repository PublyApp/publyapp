using System.Data.Common;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Uploads.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Services;

public sealed class TenantAsStaffServiceSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public TenantAsStaffServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRetainReplacedLogoWithoutAnInlineReferenceCheck() {
		var initialLogoUrl = "/files/uploads/2026/07/11111111-2222-3333-4444-555555555555.png";
		var replacementLogoUrl = "https://cdn.example.com/replaced-logo.png";

		var tenantId = await SeedTenantAsync(initialLogoUrl);
		var connectionString = await GetConnectionStringAsync();
		var interceptor = new FailingLogoReferenceCheckAfterUpdateInterceptor();

		await using var serviceDbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.AddInterceptors(interceptor)
				.Options
		);

		var service = new TenantAsStaffService(
			serviceDbContext,
			new InvitationEmailOutboxSignal(),
			new UploadAssetReferenceService(serviceDbContext),
			NullLogger<TenantAsStaffService>.Instance
		);

		var result = await service.UpdateTenantAsync(
			tenantId,
			new UpdateTenantAsStaffArgs(
				Name: null,
				LogoUrl: PatchField<string?>.Set(replacementLogoUrl),
				MaxUsers: null,
				LegalName: PatchField<string?>.Absent(),
				Description: PatchField<string?>.Absent(),
				WebsiteUrl: PatchField<string?>.Absent(),
				BillingEmail: PatchField<string?>.Absent(),
				SupportEmail: PatchField<string?>.Absent(),
				DefaultLocale: PatchField<string?>.Absent(),
				Timezone: PatchField<string?>.Absent(),
				Notes: PatchField<string?>.Absent()
			)
		);

		var success = result.Should().BeOfType<UpdateTenantResult.Success>().Subject;
		success.Tenant.LogoUrl.Should().Be(replacementLogoUrl);
		interceptor.HasFailed.Should().BeFalse();

		await using var verifyScope =
			_fixture.Factory.Services.CreateAsyncScope();
		var verifyContext = verifyScope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var persistedTenant = await verifyContext.Tenant
			.IgnoreQueryFilters()
			.SingleAsync(t => t.Id == tenantId);
		persistedTenant.LogoUrl.Should().Be(replacementLogoUrl);
	}

	private async Task<Guid> SeedTenantAsync(string initialLogoUrl) {
		await using var seedScope = _fixture.Factory.Services.CreateAsyncScope();
		var seedContext = seedScope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"Tenant Service Async Logo Failure {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
			LogoUrl = initialLogoUrl,
		};

		seedContext.Tenant.Add(tenant);
		await seedContext.SaveChangesAsync();

		return tenant.GetRequiredId();
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

	private sealed class FailingLogoReferenceCheckAfterUpdateInterceptor
		: DbCommandInterceptor {
		private bool _hasSeenUpdate;
		private bool _hasFailed;
		private int _commandCount;

		public bool HasFailed {
			get { return _hasFailed; }
		}

		public int CommandCount {
			get { return _commandCount; }
		}

		public override async ValueTask<int> NonQueryExecutedAsync(
			DbCommand command,
			CommandExecutedEventData eventData,
			int result,
			CancellationToken cancellationToken = default
		) {
			_commandCount += 1;
			MaybeFail(command.CommandText);
			return await base.NonQueryExecutedAsync(
				command,
				eventData,
				result,
				cancellationToken
			);
		}

		public override InterceptionResult<int> NonQueryExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result
		) {
			_commandCount += 1;
			MaybeFail(command.CommandText);
			return base.NonQueryExecuting(command, eventData, result);
		}

		public override InterceptionResult<DbDataReader> ReaderExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<DbDataReader> result
		) {
			_commandCount += 1;
			MaybeFail(command.CommandText);
			return base.ReaderExecuting(command, eventData, result);
		}

		public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<DbDataReader> result,
			CancellationToken cancellationToken = default
		) {
			_commandCount += 1;
			MaybeFail(command.CommandText);
			return new ValueTask<InterceptionResult<DbDataReader>>(result);
		}

		public override InterceptionResult<object> ScalarExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<object> result
		) {
			_commandCount += 1;
			MaybeFail(command.CommandText);
			return base.ScalarExecuting(command, eventData, result);
		}

		public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<object> result,
			CancellationToken cancellationToken = default
		) {
			_commandCount += 1;
			MaybeFail(command.CommandText);
			return new ValueTask<InterceptionResult<object>>(result);
		}

		private void MaybeFail(string commandText) {
			// Fail on the FIRST command after the tenant UPDATE unless that command
			// is the F5 reference-release UPDATE: since #807 the service legitimately
			// releases the replaced logo's asset reference right after the entity
			// write, inside the same transaction. The rule under test — no INLINE
			// blob cleanup (file deletes / existence probes) after the update —
			// still holds; a second non-reference SQL command remains a failure.
			if (!_hasSeenUpdate && IsTenantUpdateCommand(commandText)) {
				_hasSeenUpdate = true;
				return;
			}

			if (_hasSeenUpdate
				&& !_hasFailed
				&& !IsLogoReferenceReleaseCommand(commandText)) {
				_hasFailed = true;
				throw new InvalidOperationException(
					"Injected logo reference-check failure after tenant update."
				);
			}
		}

		private static bool IsTenantUpdateCommand(string commandText) {
			return commandText.Contains("UPDATE ", StringComparison.OrdinalIgnoreCase)
				&& commandText.Contains("tenants", StringComparison.OrdinalIgnoreCase);
		}

		private static bool IsLogoReferenceReleaseCommand(string commandText) {
			return commandText.Contains("UPDATE ", StringComparison.OrdinalIgnoreCase)
				&& commandText.Contains(
					"upload_assets",
					StringComparison.OrdinalIgnoreCase
				);
		}
	}

	// The rule: any path that durably enqueues InvitationEmailOutbox rows must call
	// _outboxSignal.Notify() so the dispatcher wakes immediately instead of relying
	// on its poll interval. Replacing Notify() with a no-op left this dependency with
	// no assertion at all (round-5 W5-VERIFY2 finding #2).
	[Fact]
	public async Task
	ItShouldNotifyTheOutboxSignalAfterCreatingTenantWithInitialUsers() {
		var connectionString = await GetConnectionStringAsync();
		var fakeOutboxSignal = new FakeInvitationEmailOutboxSignal();

		await using var serviceDbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);

		var service = new TenantAsStaffService(
			serviceDbContext,
			fakeOutboxSignal,
			new UploadAssetReferenceService(serviceDbContext),
			NullLogger<TenantAsStaffService>.Instance
		);

		var result = await service.CreateTenantWithInitialUsersAsync(
			new CreateTenantWithInitialUsersArgs(
				Name: $"Outbox Notify Tenant {Guid.NewGuid():N}",
				MaxUsers: 10,
				InitialUsers: [(Email: $"invitee-{Guid.NewGuid():N}@example.com", AccountLevel: AccountLevel.Admin)],
				InvitedByUserId: (await SeedStaffUserAsync()),
				Code: null,
				SeedDefaultProfile: false,
				LogoUrl: null,
				LegalName: null,
				Description: null,
				WebsiteUrl: null,
				BillingEmail: null,
				SupportEmail: null,
				DefaultLocale: null,
				Timezone: null,
				Notes: null
			)
		);

		result.Should().BeOfType<CreateTenantWithInitialUsersOutcome.Success>();
		fakeOutboxSignal.NotifyCallCount.Should().Be(1);
	}

	private async Task<Guid> SeedStaffUserAsync() {
		await using var seedScope = _fixture.Factory.Services.CreateAsyncScope();
		var seedContext = seedScope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = $"staff-{Guid.NewGuid():N}@example.com",
			Password = "unused-hash",
			FirstName = "Staff",
			LastName = "User",
			IsVerified = true,
			Status = UserStatus.Active,
		};
		seedContext.User.Add(user);
		await seedContext.SaveChangesAsync();

		return user.GetRequiredId();
	}

	private sealed class FakeInvitationEmailOutboxSignal : IInvitationEmailOutboxSignal {
		private int _notifyCallCount;

		public int NotifyCallCount {
			get { return _notifyCallCount; }
		}

		public void Notify() {
			_notifyCallCount += 1;
		}

		public Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) {
			return Task.CompletedTask;
		}
	}

}
