using System.Data.Common;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Uploads.Services;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Services;

public sealed class TenantAsStaffBulkLifecycleServiceSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public TenantAsStaffBulkLifecycleServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldProcessDistinctSuspendTargetsWithSingleBatch() {
		var firstActiveTenantId = await SeedTenantAsync(TenantStatus.Active);
		var secondActiveTenantId = await SeedTenantAsync(TenantStatus.Active);
		var suspendedTenantId = await SeedTenantAsync(TenantStatus.Suspended);
		var missingTenantId = Guid.NewGuid();
		var setup = await CreateServiceAsync();

		await using var serviceDbContext = setup.DbContext;
		var result = await setup.Service.BulkSuspendAsync([
			firstActiveTenantId,
			firstActiveTenantId,
			secondActiveTenantId,
			suspendedTenantId,
			missingTenantId,
		]);

		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(item =>
			item.TenantId == suspendedTenantId
			&& item.Error == "Already suspended"
		);
		result.FailedItems.Should().ContainSingle(item =>
			item.TenantId == missingTenantId
			&& item.Error == "Tenant not found"
		);
		setup.Interceptor.TenantSelectCount.Should().Be(1);
		setup.Interceptor.TenantUpdateCount.Should().Be(1);

		(await GetTenantAsync(firstActiveTenantId)).Status
			.Should().Be(TenantStatus.Suspended);
		(await GetTenantAsync(secondActiveTenantId)).Status
			.Should().Be(TenantStatus.Suspended);
	}

	[Fact]
	public async Task
	ItShouldProcessDistinctReactivateTargetsWithSingleBatch() {
		var firstSuspendedTenantId = await SeedTenantAsync(TenantStatus.Suspended);
		var secondSuspendedTenantId = await SeedTenantAsync(TenantStatus.Suspended);
		var activeTenantId = await SeedTenantAsync(TenantStatus.Active);
		var missingTenantId = Guid.NewGuid();
		var setup = await CreateServiceAsync();

		await using var serviceDbContext = setup.DbContext;
		var result = await setup.Service.BulkReactivateAsync([
			firstSuspendedTenantId,
			firstSuspendedTenantId,
			secondSuspendedTenantId,
			activeTenantId,
			missingTenantId,
		]);

		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(item =>
			item.TenantId == activeTenantId
			&& item.Error == "Tenant is not suspended"
		);
		result.FailedItems.Should().ContainSingle(item =>
			item.TenantId == missingTenantId
			&& item.Error == "Tenant not found"
		);
		setup.Interceptor.TenantSelectCount.Should().Be(1);
		setup.Interceptor.TenantUpdateCount.Should().Be(1);

		(await GetTenantAsync(firstSuspendedTenantId)).Status
			.Should().Be(TenantStatus.Active);
		(await GetTenantAsync(secondSuspendedTenantId)).Status
			.Should().Be(TenantStatus.Active);
	}

	[Fact]
	public async Task
	ItShouldProcessDistinctDeleteTargetsWithSingleBatch() {
		var firstSuspendedTenantId = await SeedTenantAsync(TenantStatus.Suspended);
		var secondSuspendedTenantId = await SeedTenantAsync(TenantStatus.Suspended);
		var activeTenantId = await SeedTenantAsync(TenantStatus.Active);
		var missingTenantId = Guid.NewGuid();
		var setup = await CreateServiceAsync();

		await using var serviceDbContext = setup.DbContext;
		var result = await setup.Service.BulkDeleteAsync([
			firstSuspendedTenantId,
			firstSuspendedTenantId,
			secondSuspendedTenantId,
			activeTenantId,
			missingTenantId,
		]);

		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(item =>
			item.TenantId == activeTenantId
			&& item.Error == "Tenant is not suspended"
		);
		result.FailedItems.Should().ContainSingle(item =>
			item.TenantId == missingTenantId
			&& item.Error == "Tenant not found"
		);
		setup.Interceptor.TenantSelectCount.Should().Be(1);
		setup.Interceptor.TenantUpdateCount.Should().Be(1);

		(await GetTenantAsync(firstSuspendedTenantId)).IsDeleted
			.Should().BeTrue();
		(await GetTenantAsync(secondSuspendedTenantId)).IsDeleted
			.Should().BeTrue();
	}

	[Fact]
	public async Task
	ItShouldExcludeConcurrentlySuspendedTenantFromBulkSuspendSuccesses() {
		var raceTenantId = await SeedTenantAsync(TenantStatus.Active);
		var stableTenantId = await SeedTenantAsync(TenantStatus.Active);
		var setup = await CreateServiceAsync(cancellationToken =>
			SetTenantStatusAsync(
				raceTenantId,
				TenantStatus.Suspended,
				cancellationToken
			)
		);

		await using var serviceDbContext = setup.DbContext;
		var result = await setup.Service.BulkSuspendAsync([
			raceTenantId,
			stableTenantId,
		]);

		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.SucceededIds.Should().Equal(stableTenantId);
		result.FailedItems.Should().ContainSingle(item =>
			item.TenantId == raceTenantId
			&& item.Error == "Already suspended"
		);
	}

	[Fact]
	public async Task
	ItShouldExcludeConcurrentlyReactivatedTenantFromBulkReactivateSuccesses() {
		var raceTenantId = await SeedTenantAsync(TenantStatus.Suspended);
		var stableTenantId = await SeedTenantAsync(TenantStatus.Suspended);
		var setup = await CreateServiceAsync(cancellationToken =>
			SetTenantStatusAsync(
				raceTenantId,
				TenantStatus.Active,
				cancellationToken
			)
		);

		await using var serviceDbContext = setup.DbContext;
		var result = await setup.Service.BulkReactivateAsync([
			raceTenantId,
			stableTenantId,
		]);

		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.SucceededIds.Should().Equal(stableTenantId);
		result.FailedItems.Should().ContainSingle(item =>
			item.TenantId == raceTenantId
			&& item.Error == "Tenant is not suspended"
		);
	}

	[Fact]
	public async Task
	ItShouldExcludeConcurrentlyReactivatedTenantFromBulkDeleteSuccesses() {
		var raceTenantId = await SeedTenantAsync(TenantStatus.Suspended);
		var stableTenantId = await SeedTenantAsync(TenantStatus.Suspended);
		var setup = await CreateServiceAsync(cancellationToken =>
			SetTenantStatusAsync(
				raceTenantId,
				TenantStatus.Active,
				cancellationToken
			)
		);

		await using var serviceDbContext = setup.DbContext;
		var result = await setup.Service.BulkDeleteAsync([
			raceTenantId,
			stableTenantId,
		]);

		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.SucceededIds.Should().Equal(stableTenantId);
		result.FailedItems.Should().ContainSingle(item =>
			item.TenantId == raceTenantId
			&& item.Error == "Tenant is not suspended"
		);
		(await GetTenantAsync(raceTenantId)).IsDeleted.Should().BeFalse();
	}

	private async Task<Guid> SeedTenantAsync(TenantStatus status) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = new Tenant {
			Name = $"Bulk Lifecycle Service {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = 10,
		};

		dbContext.Tenant.Add(tenant);
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Tenant> GetTenantAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.Tenant
			.IgnoreQueryFilters()
			.SingleAsync(tenant => tenant.Id == tenantId);
	}

	private async Task SetTenantStatusAsync(
		Guid tenantId,
		TenantStatus status,
		CancellationToken cancellationToken
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		_ = await dbContext.Tenant
			.Where(tenant => tenant.Id == tenantId && !tenant.IsDeleted)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(tenant => tenant.Status, status)
					.SetProperty(tenant => tenant.UpdatedAt, DateTime.UtcNow),
				cancellationToken
			);
	}

	private async Task<ServiceSetup> CreateServiceAsync(
		Func<CancellationToken, Task>? beforeTenantUpdateAsync = null
	) {
		var connectionString = await GetConnectionStringAsync();
		var interceptor = new TenantCommandInterceptor(beforeTenantUpdateAsync);
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql(connectionString)
			.AddInterceptors(interceptor)
			.Options;
		var dbContext = new AppDbContext(options);
		var service = new TenantAsStaffService(
			dbContext,
			new InvitationEmailOutboxSignal(),
			new UploadAssetReferenceService(dbContext),
			NullLogger<TenantAsStaffService>.Instance
		);

		return new ServiceSetup(dbContext, service, interceptor);
	}

	private async Task<string> GetConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var connectionString = dbContext.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return connectionString;
	}

	private sealed record ServiceSetup(
		AppDbContext DbContext,
		TenantAsStaffService Service,
		TenantCommandInterceptor Interceptor
	);

	private sealed class TenantCommandInterceptor : DbCommandInterceptor {
		private readonly List<string> _commandTexts = [];
		private readonly Func<CancellationToken, Task>? _beforeTenantUpdateAsync;
		private bool _hasRunBeforeUpdate;

		public TenantCommandInterceptor(
			Func<CancellationToken, Task>? beforeTenantUpdateAsync
		) {
			_beforeTenantUpdateAsync = beforeTenantUpdateAsync;
		}

		public int TenantSelectCount {
			get {
				return _commandTexts.Count(commandText =>
					IsTenantCommand(commandText, "SELECT")
				);
			}
		}

		public int TenantUpdateCount {
			get {
				return _commandTexts.Count(commandText =>
					IsTenantCommand(commandText, "UPDATE")
				);
			}
		}

		public override async ValueTask<InterceptionResult<DbDataReader>>
		ReaderExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<DbDataReader> result,
			CancellationToken cancellationToken = default
		) {
			_commandTexts.Add(command.CommandText);
			await RunBeforeTenantUpdateAsync(command, cancellationToken);
			return result;
		}

		public override async ValueTask<InterceptionResult<int>>
		NonQueryExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result,
			CancellationToken cancellationToken = default
		) {
			_commandTexts.Add(command.CommandText);
			await RunBeforeTenantUpdateAsync(command, cancellationToken);
			return result;
		}

		private async Task RunBeforeTenantUpdateAsync(
			DbCommand command,
			CancellationToken cancellationToken
		) {
			if (
				_hasRunBeforeUpdate
				|| _beforeTenantUpdateAsync is null
				|| !IsTenantCommand(command.CommandText, "UPDATE")
			) {
				return;
			}

			_hasRunBeforeUpdate = true;
			await _beforeTenantUpdateAsync(cancellationToken);
		}

		private static bool IsTenantCommand(
			string commandText,
			string operation
		) {
			return commandText.TrimStart()
				.StartsWith(operation, StringComparison.OrdinalIgnoreCase)
				&& commandText.Contains(
					"tenants",
					StringComparison.OrdinalIgnoreCase
				);
		}
	}

}
