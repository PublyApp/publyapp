
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class GetRedirectCodeSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetRedirectCodeSpec(
		ApiFixture fixture
	) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task
	ItShouldReturnTenantPickerWhenNoSuspended() {
		// Alice has 2 active tenants -> tenant-picker
		var aliceToken = await _AuthClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetRedirectCode
		).WithSessionToken(aliceToken);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RedirectCodeResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.HasSuspendedTenants.Should().BeFalse();
		result.RedirectCode.Should().Be("tenant-picker");
	}

	[Fact]
	public async Task
	ItShouldRedirectToTenantWithActiveHint() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var aliceToken = await _AuthClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetRedirectCode}"
			+ $"?tenant_id={acmeId}";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(aliceToken);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RedirectCodeResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.RedirectCode.Should()
					.Be(acmeId.ToString());
		result.HasSuspendedTenants.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnValidationErrorForMalformedTenantId() {
		var aliceToken = await _AuthClient.LoginAsync(
			TestConstants.AliceEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetRedirectCode}"
			+ "?tenant_id=not-a-guid";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(aliceToken);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			return;
		}
		problem.Errors.Should().ContainKey("tenant_id");
		problem.Errors.Should().NotContainKey(string.Empty);
	}

	[Fact]
	public async Task
	ItShouldSetHasSuspendedTrueWhenOneSuspended() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend Acme
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_Http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var aliceToken = await _AuthClient.LoginAsync(
				TestConstants.AliceEmail,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetRedirectCode
			).WithSessionToken(aliceToken);

			using var response =
				await _Http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.HasSuspendedTenants.Should().BeTrue();
			// 1 active tenant left -> direct redirect
			var techStartId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_Http,
						staffToken,
						SeedConstants.Tenants.TechStartName
					);
			result.RedirectCode.Should()
				.Be(techStartId.ToString());
		} finally {
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_Http, staffToken, acmeId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldFallThroughWhenHintPointsToSuspended() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var techStartId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Suspend Acme
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_Http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var aliceToken =
				await _AuthClient.LoginAsync(
					TestConstants.AliceEmail,
					TestConstants.SeedPassword
				);

			// Hint to the suspended tenant
			var url = $"{Routes.Auth.GetRedirectCode}"
				+ $"?tenant_id={acmeId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(aliceToken);

			using var response =
				await _Http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			result.Should().NotBeNull();
			// Hint invalid -> 1 active tenant -> direct
			Assert.NotNull(result);
			result.RedirectCode.Should()
							.Be(techStartId.ToString());
			result.HasSuspendedTenants.Should().BeTrue();
		} finally {
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_Http, staffToken, acmeId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldRedirectWhenHintIsActiveWithOtherSuspended() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var techStartId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Suspend Acme
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_Http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var aliceToken =
				await _AuthClient.LoginAsync(
					TestConstants.AliceEmail,
					TestConstants.SeedPassword
				);

			// Hint to the active tenant
			var url = $"{Routes.Auth.GetRedirectCode}"
				+ $"?tenant_id={techStartId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(aliceToken);

			using var response =
				await _Http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.RedirectCode.Should()
							.Be(techStartId.ToString());
			result.HasSuspendedTenants.Should().BeTrue();
		} finally {
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_Http, staffToken, acmeId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnTenantPickerWhenAllSuspended() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var techStartId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Suspend both tenants
		using var s1 =
			await TenantTestHelper.SuspendTenantAsync(
				_Http, staffToken, acmeId
			);
		s1.StatusCode.Should().Be(HttpStatusCode.OK);
		using var s2 =
			await TenantTestHelper.SuspendTenantAsync(
				_Http, staffToken, techStartId
			);
		s2.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var aliceToken =
				await _AuthClient.LoginAsync(
					TestConstants.AliceEmail,
					TestConstants.SeedPassword
				);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetRedirectCode
			).WithSessionToken(aliceToken);

			using var response =
				await _Http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.RedirectCode.Should()
							.Be("tenant-picker");
			result.HasSuspendedTenants.Should().BeTrue();
		} finally {
			using var r1 =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_Http, staffToken, acmeId
					);
			using var r2 =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_Http, staffToken, techStartId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedForActiveUserWithoutTenantMemberships() {
		var seeded = await _SeedUserWithoutMembershipsAsync();
		try {
			var token = await _AuthClient.LoginAsync(
				seeded.Email,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetRedirectCode
			).WithSessionToken(token);
			using var response = await _Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.RedirectCode.Should().Be("unauthorized");
		} finally {
			await _DeleteSeededRedirectCodeUserAsync(seeded);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnTenantPickerWhenAllTenantsAreDeleted() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var seeded = await _SeedUserWithTenantAsync();
		try {
			using var suspend =
				await TenantTestHelper.SuspendTenantAsync(
					_Http, staffToken, seeded.TenantId
				);
			suspend.StatusCode.Should().Be(HttpStatusCode.OK);
			using var delete =
				await TenantTestHelper.DeleteTenantAsync(
					_Http, staffToken, seeded.TenantId
				);
			delete.StatusCode.Should().Be(HttpStatusCode.OK);

			var token = await _AuthClient.LoginAsync(
				seeded.Email,
				TestConstants.SeedPassword
			);

			var pickerRequest = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetUserTenantsForPicker
			).WithSessionToken(token);
			using var pickerResponse =
				await _Http.SendAsync(pickerRequest);

			pickerResponse.StatusCode.Should().Be(HttpStatusCode.OK);
			var pickerResult = await pickerResponse.Content
				.ReadFromJsonAsync<PickerResponse>();
			pickerResult.Should().NotBeNull();
			Assert.NotNull(pickerResult);
			pickerResult.TotalCount.Should().Be(0);
			pickerResult.HasDeletedTenants.Should().BeTrue();

			var redirectRequest = new HttpRequestMessage(
				HttpMethod.Get,
				Routes.Auth.GetRedirectCode
			).WithSessionToken(token);
			using var redirectResponse =
				await _Http.SendAsync(redirectRequest);

			redirectResponse.StatusCode.Should().Be(HttpStatusCode.OK);
			var redirectResult = await redirectResponse.Content
				.ReadFromJsonAsync<RedirectCodeResponse>();
			redirectResult.Should().NotBeNull();
			Assert.NotNull(redirectResult);
			redirectResult.RedirectCode.Should().Be("tenant-picker");
		} finally {
			await _DeleteSeededRedirectCodeUserAsync(seeded);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnStaffForStaffUser() {
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetRedirectCode
		).WithSessionToken(staffToken);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RedirectCodeResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.RedirectCode.Should().Be("staff");
	}

	[Fact]
	public async Task
	ItShouldDirectRedirectForSingleActiveTenant() {
		// Acme admin has 1 tenant -> direct redirect
		var staffToken =
			await _AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var acmeAdminToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetRedirectCode
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<RedirectCodeResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.RedirectCode.Should()
					.Be(acmeId.ToString());
		result.HasSuspendedTenants.Should().BeFalse();
	}

	private async Task<SeededRedirectCodeUser>
	_SeedUserWithTenantAsync() {
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var email = $"redirect-code-deleted-{Guid.NewGuid():N}@example.com";
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = "RedirectCode",
			LastName = "Deleted",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		var tenant = new Tenant {
			Name = $"Redirect Code Deleted {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		await dbContext.UserAccount.AddAsync(
			UserAccount.CreateTenantAccount(
				user.GetRequiredId(),
				tenant.GetRequiredId(),
				AccountLevel.User
			)
		);
		await dbContext.SaveChangesAsync();

		return new SeededRedirectCodeUser {
			Email = email,
			UserId = user.GetRequiredId(),
			TenantId = tenant.GetRequiredId(),
		};
	}

	private async Task<SeededRedirectCodeUserWithoutMemberships>
	_SeedUserWithoutMembershipsAsync() {
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var email = $"redirect-code-never-invited-{Guid.NewGuid():N}@example.com";
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = "RedirectCode",
			LastName = "NeverInvited",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		return new SeededRedirectCodeUserWithoutMemberships {
			Email = email,
			UserId = user.GetRequiredId(),
		};
	}

	private async Task _DeleteSeededRedirectCodeUserAsync(
		SeededRedirectCodeUser seeded
	) {
		await _DeleteSeededRedirectCodeUserAsync(
			seeded.UserId,
			seeded.TenantId
		);
	}

	private async Task _DeleteSeededRedirectCodeUserAsync(
		SeededRedirectCodeUserWithoutMemberships seeded
	) {
		await _DeleteSeededRedirectCodeUserAsync(seeded.UserId, null);
	}

	private async Task _DeleteSeededRedirectCodeUserAsync(
		Guid userId,
		Guid? tenantId
	) {
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		await dbContext.Session
			.Where(s => s.UserId == userId)
			.ExecuteDeleteAsync();
		await dbContext.UserAccount
			.Where(ua => ua.UserId == userId)
			.ExecuteDeleteAsync();
		if (tenantId is Guid tenantIdValue) {
			await dbContext.Tenant
				.Where(t => t.Id == tenantIdValue)
				.ExecuteDeleteAsync();
		}
		await dbContext.User
			.Where(u => u.Id == userId)
			.ExecuteDeleteAsync();
	}

	private sealed record SeededRedirectCodeUser {
		public required string Email { get; init; }
		public required Guid UserId { get; init; }
		public required Guid TenantId { get; init; }
	}

	private sealed record SeededRedirectCodeUserWithoutMemberships {
		public required string Email { get; init; }
		public required Guid UserId { get; init; }
	}

	private record PickerResponse {
		public int TotalCount { get; init; }
		public bool HasDeletedTenants { get; init; }
	}

	private record RedirectCodeResponse {
		public string RedirectCode { get; init; }
			= string.Empty;
		public bool HasSuspendedTenants { get; init; }
	}
}
