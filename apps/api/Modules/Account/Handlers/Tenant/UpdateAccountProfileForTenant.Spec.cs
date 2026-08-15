
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Account.Services;

using Xunit;

namespace PublyApp.Api.Modules.Account.Handlers.Tenant;

// Mutates the shared seeded Acme admin's profile fields; joins the
// DisableParallelization collection so it never races the other classes that
// touch Acme (TenantAuthFilterSpec, UpdateTenantAsStaffSpec, ...). Restores
// the original values in `finally`.
[Collection("AcmeTenantMutation")]
public sealed class UpdateAccountProfileForTenantSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateAccountProfileForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl() {
		return PathUtils.Join(
			Routes.Tenant.Root,
			Routes.Account.ForTenant.Root,
			Routes.Account.ForTenant.UpdateProfile
		);
	}

	[Fact]
	public async Task
	ItShouldUpdateTheProfileAndReturnTheUpdatedValues() {
		var (token, userId, acmeId, original) =
			await PrepareAcmeAdminAsync();

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetUrl()
			)
				.WithSessionToken(token)
				.WithTenantId(acmeId);

			request.Content = JsonContent.Create(new {
				firstName = "Updated",
				lastName = "Profile",
				avatarUrl = "https://cdn.example.test/avatar.png",
			});

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<AccountProfileResult>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.Id.Should().Be(userId);
			result.FirstName.Should().Be("Updated");
			result.LastName.Should().Be("Profile");
			result.AvatarUrl.Should()
				.Be("https://cdn.example.test/avatar.png");

			var persisted = await GetUserRowAsync(userId);
			persisted.FirstName.Should().Be("Updated");
			persisted.LastName.Should().Be("Profile");
			persisted.AvatarUrl.Should()
				.Be("https://cdn.example.test/avatar.png");
		} finally {
			await RestoreProfileAsync(userId, original);
		}
	}

	[Fact]
	public async Task
	ItShouldClearTheAvatarAndLeaveAbsentFieldsUntouched() {
		var (token, userId, acmeId, original) =
			await PrepareAcmeAdminAsync();

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetUrl()
			)
				.WithSessionToken(token)
				.WithTenantId(acmeId);

			request.Content = JsonContent.Create(new {
				avatarUrl = (string?)null,
			});

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<AccountProfileResult>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			// Absent field = untouched: firstName/lastName were omitted from
			// the PATCH, so they must survive exactly as they were.
			result.AvatarUrl.Should().BeNull();
			result.FirstName.Should().Be(original.FirstName);
			result.LastName.Should().Be(original.LastName);

			var persisted = await GetUserRowAsync(userId);
			persisted.AvatarUrl.Should().BeNull();
			persisted.FirstName.Should().Be(original.FirstName);
			persisted.LastName.Should().Be(original.LastName);
		} finally {
			await RestoreProfileAsync(userId, original);
		}
	}

	[Fact]
	public async Task
	ItShouldAcceptARootRelativeServedUploadAvatarUrl() {
		var (token, userId, acmeId, original) =
			await PrepareAcmeAdminAsync();
		const string servedUploadUrl =
			"/files/uploads/2026/08/11111111-2222-3333-4444-555555555555.png";

		try {
			using var request = new HttpRequestMessage(
				HttpMethod.Patch,
				GetUrl()
			)
				.WithSessionToken(token)
				.WithTenantId(acmeId);

			request.Content = JsonContent.Create(new {
				avatarUrl = servedUploadUrl,
			});

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var result = await response.Content
				.ReadFromJsonAsync<AccountProfileResult>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			// The root-relative served-upload form is persisted as-is, so the
			// stored value never bakes in today's API origin.
			result.AvatarUrl.Should().Be(servedUploadUrl);

			var persisted = await GetUserRowAsync(userId);
			persisted.AvatarUrl.Should().Be(servedUploadUrl);
		} finally {
			await RestoreProfileAsync(userId, original);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForAnEmptyBody() {
		var (token, _, acmeId, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(token)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.BadRequest);
		problem.Detail.Should().Be("No fields to update");
	}

	[Fact]
	public async Task
	ItShouldRejectAnInvalidAvatarUrl() {
		var (token, _, acmeId, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(token)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			avatarUrl = "not-a-url",
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("AvatarUrl");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenFirstNameExceedsMaxLength() {
		var (token, _, acmeId, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(token)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			firstName = new string('a', 129),
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("FirstName");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenSpacePaddedFirstNameExceedsMaxLength() {
		// The bound must apply to the raw length: the getter persists the
		// untrimmed value, so 1000 spaces + "a" (trimmed length 1) must still
		// 422 rather than landing unbounded in the DB.
		var (token, _, acmeId, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(token)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			firstName = new string(' ', 1000) + "a",
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("FirstName");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenAvatarUrlExceedsMaxLength() {
		var (token, _, acmeId, _) =
			await PrepareAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl()
		)
			.WithSessionToken(token)
			.WithTenantId(acmeId);

		request.Content = JsonContent.Create(new {
			avatarUrl = $"https://example.com/{new string('a', 1025)}",
		});

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("AvatarUrl");
	}

	// Same unreachable-through-HTTP reasoning as
	// GetAccountProfileForTenantSpec.ItShouldReturnNullWhenTheTenantAccountIsMissing:
	// the TenantAuthFilter answers 403 first, so the handler's NotFound branch
	// is covered at the service seam — the null contract the handler maps.
	[Fact]
	public async Task
	ItShouldReturnNullWhenTheTenantAccountIsMissing() {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<IAccountProfileService>();

		var result = await service.UpdateAccountProfileAsync(
			new UpdateAccountProfileArgs(
				UserId: Guid.NewGuid(),
				TenantId: Guid.NewGuid(),
				FirstName: PatchField<string?>.Set("Updated"),
				LastName: PatchField<string?>.Absent(),
				AvatarUrl: PatchField<string?>.Absent()
			)
		);

		result.Should().BeNull();
	}

	private async Task<(string Token, Guid UserId, Guid TenantId,
		UserRow Original)> PrepareAcmeAdminAsync() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var authDataRequest = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserAuthData
		).WithSessionToken(token);

		using var authDataResponse =
			await _http.SendAsync(authDataRequest);
		authDataResponse.EnsureSuccessStatusCode();

		var authData = await authDataResponse.Content
			.ReadFromJsonAsync<AuthDataResponse>();
		if (authData is null) {
			throw new InvalidOperationException(
				"Failed to deserialize user-auth-data response"
			);
		}

		var original = await GetUserRowAsync(authData.Id);

		return (token, authData.Id, acmeId, original);
	}

	private async Task<UserRow> GetUserRowAsync(Guid userId) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		return await dbContext.User
			.AsNoTracking()
			.Where(user => user.Id == userId)
			.Select(user => new UserRow(
				user.FirstName,
				user.LastName,
				user.AvatarUrl
			))
			.SingleAsync();
	}

	private async Task RestoreProfileAsync(
		Guid userId,
		UserRow original
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		await dbContext.User
			.Where(user => user.Id == userId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(user => user.FirstName, original.FirstName)
				.SetProperty(user => user.LastName, original.LastName)
				.SetProperty(user => user.AvatarUrl, original.AvatarUrl)
				.SetProperty(user => user.UpdatedAt, DateTime.UtcNow));
	}

	private sealed record AuthDataResponse(Guid Id);

	private sealed record UserRow(
		string? FirstName,
		string? LastName,
		string? AvatarUrl
	);
}
