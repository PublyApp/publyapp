
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Profiles.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff {
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
			_ = result!.Data.Should().NotBeNull();
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
			_ = result!.Data.Should().NotBeEmpty();

			InvitationListItemDto? invitation = result.Data
				.FirstOrDefault(i =>
					i.Email.Equals(inviteeEmail, StringComparison.OrdinalIgnoreCase)
				);
			_ = invitation.Should().NotBeNull();
			_ = invitation!.Id.Should().NotBeEmpty();
			_ = invitation.Email.Should().NotBeNullOrEmpty();
			_ = invitation.Scope.Should().Be("Tenant");
			_ = invitation.ProfileName.Should().NotBeNull();
			_ = invitation.ExpiresAt.Should().BeAfter(DateTime.UtcNow);
			_ = invitation.CreatedAt.Should().BeBefore(DateTime.UtcNow.AddMinutes(1));
			_ = invitation.InvitedByName.Should().NotBeNullOrEmpty();
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
			_ = result!.Data.Should().Contain(
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
			_ = result!.Data.Should().HaveCount(1);
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
			_ = page1!.NextCursor.Should()
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
			_ = page2!.Data.Should().NotBeEmpty();

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
			_ = result!.Data.Should().NotBeNull();
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
			_ = result!.Data.Should().NotBeNull();
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
			_ = result!.Data.Should().NotBeNull();
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
			_ = result!.Data.Should().Contain(
				i =>
					i.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase) &&
					!i.IsAccepted &&
					!i.IsRevoked
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
				MainApiDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<MainApiDbContext>();
				Invitation? invitation = await dbContext.Invitation
					.FindAsync(invitationId);
				invitation!.IsAccepted = true;
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
			_ = result!.Data.Should().Contain(
				i =>
					i.Email.Equals(acceptedEmail, StringComparison.OrdinalIgnoreCase) &&
					i.IsAccepted
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
			_ = result!.Data.Should().Contain(
				i =>
					i.Email.Equals(revokedEmail, StringComparison.OrdinalIgnoreCase) &&
					i.IsRevoked
			);
			_ = result.Data.Should().OnlyContain(i => i.IsRevoked);
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
				MainApiDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<MainApiDbContext>();

				// Get a default profile for the tenant
				Profile defaultProfile = await dbContext.Profile
					.Where(p =>
						p.TenantId == tenantId &&
						p.Scope == ProfileScope.Tenant &&
						p.IsDefault
					)
					.FirstAsync();

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
			_ = result!.Data.Should().Contain(
				i =>
					i.Email.Equals(expiredEmail, StringComparison.OrdinalIgnoreCase) &&
					!i.IsAccepted &&
					!i.IsRevoked
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
			_ = result!.Data.Should().Contain(
				i =>
					i.Email.Equals(pendingEmail, StringComparison.OrdinalIgnoreCase) &&
					!i.IsRevoked &&
					!i.IsAccepted
			);
			_ = result.Data.Should().Contain(
				i =>
					i.Email.Equals(revokedEmail, StringComparison.OrdinalIgnoreCase) &&
					i.IsRevoked
			);
			_ = result.Data.Should().OnlyContain(i => !i.IsAccepted);
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
			_ = result!.Data.Should().Contain(
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
			_ = result!.Data.Should().Contain(
				i => i.Email.Equals(targetEmail, StringComparison.OrdinalIgnoreCase)
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
			_ = result!.Data.Should().Contain(
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
				MainApiDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<MainApiDbContext>();

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
					InvitedByUserId = staffUser.GetRequiredId(),
					IsAccepted = false,
					IsRevoked = false
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

			InvitationListItemDto? foundInvitation = result!.Data
				.FirstOrDefault(i =>
					i.Email.Equals(noProfileEmail, StringComparison.OrdinalIgnoreCase)
				);
			_ = foundInvitation.Should().NotBeNull();
			_ = foundInvitation!.ProfileName.Should().BeEmpty();
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
				MainApiDbContext dbContext = scope.ServiceProvider
					.GetRequiredService<MainApiDbContext>();

				Users.Entities.User staffUser = await dbContext.User
					.FirstAsync(u =>
						u.Email == SeedConstants.Staff.AdminEmail
					);
				Profile defaultProfile = await dbContext.Profile
					.Where(p =>
						p.TenantId == techStartTenantId &&
						p.Scope == ProfileScope.Tenant &&
						p.IsDefault
					)
					.FirstAsync();

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

		#region Helper Methods

		private static string GetFindUrl(
			Guid tenantId,
			string? cursor = null,
			int? limit = null,
			string? sortId = null,
			string? sortOrder = null,
			string? status = null,
			string? q = null
		) {
			return GetFindUrl(
				tenantId.ToString(),
				cursor,
				limit,
				sortId,
				sortOrder,
				status,
				q
			);
		}

		private static string GetFindUrl(
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

		private async Task<Guid> CreateTenantInvitationAsync(
			string staffToken,
			Guid tenantId,
			string email
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

			request.Content = JsonContent.Create(
				new {
					email = email,
					accountLevel = "User"
				}
			);

			using HttpResponseMessage response =
				await _http.SendAsync(request);
			_ = response.StatusCode.Should().Be(HttpStatusCode.Created);

			InvitationCreatedResponse? responseBody = await response.Content
				.ReadFromJsonAsync<InvitationCreatedResponse>();
			_ = responseBody.Should().NotBeNull();

			return responseBody!.InvitationId;
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
			public DateTime ExpiresAt { get; init; }
			public DateTime? AcceptedAt { get; init; }
			public bool IsAccepted { get; init; }
			public bool IsRevoked { get; init; }
			public DateTime CreatedAt { get; init; }
			public string? InvitedByName { get; init; }
		}

		private record InvitationCreatedResponse {
			public Guid InvitationId { get; init; }
			public DateTime ExpiresAt { get; init; }
		}

		#endregion
	}
}
