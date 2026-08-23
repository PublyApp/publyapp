using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Uploads.Handlers.Staff;

/// <summary>
/// Endpoint-level admission specs (#807 F1). One class per scenario family: each
/// test class gets its OWN cloned database via ApiFixture, and these scenarios
/// rewrite durable budget rows — sharing a database would leak accounting between
/// them. Budget numbers come from upload_budgets rows seeded from environment
/// config, so tests drive them with direct SQL against their private clone.
/// </summary>
public sealed class UploadAdmissionEndpointSpec : IClassFixture<ApiFixture> {
	private const string Purpose = UploadAdmissionService.StaffUploadPurpose;

	private static readonly byte[] PngBytes = [
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x00, 0x00
	];

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UploadAdmissionEndpointSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldRejectAnOverBudgetUploadBeforeStorageAndAudit() {
		await FillGlobalBudgetAsync(_fixture);

		var storage = _fixture.Factory.Services.GetRequiredService<IFileStorage>();
		var filesBefore = GetStoredFiles(storage.RootPath);
		var auditCountBefore = await CountUploadAuditsAsync();
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			BuildUploadRequest(token)
		);

		response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
		response.Content.Headers.ContentType.Should().NotBeNull();
		response.Content.Headers.ContentType!.MediaType
			.Should().Be("application/problem+json");
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be(StatusCodes.Status429TooManyRequests);
		problem.TranslationKey.Should().Be(ResponseKeys.UploadBudgetExhausted);

		GetStoredFiles(storage.RootPath).Should().Equal(filesBefore);
		(await CountUploadAuditsAsync()).Should().Be(auditCountBefore);
	}

	/// <summary>
	/// Fills the GLOBAL budget to the brim through the real service so the next
	/// admission — from any user — is refused before touching storage or audit.
	/// Commits each chunk with a unique stored path, matching mid-life accounting.
	/// </summary>
	internal static async Task FillGlobalBudgetAsync(ApiFixture fixture) {
		var chunk = AppEnvironment.Instance.UPLOAD_PER_STAFF_MAX_BYTES;
		var remaining = AppEnvironment.Instance.UPLOAD_GLOBAL_MAX_BYTES;

		while (remaining > 0) {
			var take = Math.Min(chunk, remaining);
			var fillerUserId = await SeedUserAsync(fixture);
			var service = CreateFreshService(fixture);
			await using var scope =
				await service.BeginReservationAsync(fillerUserId, take, Purpose);
			scope.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>();
			var asset = ((UploadAdmissionResult.Accepted)scope.Admission).Asset;
			asset.RelativePath = $"uploads/spec-filler/{Guid.NewGuid():N}.png";
			scope.MarkCommitPending();
			await scope.CommitAsync();
			remaining -= take;
		}
	}

	/// <summary>Assets carry created_by_user_id → a REAL user row is required.</summary>
	internal static async Task<Guid> SeedUserAsync(ApiFixture fixture) {
		using var scope = fixture.Factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"upload-endpoint-spec-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	internal static UploadAdmissionService CreateFreshService(ApiFixture fixture) {
		using var scope = fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>().Database.GetConnectionString();
		if (string.IsNullOrEmpty(connectionString)) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}
		return new UploadAdmissionService(new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		));
	}

	private async Task<int> CountUploadAuditsAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.AuditLog.CountAsync(
			log => log.Action == AuditActions.UploadCreated
		);
	}

	private static HashSet<string> GetStoredFiles(string rootPath) {
		return Directory.Exists(rootPath)
			? Directory.EnumerateFiles(rootPath, "*", SearchOption.AllDirectories)
				.ToHashSet(StringComparer.Ordinal)
			: [];
	}

	internal static HttpRequestMessage BuildUploadRequest(string token) {
		var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(PngBytes);
		fileContent.Headers.ContentType =
			new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", "over-budget.png");

		return new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Uploads.ForStaff.Root,
				Routes.Uploads.ForStaff.Create
			)
		) {
			Content = content
		}.WithSessionToken(token);
	}
}

/// <summary>
/// Shrinks every durable budget to just-over-two-files BEFORE any upload, then
/// proves real HTTP uploads consume the configured budget and the third is
/// refused — the acceptance-level shape of "budgets are config, enforced durably".
/// Runs in its own database clone (separate spec class) so the shrunk budgets
/// cannot touch the other scenario.
/// </summary>
public sealed class UploadAdmissionConfiguredBudgetEndpointSpec : IClassFixture<ApiFixture> {
	private static readonly byte[] PngBytes = [
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x00, 0x00
	];

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UploadAdmissionConfiguredBudgetEndpointSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldRejectTheRequestAfterActualUploadsFillTheConfiguredBudget() {
		// Force budget-row seeding via a COMMITTED warmup, then retune the
		// "config": max fits the warmup's bytes plus EXACTLY two files everywhere.
		// Operators tune budgets the same way — values in upload_budgets, not
		// schema or redeploy (#807).
		var token = await _authClient.LoginAsStaffAdminAsync();
		var warmupService = UploadAdmissionEndpointSpec.CreateFreshService(_fixture);
		await using var warmup = await warmupService.BeginReservationAsync(
			await UploadAdmissionEndpointSpec.SeedUserAsync(_fixture),
			PngBytes.Length,
			UploadAdmissionService.StaffUploadPurpose
		);
		if (warmup.Admission is not UploadAdmissionResult.Accepted warmupAccepted) {
			throw new InvalidOperationException(
				"Warmup reservation was unexpectedly refused."
			);
		}
		// COMMIT the warmup: budget rows are seeded durably AND the budget-tuple
		// locks are released. Holding the reservation open instead would stall
		// every HTTP upload below on the uncommitted (global, NULL) insert —
		// ON CONFLICT DO NOTHING must WAIT for the other transaction's fate.
		warmupAccepted.Asset.RelativePath =
			$"uploads/spec-warmup/{Guid.NewGuid():N}.png";
		warmup.MarkCommitPending();
		await warmup.CommitAsync();
		// Warmup bytes stay committed against every budget, so the tuned max must
		// still admit exactly two more full files (and refuse a third).
		await RetuneAllBudgetsAsync(maxBytes: (PngBytes.Length * 3) + 1);

		var storage = _fixture.Factory.Services.GetRequiredService<IFileStorage>();
		var filesBefore = GetStoredFiles(storage.RootPath);
		var auditsBefore = await CountUploadAuditsAsync();

		for (var index = 0; index < 2; index += 1) {
			using var accepted = await _http.SendAsync(BuildUploadRequest(token));
			accepted.StatusCode.Should().Be(HttpStatusCode.Created);
		}

		using var rejected = await _http.SendAsync(BuildUploadRequest(token));
		rejected.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
		GetStoredFiles(storage.RootPath).Count.Should().Be(filesBefore.Count + 2);
		(await CountUploadAuditsAsync()).Should().Be(auditsBefore + 2);
	}

	private static HttpRequestMessage BuildUploadRequest(string token) {
		return UploadAdmissionEndpointSpec.BuildUploadRequest(token);
	}

	private async Task RetuneAllBudgetsAsync(long maxBytes) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.Database.ExecuteSqlAsync(
			$"UPDATE upload_budgets SET max_bytes = {maxBytes}",
			CancellationToken.None
		);
	}

	private async Task<int> CountUploadAuditsAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.AuditLog.CountAsync(
			log => log.Action == AuditActions.UploadCreated
		);
	}

	private static HashSet<string> GetStoredFiles(string rootPath) {
		return Directory.Exists(rootPath)
			? Directory.EnumerateFiles(rootPath, "*", SearchOption.AllDirectories)
				.ToHashSet(StringComparer.Ordinal)
			: [];
	}
}
