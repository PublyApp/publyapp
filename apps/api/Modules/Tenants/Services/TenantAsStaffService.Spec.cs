using System.Data.Common;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Services;

public sealed class TenantAsStaffServiceSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public TenantAsStaffServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldStillReturnSuccessWhenLogoReferenceCheckFailsAfterSave() {
		var initialLogoUrl = "/files/uploads/2026/07/11111111-2222-3333-4444-555555555555.png";
		var replacementLogoUrl = "https://cdn.example.com/replaced-logo.png";

		var tenantId = await SeedTenantAsync(initialLogoUrl);
		var connectionString = await GetConnectionStringAsync();
		var interceptor = new FailingLogoReferenceCheckAfterUpdateInterceptor();
		var fileStorage = new TrackingFileStorage();

		await using var serviceDbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.AddInterceptors(interceptor)
				.Options
		);

		var service = new TenantAsStaffService(
			serviceDbContext,
			fileStorage,
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
		interceptor.HasFailed.Should().BeTrue();
		fileStorage.DeleteAsyncInvocations.Should().Be(0);

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
			if (!_hasSeenUpdate && IsTenantUpdateCommand(commandText)) {
				_hasSeenUpdate = true;
				return;
			}

			if (_hasSeenUpdate && !_hasFailed) {
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
	}

	private sealed class TrackingFileStorage : IFileStorage {
		private int _deleteAsyncInvocations;

		public string RootPath {
			get { return "/tmp"; }
		}

		public int DeleteAsyncInvocations {
			get { return _deleteAsyncInvocations; }
		}

		public Task<string> SaveAsync(
			Stream content,
			string extension,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult($"saved{extension}");
		}

		public Task DeleteAsync(
			string relativePath,
			CancellationToken cancellationToken = default
		) {
			_deleteAsyncInvocations += 1;
			return Task.CompletedTask;
		}
	}
}
