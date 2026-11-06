
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff {
	public sealed class FindInvitationsForTenantAsStaffSpec
		: IClassFixture<ApiFixture> {
		private readonly ApiFixture _Fixture;
		private readonly HttpClient _Http;
		private readonly TestAuthClient _AuthClient;

		public FindInvitationsForTenantAsStaffSpec(ApiFixture fixture) {
			this._Fixture = fixture;
			this._Http = fixture.HttpClient;
			this._AuthClient = new TestAuthClient(this._Http);
		}

		#region Happy Path Tests

		[Fact]
		public async Task
		ItShouldReturnOkWithTenantInvitationsList() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create a fresh invitation to ensure we have data
			string inviteeEmail =
				$"find-shape-{Guid.NewGuid():N}@example.com";
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				inviteeEmail
			);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
			_ = invitation.Status.Should().Be("Pending");
			_ = invitation.ExpiresAt.Should().BeAfter(DateTime.UtcNow);
			_ = invitation.CreatedAt.Should().BeBefore(DateTime.UtcNow.AddMinutes(1));
			_ = invitation.InvitedByName.Should().NotBeNullOrEmpty();
		}

		[Fact]
		public async Task
		ItShouldReturnProfilesInInvitationListRows() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string inviteeEmail =
				$"tenant-list-profiles-{Guid.NewGuid():N}@example.com";
			using (IServiceScope setupScope = this._Fixture.Factory.Services.CreateScope()) {
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

				var createRequest = FindInvitationsForTenantAsStaffSpec._CreateTenantInviteRequest(
					staffToken,
					tenantId.ToString(),
					new {
						email = inviteeEmail,
						profileIds = new[] {
							profileA.GetRequiredId().ToString(),
							profileB.GetRequiredId().ToString(),
						},
					}
				);

				using HttpResponseMessage createResponse =
					await this._Http.SendAsync(createRequest);
				createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
			}

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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

		#endregion

		#region Tenant Scoping Isolation Tests

		[Fact]
		public async Task
		ItShouldNotLeakInvitationsFromOtherTenants() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid acmeTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);
			Guid techStartTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.TechStartName
					);

			// Create invitations in both tenants
			string acmeEmail =
				$"acme-isolated-{Guid.NewGuid():N}@example.com";
			string techStartEmail =
				$"techstart-isolated-{Guid.NewGuid():N}@example.com";

			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				acmeTenantId,
				acmeEmail
			);
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				techStartTenantId,
				techStartEmail
			);

			// Query Acme invitations
			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(acmeTenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create multiple invitations
			for (int i = 0; i < 3; i++) {
				string email =
					$"cursor-pag-{i}-{Guid.NewGuid():N}@example.com";
				_ = await this._CreateTenantInvitationAsync(
					staffToken,
					tenantId,
					email
				);
			}

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, limit: 1);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create multiple invitations with deterministic ordering
			for (int i = 0; i < 3; i++) {
				string email =
					$"cursor-page-{i}-{Guid.NewGuid():N}@example.com";
				_ = await this._CreateTenantInvitationAsync(
					staffToken,
					tenantId,
					email
				);
				await Task.Delay(50); // Ensure distinct created_at
			}

			// Get page 1
			string url1 = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				limit: 1,
				sortId: "created_at",
				sortOrder: "desc"
			);
			HttpRequestMessage request1 = new HttpRequestMessage(
				HttpMethod.Get, url1
			).WithSessionToken(staffToken);

			using HttpResponseMessage response1 =
				await this._Http.SendAsync(request1);
			_ = response1.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? page1 = await response1.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = page1.Should().NotBeNull();
			Assert.NotNull(page1);
			_ = page1.NextCursor.Should()
							.NotBeNullOrEmpty();

			// Get page 2
			string url2 = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
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
				await this._Http.SendAsync(request2);
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
				await this._AuthClient.LoginAsStaffAdminAsync();

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl("not-a-guid");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenCursorIsMalformed() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				cursor: "not-a-guid"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenCursorRecordNotFound() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			Guid nonExistentCursor = Guid.NewGuid();
			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				cursor: nonExistentCursor.ToString()
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenSortIdIsInvalid() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				sortId: "nonexistent"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnUnprocessableEntityWhenStatusIsInvalid() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				status: "pending,wat"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.UnprocessableEntity);
		}

		[Fact]
		public async Task
		ItShouldReturnUnprocessableEntityWhenStatusCsvHasNoTokens() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				status: ","
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.UnprocessableEntity);
		}

		#endregion

		#region Sort Tests

		[Fact]
		public async Task
		ItShouldSortByEmailSuccessfully() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				sortId: "email",
				sortOrder: "asc",
				limit: 10
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				sortId: "expires_at",
				sortOrder: "desc",
				limit: 10
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create invitations with mixed acceptance status
			string pendingEmail =
				$"pending-sort-{Guid.NewGuid():N}@example.com";
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				pendingEmail
			);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				sortId: "accepted_at",
				sortOrder: "desc",
				limit: 20
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Should().NotBeNull();
		}

		#endregion

		[Fact]
		public async Task
		ItShouldCombineSearchStatusAndSorting() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string prefix = $"combined-filter-{Guid.NewGuid():N}";
			string firstEmail = $"{prefix}-a@example.com";
			string secondEmail = $"{prefix}-c@example.com";
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				firstEmail
			);
			Guid revokedId = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"{prefix}-b@example.com"
			);
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				secondEmail
			);
			await this._RevokeTenantInvitationAsync(
				staffToken,
				tenantId,
				revokedId
			);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
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
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
			FindResponse? result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Data.Select(invitation => invitation.Email)
				.Should()
				.Equal(firstEmail, secondEmail);
		}

		#region Status Filter Tests

		[Fact]
		public async Task
		ItShouldFilterByPendingStatus() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create a pending invitation
			string pendingEmail =
				$"pending-filter-{Guid.NewGuid():N}@example.com";
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				pendingEmail
			);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, status: "pending");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create and accept an invitation
			string acceptedEmail =
				$"accepted-filter-{Guid.NewGuid():N}@example.com";
			Guid invitationId = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				acceptedEmail
			);

			// Accept the invitation directly via DbContext
			using (IServiceScope scope =
				this._Fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();
				Invitation? invitation = await dbContext.Invitation
					.FindAsync(invitationId);
				Assert.NotNull(invitation);
				invitation.Status = InvitationStatus.Accepted;
				invitation.AcceptedAt = DateTime.UtcNow;
				_ = await dbContext.SaveChangesAsync();
			}

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, status: "accepted");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create and revoke an invitation
			string revokedEmail =
				$"revoked-filter-{Guid.NewGuid():N}@example.com";
			Guid invitationId = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				revokedEmail
			);

			await this._RevokeTenantInvitationAsync(
				staffToken,
				tenantId,
				invitationId
			);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, status: "revoked");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create an expired invitation directly via DbContext
			string expiredEmail =
				$"expired-filter-{Guid.NewGuid():N}@example.com";

			using (IServiceScope scope =
				this._Fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();

				Profile defaultProfile =
					await FindInvitationsForTenantAsStaffSpec._GetOrCreateDefaultTenantProfileAsync(dbContext, tenantId);

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

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, status: "expired");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create pending and revoked invitations
			string pendingEmail =
				$"multi-pending-{Guid.NewGuid():N}@example.com";
			string revokedEmail =
				$"multi-revoked-{Guid.NewGuid():N}@example.com";

			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				pendingEmail
			);

			Guid revokedId = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				revokedEmail
			);

			await this._RevokeTenantInvitationAsync(
				staffToken,
				tenantId,
				revokedId
			);

			// Query with multiple statuses
			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				status: "pending,revoked"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId,
				status: "accepted, expired"
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);
		}

		[Fact]
		public async Task
		ItShouldTreatEmptyStatusAsNoFilter() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, status: "");
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create invitations with distinctive email patterns
			string targetEmail =
				$"searchable-unique-{Guid.NewGuid():N}@example.com";
			string otherEmail =
				$"other-pattern-{Guid.NewGuid():N}@example.com";

			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				targetEmail
			);
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				otherEmail
			);

			string searchTerm = targetEmail.Split('@')[0];
			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, q: searchTerm);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string targetEmail =
				$"trim-test-{Guid.NewGuid():N}@example.com";
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				targetEmail
			);

			string searchTerm = "  " + targetEmail.Split('@')[0] + "  ";
			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, q: searchTerm);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Invitation emails are always persisted lowercase.
			string targetEmail =
				$"acme-search-case-{Guid.NewGuid():N}@example.com";
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				targetEmail
			);

			string uppercaseSearchTerm =
				targetEmail.Split('@')[0].ToUpperInvariant();
			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, q: uppercaseSearchTerm);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string firstEmail =
				$"percent-escape-a-{Guid.NewGuid():N}@example.com";
			string secondEmail =
				$"percent-escape-b-{Guid.NewGuid():N}@example.com";
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				firstEmail
			);
			_ = await this._CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				secondEmail
			);

			// No seeded/created email literally contains "%". If the wildcard were
			// left unescaped, "%" would match every email in the tenant.
			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, q: "%", limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.Unauthorized);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForTenantUser() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string tenantToken = await this._AuthClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(tenantToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForStaffWithoutPermission() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string staffUserToken =
				await this._AuthClient.LoginAsync(
					TestConstants.StaffUserEmail,
					TestConstants.SeedPassword
				);

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffUserToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);
		}

		#endregion

		#region Regression Linkage Tests

		[Fact]
		public async Task
		ItShouldListInvitationCreatedViaCreateEndpoint() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
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
					email = inviteeEmail
				}
			);

			using HttpResponseMessage createResponse =
				await this._Http.SendAsync(createRequest);
			_ = createResponse.StatusCode.Should()
				.Be(HttpStatusCode.Created);

			// Now find it via the list endpoint
			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// Create invitation directly without profiles
			string noProfileEmail =
				$"no-profile-{Guid.NewGuid():N}@example.com";

			using (IServiceScope scope =
				this._Fixture.Factory.Services.CreateScope()) {
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
					ExpiresAt = DateTime.UtcNow.AddDays(7),
					InvitedByUserId = staffUser.GetRequiredId()
				};

				_ = await dbContext.Invitation.AddAsync(invitation);
				_ = await dbContext.SaveChangesAsync();
			}

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
		}

		[Fact]
		public async Task
		ItShouldKeepProfileNameForProfileBasedInvitations() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			string profileBasedEmail =
				$"profile-based-{Guid.NewGuid():N}@example.com";

			using (IServiceScope scope =
				this._Fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();

				Users.Entities.User staffUser = await dbContext.User
					.FirstAsync(u => u.Email == SeedConstants.Staff.AdminEmail);

				Profile defaultProfile =
					await FindInvitationsForTenantAsStaffSpec._GetOrCreateDefaultTenantProfileAsync(dbContext, tenantId);
				Invitation invitation = Invitation.CreateTenantInvitationWithProfiles(
					profileBasedEmail,
					tenantId,
					new List<Guid> { defaultProfile.GetRequiredId() },
					staffUser.GetRequiredId(),
					DateTime.UtcNow.AddDays(7),
					Guid.NewGuid().ToString("N")[..32]
				);

				_ = await dbContext.Invitation.AddAsync(invitation);
				_ = await dbContext.SaveChangesAsync();
			}

			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(tenantId, limit: 50);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
		}

		[Fact]
		public async Task
		ItShouldTreatCursorFromOtherTenantAsNotFound() {
			string staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			Guid acmeTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);
			Guid techStartTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.TechStartName
					);

			// Create invitation in TechStart
			string techStartEmail =
				$"techstart-cursor-{Guid.NewGuid():N}@example.com";
			Guid techStartInvitationId;
			using (IServiceScope scope =
				this._Fixture.Factory.Services.CreateScope()) {
				AppDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<AppDbContext>();

				Users.Entities.User staffUser = await dbContext.User
					.FirstAsync(u =>
						u.Email == SeedConstants.Staff.AdminEmail
					);
				Profile defaultProfile =
					await FindInvitationsForTenantAsStaffSpec._GetOrCreateDefaultTenantProfileAsync(dbContext, techStartTenantId);

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
			string url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				acmeTenantId,
				cursor: techStartInvitationId.ToString()
			);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);

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
				await this._AuthClient.LoginAsStaffAdminAsync();
			var acmeTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// 3 accepted invites with distinct AcceptedAt; the walk must
			// visit each once in ascending AcceptedAt order with no gap.
			var baseDate = new DateTime(
				2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
			);
			var seededIds = new List<Guid>();
			// Two rows share the same AcceptedAt (i=0 and i=2), one has a
			// different value (i=1). The tiebreaker (Id ascending) must
			// determine the order of the two equal-key rows.
			var seededAcceptedAt = new List<DateTime>();
			for (var i = 0; i < 3; i++) {
				var acceptedAt = i == 1 ? baseDate.AddDays(1) : baseDate;
				var id = await this._CreateTenantInvitationAsync(
					staffToken,
					acmeTenantId,
					$"tenant-inv-walk-{i}-{Guid.NewGuid():N}@example.com"
				);
				await this._SetAcceptedAtAsync(id, acceptedAt);
				seededIds.Add(id);
				seededAcceptedAt.Add(acceptedAt);
			}

			// Swap the IDs of the two equal-key rows (i=0 and i=2) so the row
			// inserted at i=2 has the smaller Id. Without this, UUID v7 IDs are
			// insertion-ordered, so stable OrderBy(AcceptedAt) already matches
			// ThenBy(Id) and removing the production tiebreaker leaves the test
			// green. After the swap, the tiebreaker is actually exercised.
			await this._SwapInvitationIdsAsync(seededIds[0], seededIds[2]);
			(seededIds[0], seededIds[2]) = (seededIds[2], seededIds[0]);

			var visitedIds = new List<Guid>();
			string? cursor = null;
			var pages = 0;
			do {
				var url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
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
					await this._Http.SendAsync(request);
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
			var acceptedAtById = seededIds
				.Zip(seededAcceptedAt, (id, c) => (id, c))
				.ToDictionary(x => x.id, x => x.c);
			visitedOrder.Should().Equal(
				seededIds.OrderBy(id => acceptedAtById[id]).ThenBy(id => id).ToList()
			);
		}

		[Fact]
		public async Task
		ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
			var staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			var acmeTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// 3 invites with distinct CreatedAt; the walk must visit each once
			// in ascending CreatedAt order with no gap.
			var baseDate = new DateTime(
				2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
			);
			var seededIds = new List<Guid>();
			// Two rows share the same CreatedAt (i=0 and i=2), one has a
			// different value (i=1). The tiebreaker (Id ascending) must
			// determine the order of the two equal-key rows.
			var seededCreatedAt = new List<DateTime>();
			for (var i = 0; i < 3; i++) {
				var createdAt = i == 1 ? baseDate.AddDays(1) : baseDate;
				var id = await this._CreateTenantInvitationAsync(
					staffToken,
					acmeTenantId,
					$"tenant-inv-created-{i}-{Guid.NewGuid():N}@example.com"
				);
				await this._SetCreatedAtAsync(id, createdAt);
				seededIds.Add(id);
				seededCreatedAt.Add(createdAt);
			}


			// Swap the IDs of the two equal-key rows (i=0 and i=2) so the row
			// inserted at i=2 has the smaller Id. Without this, UUID v7 IDs are
			// insertion-ordered, so stable OrderBy(CreatedAt) already matches
			// ThenBy(Id) and removing the production tiebreaker leaves the test
			// green. After the swap, the tiebreaker is actually exercised.
			await this._SwapInvitationIdsAsync(seededIds[0], seededIds[2]);
			(seededIds[0], seededIds[2]) = (seededIds[2], seededIds[0]);
			var visitedIds = new List<Guid>();
			string? cursor = null;
			var pages = 0;
			do {
				var url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
					acmeTenantId,
					cursor: cursor,
					limit: 1,
					sortId: "created_at",
					sortOrder: "asc"
				);
				HttpRequestMessage request =
					new HttpRequestMessage(
						HttpMethod.Get, url
					).WithSessionToken(staffToken);

				using HttpResponseMessage response =
					await this._Http.SendAsync(request);
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

				pages.Should().BeLessOrEqualTo(100);
			} while (cursor is not null);

			visitedIds.Should().OnlyHaveUniqueItems();
			visitedIds.Should().Contain(seededIds);

			var visitedOrder = visitedIds
				.Where(seededIds.Contains)
				.ToList();
			var createdAtById = seededIds
				.Zip(seededCreatedAt, (id, c) => (id, c))
				.ToDictionary(x => x.id, x => x.c);
			visitedOrder.Should().Equal(
				seededIds.OrderBy(id => createdAtById[id]).ThenBy(id => id).ToList()
			);
		}

		[Fact]
		public async Task
		ItShouldWalkEveryExpiresAtPageWithoutOverlapOrGap() {
			var staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			var acmeTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// 3 invites with distinct ExpiresAt; the walk must visit each once
			// in ascending ExpiresAt order with no gap.
			var baseDate = new DateTime(
				2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
			);
			var seededIds = new List<Guid>();
			// Two rows share the same ExpiresAt (i=0 and i=2), one has a
			// different value (i=1). The tiebreaker (Id ascending) must
			// determine the order of the two equal-key rows.
			var seededExpiresAt = new List<DateTime>();
			for (var i = 0; i < 3; i++) {
				var expiresAt = i == 1 ? baseDate.AddDays(1) : baseDate;
				var id = await this._CreateTenantInvitationAsync(
					staffToken,
					acmeTenantId,
					$"tenant-inv-expires-{i}-{Guid.NewGuid():N}@example.com"
				);
				await this._SetExpiresAtAsync(id, expiresAt);
				seededIds.Add(id);
				seededExpiresAt.Add(expiresAt);
			}

			var visitedIds = new List<Guid>();

			// Swap the IDs of the two equal-key rows (i=0 and i=2) so the row
			// inserted at i=2 has the smaller Id. Without this, UUID v7 IDs are
			// insertion-ordered, so stable OrderBy(ExpiresAt) already matches
			// ThenBy(Id) and removing the production tiebreaker leaves the test
			// green. After the swap, the tiebreaker is actually exercised.
			await this._SwapInvitationIdsAsync(seededIds[0], seededIds[2]);
			(seededIds[0], seededIds[2]) = (seededIds[2], seededIds[0]);
			string? cursor = null;
			var pages = 0;
			do {
				var url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
					acmeTenantId,
					cursor: cursor,
					limit: 1,
					sortId: "expires_at",
					sortOrder: "asc"
				);
				HttpRequestMessage request =
					new HttpRequestMessage(
						HttpMethod.Get, url
					).WithSessionToken(staffToken);

				using HttpResponseMessage response =
					await this._Http.SendAsync(request);
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

				pages.Should().BeLessOrEqualTo(100);
			} while (cursor is not null);

			visitedIds.Should().OnlyHaveUniqueItems();
			visitedIds.Should().Contain(seededIds);

			var visitedOrder = visitedIds
				.Where(seededIds.Contains)
				.ToList();
			var expiresAtById = seededIds
				.Zip(seededExpiresAt, (id, e) => (id, e))
				.ToDictionary(x => x.id, x => x.e);
			visitedOrder.Should().Equal(
				seededIds.OrderBy(id => expiresAtById[id]).ThenBy(id => id).ToList()
			);
		}

		[Fact]
		public async Task
		ItShouldWalkEveryEmailPageWithoutOverlapOrGap() {
			var staffToken =
				await this._AuthClient.LoginAsStaffAdminAsync();
			var acmeTenantId =
				await TenantTestHelper
					.GetTenantIdByNameAsync(
						this._Http,
						staffToken,
						SeedConstants.Tenants.AcmeName
					);

			// 3 invites with distinct Email values, deliberately NOT in
			// insertion order (anti-correlated). The walk must visit each once
			// in ascending email order, so a keySelector swap to another
			// same-type field (e.g. CreatedAt) turns this assertion RED.
			var seededIds = new List<Guid>();
			var seededEmails = new List<string>();
			var emails = new[] {
					$"tenant-inv-email-c-{Guid.NewGuid():N}@example.com",
					$"tenant-inv-email-a-{Guid.NewGuid():N}@example.com",
					$"tenant-inv-email-b-{Guid.NewGuid():N}@example.com",
				};
			foreach (var email in emails) {
				var id = await this._CreateTenantInvitationAsync(
					staffToken,
					acmeTenantId,
					email
				);
				seededIds.Add(id);
				seededEmails.Add(email);
			}

			var visitedIds = new List<Guid>();
			var visitedEmails = new List<string>();
			string? cursor = null;
			var pages = 0;
			do {
				var url = FindInvitationsForTenantAsStaffSpec._GetFindUrl(
					acmeTenantId,
					cursor: cursor,
					limit: 1,
					sortId: "email",
					sortOrder: "asc"
				);
				HttpRequestMessage request =
					new HttpRequestMessage(
						HttpMethod.Get, url
					).WithSessionToken(staffToken);

				using HttpResponseMessage response =
					await this._Http.SendAsync(request);
				_ = response.StatusCode.Should()
					.Be(HttpStatusCode.OK);

				var page = await response.Content
					.ReadFromJsonAsync<FindResponse>();
				page.Should().NotBeNull();
				Assert.NotNull(page);
				pages++;
				visitedIds.AddRange(
					page.Data.Select(i => i.Id)
				);
				visitedEmails.AddRange(
					page.Data.Select(i => i.Email)
				);
				cursor = page.NextCursor;

				pages.Should().BeLessOrEqualTo(100);
			} while (cursor is not null);

			visitedIds.Should().OnlyHaveUniqueItems();
			visitedIds.Should().Contain(seededIds);

			var visitedOrder = visitedEmails
				.Where(e => seededEmails.Contains(e, StringComparer.OrdinalIgnoreCase))
				.ToList();
			var expectedOrder = seededEmails
				.OrderBy(e => e, StringComparer.OrdinalIgnoreCase)
				.ToList();
			visitedOrder.Should().Equal(expectedOrder);
		}

		private async Task _SetCreatedAtAsync(
			Guid invitationId,
			DateTime createdAt
		) {
			using IServiceScope scope =
				this._Fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var invitation = await dbContext.Invitation
				.Where(i => i.Id == invitationId)
				.FirstAsync();
			invitation.CreatedAt = createdAt;
			await dbContext.SaveChangesAsync();
		}

		private async Task _SetExpiresAtAsync(
			Guid invitationId,
			DateTime expiresAt
		) {
			using IServiceScope scope =
				this._Fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var invitation = await dbContext.Invitation
				.Where(i => i.Id == invitationId)
				.FirstAsync();
			invitation.ExpiresAt = expiresAt;
			await dbContext.SaveChangesAsync();
		}

		#endregion

		#region Helper Methods

		private async Task _SetAcceptedAtAsync(
			Guid invitationId,
			DateTime acceptedAt
		) {
			using IServiceScope scope =
				this._Fixture.Factory.Services.CreateScope();
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

		private static string _GetFindUrl(
		Guid tenantId,
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
			string? sortOrder = null,
			string? status = null,
			string? q = null
		) {
			return FindInvitationsForTenantAsStaffSpec._GetFindUrl(
				tenantId.ToString(),
			cursor,
			limit,
			sortId,
				sortOrder,
				status,
				q
			);
		}

		private static string _GetFindUrl(
			string tenantId,
			string? cursor = null,
			int? limit = null,
			string? sortId = null,
				string? sortOrder = null,
				string? status = null,
				string? q = null
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

			return queryParams.Count > 0 ? $"{basePath}?{string.Join("&", queryParams)}" : basePath;
		}

		private async Task<Guid> _CreateTenantInvitationAsync(
		string staffToken,
		Guid tenantId,
		string email
	) {
			return await this._CreateTenantInvitationWithProfilesAsync(
				staffToken,
				tenantId,
				email,
				Array.Empty<Guid>()
			);
		}

		private async Task<Guid> _CreateTenantInvitationWithProfilesAsync(
			string staffToken,
			Guid tenantId,
			string email,
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
				profileIds = profileIds.Select(x => x.ToString()).ToArray()
			};

			request.Content = JsonContent.Create(body);

			using HttpResponseMessage response =
				await this._Http.SendAsync(request);
			_ = response.StatusCode.Should().Be(HttpStatusCode.Created);

			InvitationCreatedResponse? responseBody = await response.Content
				.ReadFromJsonAsync<InvitationCreatedResponse>();
			_ = responseBody.Should().NotBeNull();

			Assert.NotNull(responseBody);
			return responseBody.InvitationId;
		}

		private static HttpRequestMessage _CreateTenantInviteRequest(
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

		private async Task _RevokeTenantInvitationAsync(
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
				await this._Http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		private static async Task<Profile> _GetOrCreateDefaultTenantProfileAsync(
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

		private async Task _SwapInvitationIdsAsync(Guid idA, Guid idB) {
			using IServiceScope scope = this._Fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			var temp = Guid.NewGuid();
			await dbContext.Database.ExecuteSqlRawAsync(
				"UPDATE invitations SET id = {0} WHERE id = {1}",
				temp, idA);
			await dbContext.Database.ExecuteSqlRawAsync(
				"UPDATE invitations SET id = {0} WHERE id = {1}",
				idA, idB);
			await dbContext.Database.ExecuteSqlRawAsync(
				"UPDATE invitations SET id = {0} WHERE id = {1}",
				idB, temp);
		}
	}
}
