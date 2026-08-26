
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
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff {
	public sealed class FindInvitationsForTenantAsStaffSpec
		: IClassFixture<ApiFixture> {
		private readonly ApiFixture _fixture;
		private readonly HttpClient _http;
		private readonly TestAuthClient _authClient;

		public FindInvitationsForTenantAsStaffSpec(ApiFixture fixture) {
			_fixture = fixture;
			_http = fixture.HttpClient;
			_authClient = new TestAuthClient(_http);
		}

		#region Happy Path Tests

		[Fact]
		public async Task
		ItShouldReturnOkWithTenantInvitationsList() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(tenantId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().NotBeNull();
		}

		[Fact]
		public async Task
		ItShouldReturnInvitationWithCorrectShape() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create a fresh invitation to ensure we have data
			string inviteeEmail =
				$"find-shape-{Guid.NewGuid():N}@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				inviteeEmail
			);

			string url = GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().NotBeEmpty();

			InvitationListItemDto? invitation = result.Data
				.FirstOrDefault(i =>
					i.Email.Equals(inviteeEmail, StringComparison.OrdinalIgnoreCase)
				);
			_ = invitation.Should().NotBeNull();
			Assert.NotNull(invitation);
			_ = invitation.Id.Should().NotBeEmpty();
			_ = invitation.Email.Should().NotBeNullOrEmpty();
			_ = invitation.Scope.Should().Be("Tenant");
			_ = invitation.ProfileName.Should().BeNull();
			_ = invitation.Profiles.Should().BeEmpty();
			_ = invitation.AccountLevel.Should().Be("User");
			_ = invitation.Status.Should().Be("Pending");
			_ = invitation.ExpiresAt.Should().BeAfter(DateTime.UtcNow);
			_ = invitation.CreatedAt.Should().BeBefore(DateTime.UtcNow.AddMinutes(1));
			_ = invitation.InvitedByName.Should().NotBeNullOrEmpty();
		}

		[Fact]
		public async Task
		ItShouldReturnProfilesInInvitationListRows() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string inviteeEmail =
				$"tenant-list-profiles-{Guid.NewGuid():N}@example.com";
			using (IServiceScope setupScope = _fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = setupScope.ServiceProvider
					.GetRequiredService<AppDbContext>();

				var profileA = Profile.CreateTenantProfile(
					tenantId,
					name: $"tenant-profile-list-a-{Guid.NewGuid():N}",
					description: "Invitation list profile A"
				);
				var profileB = Profile.CreateTenantProfile(
					tenantId,
					name: $"tenant-profile-list-b-{Guid.NewGuid():N}",
					description: "Invitation list profile B"
				);

				await dbContext.Profile.AddRangeAsync(profileA, profileB);
				await dbContext.SaveChangesAsync();

				var createRequest = CreateTenantInviteRequest(
					staffToken,
					tenantId.ToString(),
					new {
						email = inviteeEmail,
						accountLevel = "User",
						profileIds = new[] {
							profileA.GetRequiredId().ToString(),
							profileB.GetRequiredId().ToString(),
						},
					}
				);

				using HttpResponseMessage createResponse =
					await _http.SendAsync(createRequest);
				createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
			}

			string url = GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);

			InvitationListItemDto? invitation = result.Data
				.FirstOrDefault(i => i.Email.Equals(inviteeEmail, StringComparison.OrdinalIgnoreCase));
			_ = invitation.Should().NotBeNull();
			Assert.NotNull(invitation);
			_ = invitation.Profiles.Should().HaveCount(2);
		}

		[Fact]
		public async Task
		ItShouldReturnAccountLevelForTenantAdminInviteWithoutProfiles() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string inviteeEmail =
				$"admin-no-profile-{Guid.NewGuid():N}@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				inviteeEmail,
				"Admin"
			);

			string url = GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			InvitationListItemDto? invitation = result.Data
				.FirstOrDefault(i =>
					i.Email.Equals(inviteeEmail, StringComparison.OrdinalIgnoreCase)
				);
			_ = invitation.Should().NotBeNull();
			Assert.NotNull(invitation);
			_ = invitation.ProfileName.Should().BeNull();
			_ = invitation.AccountLevel.Should().Be("Admin");
		}

		#endregion

		#region Tenant Scoping Isolation Tests

		[Fact]
		public async Task
		ItShouldNotLeakInvitationsFromOtherTenants() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid acmeTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);
			Guid techStartTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.TechStartName
					);

			// Create invitations in both tenants
			string acmeEmail =
				$"acme-isolated-{Guid.NewGuid():N}@example.com";
			string techStartEmail =
				$"techstart-isolated-{Guid.NewGuid():N}@example.com";

			_ = await CreateTenantInvitationAsync(
				staffToken,
				acmeTenantId,
				acmeEmail
			);
			_ = await CreateTenantInvitationAsync(
				staffToken,
				techStartTenantId,
				techStartEmail
			);

			// Query Acme invitations
			string url = GetFindUrl(acmeTenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i => i.Email.Equals(acmeEmail, StringComparison.OrdinalIgnoreCase)
						);
			_ = result.Data.Should().NotContain(
				i => i.Email.Equals(techStartEmail, StringComparison.OrdinalIgnoreCase)
			);
		}

		#endregion

		#region Cursor Pagination Tests

		[Fact]
		public async Task
		ItShouldReturnNextCursorWhenMoreResultsExist() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create multiple invitations
			for (int i = 0; i < 3; i++) {
				string email =
					$"cursor-pag-{i}-{Guid.NewGuid():N}@example.com";
				_ = await CreateTenantInvitationAsync(
					staffToken,
					tenantId,
					email
				);
			}

			string url = GetFindUrl(tenantId, limit: 1);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().HaveCount(1);
			_ = result.NextCursor.Should()
				.NotBeNullOrEmpty();
		}

		[Fact]
		public async Task
		ItShouldReturnSecondPageWhenCursorProvided() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create multiple invitations with deterministic ordering
			for (int i = 0; i < 3; i++) {
				string email =
					$"cursor-page-{i}-{Guid.NewGuid():N}@example.com";
				_ = await CreateTenantInvitationAsync(
					staffToken,
					tenantId,
					email
				);
				await Task.Delay(50); // Ensure distinct created_at
			}

			// Get page 1
			string url1 = GetFindUrl(
				tenantId,
				limit: 1,
				sortId: "created_at",
				sortOrder: "desc"
			);
			HttpRequestMessage request1 = new HttpRequestMessage(
				HttpMethod.Get, url1
			).WithSessionToken(staffToken);

			using HttpResponseMessage response1 =
				await _http.SendAsync(request1);
			_ = response1.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? page1 = await response1.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = page1.Should().NotBeNull();
			Assert.NotNull(page1);
			_ = page1.NextCursor.Should()
							.NotBeNullOrEmpty();

			// Get page 2
			string url2 = GetFindUrl(
				tenantId,
				cursor: page1.NextCursor,
				limit: 1,
				sortId: "created_at",
				sortOrder: "desc"
			);
			HttpRequestMessage request2 = new HttpRequestMessage(
				HttpMethod.Get, url2
			).WithSessionToken(staffToken);

			using HttpResponseMessage response2 =
				await _http.SendAsync(request2);
			_ = response2.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? page2 = await response2.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = page2.Should().NotBeNull();
			Assert.NotNull(page2);
			_ = page2.Data.Should().NotBeEmpty();

			// Page 2 should have different records than page 1
			HashSet<Guid> page1Ids = page1.Data.Select(i => i.Id).ToHashSet();
			_ = page2.Data.Should()
				.OnlyContain(i => !page1Ids.Contains(i.Id));
		}

		#endregion

		#region Validation Tests

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenTenantIdIsMalformed() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();

			string url = GetFindUrl("not-a-guid");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenCursorIsMalformed() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(
				tenantId,
				cursor: "not-a-guid"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenCursorRecordNotFound() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			Guid nonExistentCursor = Guid.NewGuid();
			string url = GetFindUrl(
				tenantId,
				cursor: nonExistentCursor.ToString()
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenSortIdIsInvalid() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(
				tenantId,
				sortId: "nonexistent"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnUnprocessableEntityWhenStatusIsInvalid() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(
				tenantId,
				status: "pending,wat"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.UnprocessableEntity);
		}

		[Fact]
		public async Task
		ItShouldReturnUnprocessableEntityWhenStatusCsvHasNoTokens() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(
				tenantId,
				status: ","
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.UnprocessableEntity);
		}

		#endregion

		#region Sort Tests

		[Fact]
		public async Task
		ItShouldSortByEmailSuccessfully() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(
				tenantId,
				sortId: "email",
				sortOrder: "asc",
				limit: 10
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().NotBeNull();
		}

		[Fact]
		public async Task
		ItShouldSortByExpiresAtSuccessfully() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(
				tenantId,
				sortId: "expires_at",
				sortOrder: "desc",
				limit: 10
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().NotBeNull();
		}

		[Fact]
		public async Task
		ItShouldSortByAcceptedAtWithNullValues() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create invitations with mixed acceptance status
			string pendingEmail =
				$"pending-sort-{Guid.NewGuid():N}@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				pendingEmail
			);

			string url = GetFindUrl(
				tenantId,
				sortId: "accepted_at",
				sortOrder: "desc",
				limit: 20
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().NotBeNull();
		}

		#endregion

		#region Account Level Filter Tests

		[Fact]
		public async Task
		ItShouldFilterByAdminAccountLevelCaseInsensitively() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string prefix = $"level-admin-{Guid.NewGuid():N}";
			string adminEmail = $"{prefix}-admin@example.com";
			string userEmail = $"{prefix}-user@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				adminEmail,
				"Admin"
			);
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				userEmail,
				"User"
			);

			string url = GetFindUrl(
				tenantId,
				level: "aDmIn",
				q: prefix,
				limit: 50
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().ContainSingle(
				invitation =>
					invitation.Email.Equals(
						adminEmail,
						StringComparison.OrdinalIgnoreCase
					)
					&& invitation.AccountLevel == "Admin"
					&& invitation.Profiles.Count == 0
			);
			_ = result.Data.Should().NotContain(
				invitation => invitation.Email.Equals(
					userEmail,
					StringComparison.OrdinalIgnoreCase
				)
			);
		}

		[Fact]
		public async Task
		ItShouldTreatLegacyNullAccountLevelAsUserWhenFiltering() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string legacyEmail =
				$"legacy-null-level-{Guid.NewGuid():N}@example.com";
			await CreateLegacyTenantInvitationWithNullLevelAsync(
				tenantId,
				legacyEmail
			);

			string url = GetFindUrl(
				tenantId,
				level: "User",
				q: legacyEmail,
				limit: 50
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().ContainSingle(
				invitation =>
					invitation.Email.Equals(
						legacyEmail,
						StringComparison.OrdinalIgnoreCase
					)
					&& invitation.AccountLevel == "User"
			);

			string adminUrl = GetFindUrl(
				tenantId,
				level: "Admin",
				q: legacyEmail,
				limit: 50
			);
			HttpRequestMessage adminRequest = new HttpRequestMessage(
				HttpMethod.Get, adminUrl
			).WithSessionToken(staffToken);

			using HttpResponseMessage adminResponse =
				await _http.SendAsync(adminRequest);

			_ = adminResponse.StatusCode.Should().Be(HttpStatusCode.OK);
			FindResponse? adminResult = await adminResponse.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = adminResult.Should().NotBeNull();
			Assert.NotNull(adminResult);
			_ = adminResult.Data.Should().BeEmpty();
		}

		[Fact]
		public async Task
		ItShouldCombineAccountLevelWithSearchStatusAndSorting() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string prefix = $"level-combined-{Guid.NewGuid():N}";
			string firstAdminEmail = $"{prefix}-a-admin@example.com";
			string excludedUserEmail = $"{prefix}-b-user@example.com";
			string secondAdminEmail = $"{prefix}-c-admin@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				firstAdminEmail,
				"Admin"
			);
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				excludedUserEmail,
				"User"
			);
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				secondAdminEmail,
				"Admin"
			);

			string url = GetFindUrl(
				tenantId,
				level: "AdMiN",
				status: "pending",
				q: prefix,
				sortId: "email",
				sortOrder: "asc",
				limit: 50
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Select(invitation => invitation.Email)
				.Should()
				.Equal(firstAdminEmail, secondAdminEmail);
		}

		[Theory]
		[InlineData("")]
		[InlineData(" ")]
		public async Task
		ItShouldTreatEmptyOrWhitespaceAccountLevelAsNoFilter(
			string level
		) {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string prefix = $"level-empty-{Guid.NewGuid():N}";
			string adminEmail = $"{prefix}-admin@example.com";
			string userEmail = $"{prefix}-user@example.com";
			string legacyEmail = $"{prefix}-legacy@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				adminEmail,
				"Admin"
			);
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				userEmail,
				"User"
			);
			await CreateLegacyTenantInvitationWithNullLevelAsync(
				tenantId,
				legacyEmail
			);

			string url = GetFindUrl(
				tenantId,
				level: level,
				q: prefix,
				sortId: "email",
				sortOrder: "asc",
				limit: 50
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Select(invitation => (
				invitation.Email,
				invitation.AccountLevel
			)).Should().Equal(
				(adminEmail, "Admin"),
				(legacyEmail, "User"),
				(userEmail, "User")
			);
		}

		[Theory]
		[InlineData(",")]
		[InlineData("User,,Admin")]
		[InlineData("Owner")]
		public async Task
		ItShouldReturnUnprocessableEntityWhenAccountLevelIsInvalid(
			string level
		) {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(tenantId, level: level);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.UnprocessableEntity);
			_ = response.Content.Headers.ContentType?.MediaType
				.Should().Be("application/problem+json");

			ValidationProblemDetails? problem = await response.Content
				.ReadFromJsonAsync<ValidationProblemDetails>();
			_ = problem.Should().NotBeNull();
			Assert.NotNull(problem);
			_ = problem.Status.Should()
				.Be((int)HttpStatusCode.UnprocessableEntity);
			_ = problem.Detail.Should()
				.Be("Query parameters validation failed");
			_ = problem.TranslationKey.Should()
				.Be(ResponseKeys.QueryParametersValidationFailed);
			_ = problem.Errors.Should().ContainKey("level");
			_ = problem.Errors["level"].Should()
				.ContainSingle()
				.Which.Should()
				.Be("level must be one of: admin, user");
		}

		[Fact]
		public async Task
		ItShouldKeepAccountLevelFilterAcrossCursorPagination() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string prefix = $"level-page-{Guid.NewGuid():N}";
			string[] adminEmails = [
				$"{prefix}-a-admin@example.com",
				$"{prefix}-c-admin@example.com",
				$"{prefix}-e-admin@example.com",
			];
			(string Email, string Level)[] invitations = [
				(adminEmails[0], "Admin"),
				($"{prefix}-b-user@example.com", "User"),
				(adminEmails[1], "Admin"),
				($"{prefix}-d-user@example.com", "User"),
				(adminEmails[2], "Admin"),
			];
			foreach (var invitation in invitations) {
				_ = await CreateTenantInvitationAsync(
					staffToken,
					tenantId,
					invitation.Email,
					invitation.Level
				);
			}

			string firstUrl = GetFindUrl(
				tenantId,
				level: "Admin",
				q: prefix,
				sortId: "email",
				sortOrder: "asc",
				limit: 1
			);
			HttpRequestMessage firstRequest = new HttpRequestMessage(
				HttpMethod.Get, firstUrl
			).WithSessionToken(staffToken);

			using HttpResponseMessage firstResponse =
				await _http.SendAsync(firstRequest);

			_ = firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
			FindResponse? firstPage = await firstResponse.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = firstPage.Should().NotBeNull();
			Assert.NotNull(firstPage);
			_ = firstPage.Data.Should().ContainSingle();
			_ = firstPage.Data.Should().OnlyContain(
				invitation => invitation.AccountLevel == "Admin"
			);
			_ = firstPage.Data[0].Email.Should().Be(adminEmails[0]);
			_ = firstPage.NextCursor.Should().NotBeNullOrEmpty();

			string secondUrl = GetFindUrl(
				tenantId,
				cursor: firstPage.NextCursor,
				level: "Admin",
				q: prefix,
				sortId: "email",
				sortOrder: "asc",
				limit: 1
			);
			HttpRequestMessage secondRequest = new HttpRequestMessage(
				HttpMethod.Get, secondUrl
			).WithSessionToken(staffToken);

			using HttpResponseMessage secondResponse =
				await _http.SendAsync(secondRequest);

			_ = secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);
			FindResponse? secondPage = await secondResponse.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = secondPage.Should().NotBeNull();
			Assert.NotNull(secondPage);
			_ = secondPage.Data.Should().ContainSingle();
			_ = secondPage.Data.Should().OnlyContain(
				invitation => invitation.AccountLevel == "Admin"
			);
			_ = secondPage.Data[0].Email.Should().Be(adminEmails[1]);
			_ = secondPage.NextCursor.Should().NotBeNullOrEmpty();

			string thirdUrl = GetFindUrl(
				tenantId,
				cursor: secondPage.NextCursor,
				level: "Admin",
				q: prefix,
				sortId: "email",
				sortOrder: "asc",
				limit: 1
			);
			HttpRequestMessage thirdRequest = new HttpRequestMessage(
				HttpMethod.Get, thirdUrl
			).WithSessionToken(staffToken);

			using HttpResponseMessage thirdResponse =
				await _http.SendAsync(thirdRequest);

			_ = thirdResponse.StatusCode.Should().Be(HttpStatusCode.OK);
			FindResponse? thirdPage = await thirdResponse.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = thirdPage.Should().NotBeNull();
			Assert.NotNull(thirdPage);
			_ = thirdPage.Data.Should().ContainSingle();
			_ = thirdPage.Data.Should().OnlyContain(
				invitation => invitation.AccountLevel == "Admin"
			);
			_ = thirdPage.Data[0].Email.Should().Be(adminEmails[2]);
			_ = thirdPage.NextCursor.Should().BeNull();
		}

		#endregion

		#region Status Filter Tests

		[Fact]
		public async Task
		ItShouldFilterByPendingStatus() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create a pending invitation
			string pendingEmail =
				$"pending-filter-{Guid.NewGuid():N}@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				pendingEmail
			);

			string url = GetFindUrl(tenantId, status: "pending");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i =>
								i.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase) &&
								i.Status == "Pending"
						);
		}

		[Fact]
		public async Task
		ItShouldFilterByAcceptedStatus() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create and accept an invitation
			string acceptedEmail =
				$"accepted-filter-{Guid.NewGuid():N}@example.com";
			Guid invitationId = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				acceptedEmail
			);

			// Accept the invitation directly via DbContext
			using (IServiceScope scope =
				_fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();
				Invitation? invitation = await dbContext.Invitation
					.FindAsync(invitationId);
				Assert.NotNull(invitation);
				invitation.Status = InvitationStatus.Accepted;
				invitation.AcceptedAt = DateTime.UtcNow;
				_ = await dbContext.SaveChangesAsync();
			}

			string url = GetFindUrl(tenantId, status: "accepted");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i =>
								i.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase) &&
								i.Status == "Accepted"
						);
		}

		[Fact]
		public async Task
		ItShouldFilterByRevokedStatus() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create and revoke an invitation
			string revokedEmail =
				$"revoked-filter-{Guid.NewGuid():N}@example.com";
			Guid invitationId = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				revokedEmail
			);

			await RevokeTenantInvitationAsync(
				staffToken,
				tenantId,
				invitationId
			);

			string url = GetFindUrl(tenantId, status: "revoked");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i =>
								i.Email.Equals(revokedEmail, StringComparison.OrdinalIgnoreCase) &&
								i.Status == "Revoked"
						);
			_ = result.Data.Should().OnlyContain(i => i.Status == "Revoked");
		}

		[Fact]
		public async Task
		ItShouldFilterByExpiredStatus() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create an expired invitation directly via DbContext
			string expiredEmail =
				$"expired-filter-{Guid.NewGuid():N}@example.com";

			using (IServiceScope scope =
				_fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();

				Profile defaultProfile =
					await GetOrCreateDefaultTenantProfileAsync(dbContext, tenantId);

				Users.Entities.User staffUser = await dbContext.User
					.FirstAsync(u =>
						u.Email == SeedConstants.Staff.AdminEmail
					);

				Invitation invitation = Invitation.CreateTenantInvitationWithProfiles(
					expiredEmail,
					tenantId,
					new List<Guid> { defaultProfile.GetRequiredId() },
					staffUser.GetRequiredId(),
					DateTime.UtcNow.AddDays(-1), // Already expired
					Guid.NewGuid().ToString("N")[..32]
				);

				_ = await dbContext.Invitation.AddAsync(invitation);
				_ = await dbContext.SaveChangesAsync();
			}

			string url = GetFindUrl(tenantId, status: "expired");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i =>
								i.Email.Equals(expiredEmail, StringComparison.OrdinalIgnoreCase) &&
								i.Status == "Expired"
						);
		}

		[Fact]
		public async Task
		ItShouldFilterByMultipleStatuses() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create pending and revoked invitations
			string pendingEmail =
				$"multi-pending-{Guid.NewGuid():N}@example.com";
			string revokedEmail =
				$"multi-revoked-{Guid.NewGuid():N}@example.com";

			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				pendingEmail
			);

			Guid revokedId = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				revokedEmail
			);

			await RevokeTenantInvitationAsync(
				staffToken,
				tenantId,
				revokedId
			);

			// Query with multiple statuses
			string url = GetFindUrl(
				tenantId,
				status: "pending,revoked"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i =>
								i.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase) &&
								i.Status == "Pending"
						);
			_ = result.Data.Should().Contain(
				i =>
					i.Email.Equals(revokedEmail, StringComparison.OrdinalIgnoreCase) &&
					i.Status == "Revoked"
			);
			_ = result.Data.Should().OnlyContain(i =>
				i.Status == "Pending" || i.Status == "Revoked"
			);
		}

		[Fact]
		public async Task
		ItShouldAcceptCommaSeparatedStatusesWithSpaces() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(
				tenantId,
				status: "accepted, expired"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);
		}

		[Fact]
		public async Task
		ItShouldTreatEmptyStatusAsNoFilter() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(tenantId, status: "");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
		}

		#endregion

		#region Search Tests

		[Fact]
		public async Task
		ItShouldFilterByEmailSearch() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create invitations with distinctive email patterns
			string targetEmail =
				$"searchable-unique-{Guid.NewGuid():N}@example.com";
			string otherEmail =
				$"other-pattern-{Guid.NewGuid():N}@example.com";

			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				targetEmail
			);
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				otherEmail
			);

			string searchTerm = targetEmail.Split('@')[0];
			string url = GetFindUrl(tenantId, q: searchTerm);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i => i.Email.Equals(targetEmail, StringComparison.OrdinalIgnoreCase)
						);
			_ = result.Data.Should().NotContain(
				i => i.Email.Equals(otherEmail, StringComparison.OrdinalIgnoreCase)
			);
		}

		[Fact]
		public async Task
		ItShouldTrimSearchTerm() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string targetEmail =
				$"trim-test-{Guid.NewGuid():N}@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				targetEmail
			);

			string searchTerm = "  " + targetEmail.Split('@')[0] + "  ";
			string url = GetFindUrl(tenantId, q: searchTerm);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i => i.Email.Equals(targetEmail, StringComparison.OrdinalIgnoreCase)
						);
		}

		[Fact]
		public async Task
		ItShouldMatchEmailSearchCaseInsensitively() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Invitation emails are always persisted lowercase.
			string targetEmail =
				$"acme-search-case-{Guid.NewGuid():N}@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				targetEmail
			);

			string uppercaseSearchTerm =
				targetEmail.Split('@')[0].ToUpperInvariant();
			string url = GetFindUrl(tenantId, q: uppercaseSearchTerm);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i => i.Email.Equals(targetEmail, StringComparison.OrdinalIgnoreCase)
						);
		}

		[Fact]
		public async Task
		ItShouldTreatPercentSearchTermAsLiteralNotWildcard() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string firstEmail =
				$"percent-escape-a-{Guid.NewGuid():N}@example.com";
			string secondEmail =
				$"percent-escape-b-{Guid.NewGuid():N}@example.com";
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				firstEmail
			);
			_ = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				secondEmail
			);

			// No seeded/created email literally contains "%". If the wildcard were
			// left unescaped, "%" would match every email in the tenant.
			string url = GetFindUrl(tenantId, q: "%", limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().NotContain(
							i => i.Email.Equals(firstEmail, StringComparison.OrdinalIgnoreCase)
						);
			_ = result.Data.Should().NotContain(
				i => i.Email.Equals(secondEmail, StringComparison.OrdinalIgnoreCase)
			);
		}

		#endregion

		#region Auth and Permission Tests

		[Fact]
		public async Task
		ItShouldReturnUnauthorizedWithoutSession() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = GetFindUrl(tenantId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.Unauthorized);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForTenantUser() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string tenantToken = await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

			string url = GetFindUrl(tenantId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(tenantToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForStaffWithoutPermission() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string staffUserToken =
				await _authClient.LoginAsync(
					TestConstants.StaffUserEmail,
					TestConstants.SeedPassword
				);

			string url = GetFindUrl(tenantId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffUserToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);
		}

		#endregion

		#region Regression Linkage Tests

		[Fact]
		public async Task
		ItShouldListInvitationCreatedViaCreateEndpoint() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create via the API endpoint
			string inviteeEmail =
				$"create-then-find-{Guid.NewGuid():N}@example.com";
			string createUrl = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.InviteFn(
					tenantId.ToString()
				)
			);
			HttpRequestMessage createRequest = new HttpRequestMessage(
				HttpMethod.Post, createUrl
			).WithSessionToken(staffToken);

			createRequest.Content = JsonContent.Create(
				new {
					email = inviteeEmail,
					accountLevel = "User"
				}
			);

			using HttpResponseMessage createResponse =
				await _http.SendAsync(createRequest);
			_ = createResponse.StatusCode.Should()
				.Be(HttpStatusCode.Created);

			// Now find it via the list endpoint
			string url = GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().Contain(
							i => i.Email.Equals(inviteeEmail, StringComparison.OrdinalIgnoreCase)
						);
		}

		#endregion

		#region Edge Case Tests

		[Fact]
		public async Task
		ItShouldReturnEmptyProfileNameWhenNoProfilesAssigned() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create invitation directly without profiles
			string noProfileEmail =
				$"no-profile-{Guid.NewGuid():N}@example.com";

			using (IServiceScope scope =
				_fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();

				Users.Entities.User staffUser = await dbContext.User
					.FirstAsync(u =>
						u.Email == SeedConstants.Staff.AdminEmail
					);

				Invitation invitation = new Invitation {
					Email = noProfileEmail.ToLowerInvariant(),
					Scope = InvitationScope.Tenant,
					TenantId = tenantId,
					Token = Guid.NewGuid().ToString("N")[..32],
					AccountLevel = AccountLevel.User,
					ExpiresAt = DateTime.UtcNow.AddDays(7),
					InvitedByUserId = staffUser.GetRequiredId()
				};

				_ = await dbContext.Invitation.AddAsync(invitation);
				_ = await dbContext.SaveChangesAsync();
			}

			string url = GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();

			Assert.NotNull(result);
			InvitationListItemDto? foundInvitation = result.Data
							.FirstOrDefault(i =>
								i.Email.Equals(noProfileEmail, StringComparison.OrdinalIgnoreCase)
							);
			_ = foundInvitation.Should().NotBeNull();
			Assert.NotNull(foundInvitation);
			_ = foundInvitation.ProfileName.Should().BeNull();
			_ = foundInvitation.Profiles.Should().BeEmpty();
			_ = foundInvitation.AccountLevel.Should().Be("User");
		}

		[Fact]
		public async Task
		ItShouldKeepProfileNameForProfileBasedInvitations() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string profileBasedEmail =
				$"profile-based-{Guid.NewGuid():N}@example.com";

			using (IServiceScope scope =
				_fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();

				Users.Entities.User staffUser = await dbContext.User
					.FirstAsync(u => u.Email == SeedConstants.Staff.AdminEmail);

				Profile defaultProfile =
					await GetOrCreateDefaultTenantProfileAsync(dbContext, tenantId);
				Invitation invitation = Invitation.CreateTenantInvitationWithProfiles(
					profileBasedEmail,
					tenantId,
					new List<Guid> { defaultProfile.GetRequiredId() },
					staffUser.GetRequiredId(),
					DateTime.UtcNow.AddDays(7),
					Guid.NewGuid().ToString("N")[..32]
				);
				invitation.AccountLevel = AccountLevel.User;

				_ = await dbContext.Invitation.AddAsync(invitation);
				_ = await dbContext.SaveChangesAsync();
			}

			string url = GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);

			InvitationListItemDto? foundInvitation = result.Data
				.FirstOrDefault(i =>
					i.Email.Equals(profileBasedEmail, StringComparison.OrdinalIgnoreCase)
				);
			_ = foundInvitation.Should().NotBeNull();
			Assert.NotNull(foundInvitation);
			_ = foundInvitation.ProfileName.Should().NotBeEmpty();
			_ = foundInvitation.Profiles.Should().NotBeEmpty();
			_ = foundInvitation.AccountLevel.Should().Be("User");
		}

		[Fact]
		public async Task
		ItShouldTreatCursorFromOtherTenantAsNotFound() {
			string staffToken =
				await _authClient.LoginAsStaffAdminAsync();
			Guid acmeTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);
			Guid techStartTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						_http,
						staffToken,
						SeedConstants.Tenants.TechStartName
					);

			// Create invitation in TechStart
			string techStartEmail =
				$"techstart-cursor-{Guid.NewGuid():N}@example.com";
			Guid techStartInvitationId;
			using (IServiceScope scope =
				_fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();

				Users.Entities.User staffUser = await dbContext.User
					.FirstAsync(u =>
						u.Email == SeedConstants.Staff.AdminEmail
					);
				Profile defaultProfile =
					await GetOrCreateDefaultTenantProfileAsync(dbContext, techStartTenantId);

				Invitation invitation = Invitation.CreateTenantInvitationWithProfiles(
					techStartEmail,
					techStartTenantId,
					new List<Guid> { defaultProfile.GetRequiredId() },
					staffUser.GetRequiredId(),
					DateTime.UtcNow.AddDays(7),
					Guid.NewGuid().ToString("N")[..32]
				);

				_ = await dbContext.Invitation.AddAsync(invitation);
				_ = await dbContext.SaveChangesAsync();
				techStartInvitationId = invitation.GetRequiredId();
			}

			// Try to use TechStart invitation ID as cursor in Acme query
			string url = GetFindUrl(
				acmeTenantId,
				cursor: techStartInvitationId.ToString()
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			// Should be treated as not found, not cross-tenant leakage
			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		}

			#endregion

			#region Multi-Page Walk

			[Fact]
			public async Task
			ItShouldWalkEveryAcceptedAtPageWithoutOverlapOrGap() {
				var staffToken =
					await _authClient.LoginAsStaffAdminAsync();
				var acmeTenantId =
					await TenantTestHelper
						.GetTenantIdByNameAsync(
							_http,
							staffToken,
							SeedConstants.Tenants.AcmeName
						);

				// 3 accepted invites with distinct AcceptedAt; the walk must
				// visit each once in ascending AcceptedAt order with no gap.
				var baseDate = new DateTime(
					2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
				);
				var seededIds = new List<Guid>();
				for (var i = 0; i < 3; i++) {
					var id = await CreateTenantInvitationAsync(
						staffToken,
						acmeTenantId,
						$"tenant-inv-walk-{i}-{Guid.NewGuid():N}@example.com"
					);
					await SetAcceptedAtAsync(
						id,
						baseDate.AddDays(i)
					);
					seededIds.Add(id);
				}

				var visitedIds = new List<Guid>();
				string? cursor = null;
				var pages = 0;
				do {
					var url = GetFindUrl(
						acmeTenantId,
						cursor: cursor,
						limit: 1,
						sortId: "accepted_at",
						sortOrder: "asc"
					);
					HttpRequestMessage request =
						new HttpRequestMessage(
							HttpMethod.Get, url
						).WithSessionToken(staffToken);

					using HttpResponseMessage response =
						await _http.SendAsync(request);
					_ = response.StatusCode.Should()
						.Be(HttpStatusCode.OK);

					var page = await response.Content
						.ReadFromJsonAsync<FindPageResponse>();
					page.Should().NotBeNull();
					Assert.NotNull(page);
					pages++;
					visitedIds.AddRange(
						page.Data.Select(i => i.Id)
					);
					cursor = page.NextCursor;

					// Guard against an infinite loop if the cursor filter regresses.
					pages.Should().BeLessOrEqualTo(100);
				} while (cursor is not null);

				// The walk covers exactly our rows, each once, in order.
				visitedIds.Should().OnlyHaveUniqueItems();
				visitedIds.Should().Contain(seededIds);

				var visitedOrder = visitedIds
					.Where(seededIds.Contains)
					.ToList();
				visitedOrder.Should().Equal(seededIds);
			}

			#endregion

			#region Helper Methods

			private async Task SetAcceptedAtAsync(
				Guid invitationId,
				DateTime acceptedAt
			) {
				using IServiceScope scope =
					_fixture.Factory.Services.CreateScope();
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();

				var invitation = await dbContext.Invitation
					.Where(i => i.Id == invitationId)
					.FirstAsync();
				invitation.AcceptedAt = acceptedAt;
				await dbContext.SaveChangesAsync();
			}

			private sealed record FindPageResponse {
				public List<InvitationItem> Data { get; init; } = [];
				public string? NextCursor { get; init; }
			}

			private sealed record InvitationItem {
				public Guid Id { get; init; }
			}

			private static string GetFindUrl(
			Guid tenantId,
			string? cursor = null,
			int? limit = null,
			string? sortId = null,
				string? sortOrder = null,
				string? status = null,
				string? q = null,
				string? level = null
			) {
			return GetFindUrl(
				tenantId.ToString(),
			cursor,
			limit,
			sortId,
				sortOrder,
				status,
				q,
				level
			);
		}

		private static string GetFindUrl(
			string tenantId,
			string? cursor = null,
			int? limit = null,
			string? sortId = null,
				string? sortOrder = null,
				string? status = null,
				string? q = null,
				string? level = null
			) {
			string basePath = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Invitations.ForTenantAsStaff.RootFn(
					tenantId
				),
				Routes.Invitations.ForTenantAsStaff.Find
			);

			List<string> queryParams = new List<string>();

			if (cursor is not null) {
				queryParams.Add($"cursor={Uri.EscapeDataString(cursor)}");
			}
			if (limit is not null) {
				queryParams.Add($"limit={limit}");
			}
			if (sortId is not null) {
				queryParams.Add($"sort_id={Uri.EscapeDataString(sortId)}");
			}
			if (sortOrder is not null) {
				queryParams.Add($"sort_order={Uri.EscapeDataString(sortOrder)}");
			}
			if (status is not null) {
				queryParams.Add($"status={Uri.EscapeDataString(status)}");
			}
			if (q is not null) {
				queryParams.Add($"q={Uri.EscapeDataString(q)}");
			}
			if (level is not null) {
				queryParams.Add($"level={Uri.EscapeDataString(level)}");
			}

			return queryParams.Count > 0 ? $"{basePath}?{string.Join("&", queryParams)}" : basePath;
		}

		private async Task<Guid> CreateTenantInvitationAsync(
		string staffToken,
		Guid tenantId,
		string email,
		string accountLevel = "User"
	) {
			return await CreateTenantInvitationWithProfilesAsync(
				staffToken,
				tenantId,
				email,
				accountLevel,
				Array.Empty<Guid>()
			);
		}

		private async Task<Guid> CreateTenantInvitationWithProfilesAsync(
			string staffToken,
			Guid tenantId,
			string email,
			string accountLevel,
			IReadOnlyCollection<Guid> profileIds
		) {
			string url = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.InviteFn(
					tenantId.ToString()
				)
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Post, url
			).WithSessionToken(staffToken);


			var body = new {
				email,
				accountLevel,
				profileIds = profileIds.Select(x => x.ToString()).ToArray()
			};

			request.Content = JsonContent.Create(body);

			using HttpResponseMessage response =
				await _http.SendAsync(request);
			_ = response.StatusCode.Should().Be(HttpStatusCode.Created);

			InvitationCreatedResponse? responseBody = await response.Content
				.ReadFromJsonAsync<InvitationCreatedResponse>();
			_ = responseBody.Should().NotBeNull();

			Assert.NotNull(responseBody);
			return responseBody.InvitationId;
		}

		private static HttpRequestMessage CreateTenantInviteRequest(
			string sessionToken,
			string tenantId,
			object body
		) {
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Post,
				PathUtils.Join(
					Routes.Staff.Root,
					Routes.Users.ForTenantAsStaff.InviteFn(tenantId)
				)
			);

			request = request.WithSessionToken(sessionToken);
			request.Content = JsonContent.Create(body);

			return request;
		}

		private async Task RevokeTenantInvitationAsync(
		string staffToken,
		Guid tenantId,
		Guid invitationId
	) {
			string revokeUrl = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Invitations.ForTenantAsStaff.RevokeByIdFn(
					tenantId.ToString(),
					invitationId.ToString()
				)
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Delete,
				revokeUrl
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		private async Task CreateLegacyTenantInvitationWithNullLevelAsync(
			Guid tenantId,
			string email
		) {
			using IServiceScope scope =
				_fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			Users.Entities.User staffUser = await dbContext.User
				.FirstAsync(user =>
					user.Email == SeedConstants.Staff.AdminEmail
				);
			Invitation invitation = new Invitation {
				Email = email.ToLowerInvariant(),
				Scope = InvitationScope.Tenant,
				TenantId = tenantId,
				Token = Guid.NewGuid().ToString("N")[..32],
				AccountLevel = null,
				ExpiresAt = DateTime.UtcNow.AddDays(7),
				InvitedByUserId = staffUser.GetRequiredId()
			};

			_ = await dbContext.Invitation.AddAsync(invitation);
			_ = await dbContext.SaveChangesAsync();
		}

		private static async Task<Profile> GetOrCreateDefaultTenantProfileAsync(
		AppDbContext dbContext,
		Guid tenantId
	) {
			Profile? defaultProfile = await dbContext.Profile
				.Where(p =>
					p.TenantId == tenantId &&
					p.Scope == ProfileScope.Tenant &&
					p.IsDefault
				)
				.FirstOrDefaultAsync();
			if (defaultProfile is not null) {
				return defaultProfile;
			}

			defaultProfile = Profile.CreateTenantProfile(
			tenantId,
			name: "Default profile",
			description: "Default profile with no permissions",
			isDefault: true
		);
			_ = await dbContext.Profile.AddAsync(defaultProfile);
			_ = await dbContext.SaveChangesAsync();

			return defaultProfile;
		}

		#endregion

		#region Response DTOs

		private record FindResponse {
			public List<InvitationListItemDto> Data { get; init; } = [];
			public string? NextCursor { get; init; }
		}

		private record InvitationListItemDto {
			public Guid Id { get; init; }
			public string Email { get; init; } = string.Empty;
			public string Scope { get; init; } = string.Empty;
			public string ProfileName { get; init; } = string.Empty;
			public List<InvitationProfileDto> Profiles { get; init; } = [];
			public string AccountLevel { get; init; } = string.Empty;
			public string Status { get; init; } = string.Empty;
			public DateTime ExpiresAt { get; init; }
			public DateTime? AcceptedAt { get; init; }
			public DateTime CreatedAt { get; init; }
			public string? InvitedByName { get; init; }
		}

		private record InvitationProfileDto {
			public Guid Id { get; init; }
			public string Name { get; init; } = string.Empty;
		}

		private record InvitationCreatedResponse {
			public Guid InvitationId { get; init; }
			public DateTime ExpiresAt { get; init; }
		}

		#endregion
	}
}
