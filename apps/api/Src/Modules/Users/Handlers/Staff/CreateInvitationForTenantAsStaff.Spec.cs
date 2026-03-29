namespace MainApi.Src.Modules.Users.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Profiles.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class CreateInvitationForTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateInvitationForTenantAsStaffSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldSendTenantInvitationEmailWhenInvitationIsCreated() {
		var fakeEmailSender = _fixture.GetFakeEmailSender();
		fakeEmailSender.Clear();

		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var inviteeEmail =
			$"tenant-invite-{Guid.NewGuid():N}@example.com";
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.InviteFn(
				tenantId.ToString()
			)
		);
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email = inviteeEmail,
				accountLevel = "User"
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var sentEmail = await WaitForSingleEmailAsync(
			fakeEmailSender,
			inviteeEmail
		);

		sentEmail.Should().NotBeNull();
		sentEmail!.To.Should().Be(inviteeEmail);
		sentEmail.Subject.Should()
			.Contain(SeedConstants.Tenants.AcmeName);
		sentEmail.HtmlBody.Should()
			.Contain("Accept the invitation");
	}

	[Fact]
	public async Task
	ItShouldCreateTenantInvitationForExistingNonStaffUserFromAnotherTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.InviteFn(
					tenantId.ToString()
				)
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email = SeedConstants.Tenants.TechStartUserEmail,
				accountLevel = "User"
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		using var scope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var invitationProfiles = await dbContext.InvitationProfile
			.Where(ip => ip.InvitationId == responseBody!.InvitationId)
			.ToListAsync();

		invitationProfiles.Should().HaveCount(1);
	}

	[Fact]
	public async Task
	ItShouldRejectTenantInvitationWhenExistingUserAlreadyBelongsToTargetTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.InviteFn(
					tenantId.ToString()
				)
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email = SeedConstants.Tenants.AcmeUserEmail,
				accountLevel = "User"
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var responseBody =
			await response.Content.ReadAsStringAsync();
		responseBody.Should()
			.Contain("user-already-member-of-tenant");
	}

	[Fact]
	public async Task
	ItShouldRejectTenantInvitationWhenExistingUserHasStaffAccount() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.InviteFn(
					tenantId.ToString()
				)
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email = SeedConstants.Staff.UserEmail,
				accountLevel = "User"
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var responseBody =
			await response.Content.ReadAsStringAsync();
		responseBody.Should()
			.Contain("user-has-staff-account");
	}

	[Fact]
	public async Task
	ItShouldUseDefaultTenantProfileMarkerInsteadOfProfileName() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using (var scope =
			_fixture.Factory.Services.CreateScope()) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			var renamedDefaultProfile = await dbContext.Profile
				.Where(p => p.TenantId == tenantId && p.Scope == ProfileScope.Tenant && p.IsDefault)
				.FirstOrDefaultAsync();

			if (renamedDefaultProfile is null) {
				renamedDefaultProfile = Profile.CreateTenantProfile(
					tenantId,
					name: "Default profile",
					description: "Default profile with no permissions",
					isDefault: true
				);

				await dbContext.Profile.AddAsync(renamedDefaultProfile);
			}

			renamedDefaultProfile.Name = "Base access";
			await dbContext.SaveChangesAsync();
		}

		var inviteeEmail =
			$"tenant-default-profile-{Guid.NewGuid():N}@example.com";
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.InviteFn(
					tenantId.ToString()
				)
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email = inviteeEmail,
				accountLevel = "User"
			}
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var responseBody =
			await response.Content
				.ReadFromJsonAsync<InvitationCreatedForTenantResponse>();
		responseBody.Should().NotBeNull();

		using (var scope =
			_fixture.Factory.Services.CreateScope()) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			var profileId = await dbContext.InvitationProfile
				.Where(ip => ip.InvitationId == responseBody!.InvitationId)
				.Select(ip => ip.ProfileId)
				.SingleAsync();

			var assignedProfile = await dbContext.Profile
				.Where(p => p.Id == profileId)
				.SingleAsync();

			assignedProfile.IsDefault.Should().BeTrue();
			assignedProfile.Name.Should().Be("Base access");
		}
	}

	private sealed record InvitationCreatedForTenantResponse {
		public required Guid InvitationId { get; init; }
		public DateTime ExpiresAt { get; init; }
	}

	private static async Task<EmailRequest?>
	WaitForSingleEmailAsync(
		MainApi.Src.Lib.Testing.Fakes.FakeEmailSender fakeEmailSender,
		string email
	) {
		const int maxAttempts = 10;

		for (var attempt = 0; attempt < maxAttempts; attempt++) {
			var sentEmail = fakeEmailSender.SentEmails
				.SingleOrDefault(x => x.To == email);

			if (sentEmail is not null) {
				return sentEmail;
			}

			await Task.Delay(100);
		}

		return null;
	}
}
