
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Validation;
using PublyApp.Api.Modules.Uploads.Handlers.Staff;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

// See TenantAuthFilterSpec for why this joins the shared
// "AcmeTenantMutation" DisableParallelization collection.
[Collection("AcmeTenantMutation")]
public sealed class UpdateTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateTenantAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.UpdateFn(tenantId)
		);
	}

	[Fact]
	public async Task
	ItShouldUpdateTenantNameSuccessfully() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var originalName = SeedConstants.Tenants.AcmeName;
		var newName = "Acme Updated Corp";

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { name = newName }
			);

		try {
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<
					GetTenantAsStaffResult
				>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.TenantId.Should().Be(tenantId);
			result.Name.Should().Be(newName);
			result.Code.Should().NotBeNullOrEmpty();
			result.Status.Should().BeDefined();
		} finally {
			// Restore original name
			try {
				using var cleanup =
					await TenantTestHelper
						.UpdateTenantAsync(
							_http,
							staffToken,
							tenantId,
							new { name = originalName }
						);
			} catch {
				// Ignore — cleanup best-effort
			}
		}
	}

	[Fact]
	public async Task
	ItShouldClearLogoUrlWhenSetToNull() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// First set a logo URL
		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { logoUrl = "https://example.com/logo.png" }
			);
		setResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Now clear it by sending null
		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		// Send explicit null for logoUrl
		request.Content = new StringContent(
			"""{"logoUrl": null}""",
			System.Text.Encoding.UTF8,
			"application/json"
		);

		using var clearResponse =
			await _http.SendAsync(request);

		try {
			clearResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await clearResponse.Content
				.ReadFromJsonAsync<
					GetTenantAsStaffResult
				>();
			result.Should().NotBeNull();
			Assert.NotNull(result);
			result.LogoUrl.Should().BeNull();
		} finally {
			// No cleanup needed — null logo is fine
		}
	}

	[Fact]
	public async Task
	ItShouldClearLogoUrlWhenSetToEmptyString() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Logo Empty String Clear");

		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { logoUrl = "https://example.com/logo.png" }
			);
		setResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Empty string must clear logoUrl the same way it clears websiteUrl/
		// billingEmail/legalName — not 422, and not persisted as a literal "".
		using var clearResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { logoUrl = "" }
			);

		clearResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await clearResponse.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.LogoUrl.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldSetLogoUrlWhenStringProvided() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Logo Update");
		var logoUrl =
			"https://cdn.example.com/tenant-logo.png";

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { logoUrl }
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.TenantId.Should()
			.Be(seededTenant.TenantId);
		result.LogoUrl.Should()
			.Be(logoUrl);
	}

	[Fact]
	public async Task
	ItShouldRetainThePreviousUploadedLogoBlobWhenLogoUrlIsReplaced() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Logo Blob Replace");
		var uploaded = await UploadPngLogoAsync(staffToken);

		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { logoUrl = uploaded.Url }
			);
		setResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		File.Exists(GetStorageFilePath(uploaded.Path)).Should().BeTrue();

		using var replaceResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { logoUrl = "https://cdn.example.com/replacement-logo.png" }
			);
		replaceResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		File.Exists(GetStorageFilePath(uploaded.Path)).Should().BeTrue(
			"phase 1 must retain replaced blobs until durable asset lifecycle cleanup exists"
		);
	}

	[Fact]
	public async Task
	ItShouldRetainThePreviousUploadedLogoBlobWhenLogoUrlIsCleared() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Logo Blob Clear");
		var uploaded = await UploadPngLogoAsync(staffToken);

		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { logoUrl = uploaded.Url }
			);
		setResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		using var clearRequest = new HttpRequestMessage(
			HttpMethod.Patch, GetUrl(seededTenant.TenantId.ToString())
		).WithSessionToken(staffToken);
		clearRequest.Content = new StringContent(
			"""{"logoUrl": null}""",
			Encoding.UTF8,
			"application/json"
		);
		using var clearResponse = await _http.SendAsync(clearRequest);
		clearResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		File.Exists(GetStorageFilePath(uploaded.Path)).Should().BeTrue(
			"phase 1 must retain cleared blobs until durable asset lifecycle cleanup exists"
		);
	}

	[Fact]
	public async Task
	ItShouldNotDeleteAnythingWhenThePreviousLogoUrlIsNotAServedUpload() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Logo External No Delete");

		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { logoUrl = "https://cdn.example.com/external-logo.png" }
			);
		setResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		// No blob is server-owned here, so replacing it a second time must not
		// throw or attempt to touch the filesystem for an external URL.
		using var replaceResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { logoUrl = "https://cdn.example.com/another-external-logo.png" }
			);
		replaceResponse.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldNotDeleteTheLogoBlobWhenAnotherTenantStillReferencesIt() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantA =
			await SeedTenantAsync("Tenant Logo Shared A");
		var tenantB =
			await SeedTenantAsync("Tenant Logo Shared B");
		var uploaded = await UploadPngLogoAsync(staffToken);

		using var setAResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantA.TenantId,
				new { logoUrl = uploaded.Url }
			);
		setAResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		using var setBResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantB.TenantId,
				new { logoUrl = uploaded.Url }
			);
		setBResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		using var replaceAResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantA.TenantId,
				new { logoUrl = "https://cdn.example.com/replacement-logo.png" }
			);
		replaceAResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		File.Exists(GetStorageFilePath(uploaded.Path)).Should().BeTrue(
			"the blob must survive while tenant B's logoUrl still points at it"
		);

		using var fileResponse = await _http.GetAsync(uploaded.Url);
		fileResponse.StatusCode.Should().Be(
			HttpStatusCode.OK,
			"tenant B must still be able to serve the shared logo after tenant A's replace"
		);
	}

	[Fact]
	public async Task
	ItShouldUpdateMaxUsersSuccessfully() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync(
				"Tenant Max Users Update",
				maxUsers: 5
			);

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { maxUsers = 12 }
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.TenantId.Should()
			.Be(seededTenant.TenantId);
		result.MaxUsers.Should()
			.Be(12);
	}

	[Fact]
	public async Task
	ItShouldUpdateMultipleFieldsAndWriteAuditLog() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync(
				"Tenant Multi Update",
				maxUsers: 4
			);
		var newName =
			$"Tenant Multi Updated {Guid.NewGuid():N}";
		var newLogoUrl =
			"https://cdn.example.com/tenant-multi.png";
		var newMaxUsers = 9;

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new {
					name = newName,
					logoUrl = newLogoUrl,
					maxUsers = newMaxUsers,
				}
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.Name.Should()
			.Be(newName);
		result.LogoUrl.Should()
			.Be(newLogoUrl);
		result.MaxUsers.Should()
			.Be(newMaxUsers);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantUpdated,
			seededTenant.TenantId
		);
		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException(
				"Tenant update audit log was not written."
			);
		}

		AssertUpdateAuditDetails(
			auditLog,
			expectedName: newName,
			expectedLogoUrl: newLogoUrl,
			expectedMaxUsers: newMaxUsers
		);
	}

	[Fact]
	public async Task
	ItShouldStoreWhitespaceOnlyLegalNameAsNullNotAsAnEmptyishString() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Org Fields Whitespace");

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { legalName = "  " }
			);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		// A whitespace-only value must collapse to the SAME "cleared" representation
		// as an explicit null — never a second, undocumented "empty" representation.
		result.LegalName.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldClearWebsiteUrlAndBillingEmailWhenSetToEmptyString() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Org Fields Empty String Clear");

		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new {
					websiteUrl = "https://example.com",
					billingEmail = "billing@example.com",
				}
			);
		setResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		// Empty string must clear the same way whitespace-only/null clear
		// legalName — not 422, and not persisted as a literal empty string.
		using var clearResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new {
					websiteUrl = "",
					billingEmail = "",
				}
			);

		clearResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await clearResponse.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.WebsiteUrl.Should().BeNull();
		result.BillingEmail.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldSetOrganizationProfileFieldsWhenProvided() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Org Fields Set");

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new {
					legalName = "Acme Legal Name LLC",
					description = "A short org description",
					websiteUrl = "https://example.com",
					billingEmail = "billing@example.com",
					supportEmail = "support@example.com",
					defaultLocale = "fr",
					timezone = "Europe/Paris",
					notes = "staff-only note",
				}
			);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.LegalName.Should().Be("Acme Legal Name LLC");
		result.Description.Should().Be("A short org description");
		result.WebsiteUrl.Should().Be("https://example.com");
		result.BillingEmail.Should().Be("billing@example.com");
		result.SupportEmail.Should().Be("support@example.com");
		result.DefaultLocale.Should().Be("fr");
		result.Timezone.Should().Be("Europe/Paris");
		result.Notes.Should().Be("staff-only note");

		// The response body is built from the in-memory tracked entity, which
		// would look updated even if the service never called SaveChanges (or
		// wrote to the wrong column). Re-read from a fresh scope to prove it
		// actually persisted.
		var persisted = await GetTenantIgnoringFiltersAsync(seededTenant.TenantId);
		persisted.LegalName.Should().Be("Acme Legal Name LLC");
		persisted.Description.Should().Be("A short org description");
		persisted.WebsiteUrl.Should().Be("https://example.com");
		persisted.BillingEmail.Should().Be("billing@example.com");
		persisted.SupportEmail.Should().Be("support@example.com");
		persisted.DefaultLocale.Should().Be("fr");
		persisted.Timezone.Should().Be("Europe/Paris");
		persisted.Notes.Should().Be("staff-only note");
	}

	[Fact]
	public async Task
	ItShouldClearOrganizationProfileFieldsWhenSetToNull() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Org Fields Clear");

		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new {
					legalName = "Acme Legal Name LLC",
					description = "A short org description",
					websiteUrl = "https://example.com",
					billingEmail = "billing@example.com",
					supportEmail = "support@example.com",
					defaultLocale = "fr",
					timezone = "Europe/Paris",
					notes = "staff-only note",
				}
			);
		setResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var url = GetUrl(seededTenant.TenantId.ToString());
		var clearRequest = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);
		clearRequest.Content = new StringContent(
			"""
			{
				"legalName": null,
				"description": null,
				"websiteUrl": null,
				"billingEmail": null,
				"supportEmail": null,
				"defaultLocale": null,
				"timezone": null,
				"notes": null
			}
			""",
			Encoding.UTF8,
			"application/json"
		);

		using var clearResponse =
			await _http.SendAsync(clearRequest);

		clearResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await clearResponse.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.LegalName.Should().BeNull();
		result.Description.Should().BeNull();
		result.WebsiteUrl.Should().BeNull();
		result.BillingEmail.Should().BeNull();
		result.SupportEmail.Should().BeNull();
		result.DefaultLocale.Should().BeNull();
		result.Timezone.Should().BeNull();
		result.Notes.Should().BeNull();

		// Prove the PatchField<T> clear-to-null semantics actually persisted,
		// not just that the response echoed the in-memory tracked entity.
		var persisted = await GetTenantIgnoringFiltersAsync(seededTenant.TenantId);
		persisted.LegalName.Should().BeNull();
		persisted.Description.Should().BeNull();
		persisted.WebsiteUrl.Should().BeNull();
		persisted.BillingEmail.Should().BeNull();
		persisted.SupportEmail.Should().BeNull();
		persisted.DefaultLocale.Should().BeNull();
		persisted.Timezone.Should().BeNull();
		persisted.Notes.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldLeaveOrganizationProfileFieldsUntouchedWhenAbsent() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Org Fields Absent");

		using var setResponse =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new {
					legalName = "Acme Legal Name LLC",
					notes = "staff-only note",
				}
			);
		setResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		// Only touch Name; org fields are absent and must be left alone.
		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { name = $"Renamed {Guid.NewGuid():N}" }
			);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetTenantAsStaffResult>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"PATCH tenant response was empty."
			);
		}

		result.LegalName.Should().Be("Acme Legal Name LLC");
		result.Notes.Should().Be("staff-only note");

		// Confirm the leave-untouched fields are genuinely unchanged in the
		// database, not merely absent from a response the handler could have
		// built from stale in-memory state either way.
		var persisted = await GetTenantIgnoringFiltersAsync(seededTenant.TenantId);
		persisted.LegalName.Should().Be("Acme Legal Name LLC");
		persisted.Notes.Should().Be("staff-only note");
	}

	[Theory]
	[InlineData("billingEmail", "not-an-email")]
	[InlineData("supportEmail", "not-an-email")]
	[InlineData("websiteUrl", "not-a-url")]
	[InlineData("defaultLocale", "de")]
	[InlineData("defaultLocale", "FR")]
	[InlineData("defaultLocale", "En")]
	[InlineData("timezone", "Not/A_Real_Zone")]
	public async Task
	ItShouldReturnUnprocessableEntityForInvalidOrganizationFieldValues(
		string field,
		string invalidValue
) {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Org Fields Invalid");

		var body = $$"""{ "{{field}}": "{{invalidValue}}" }""";

		using var response = await _http.SendAsync(
			CreateRawUpdateRequest(
				staffToken,
				seededTenant.TenantId,
				body
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Theory]
	[InlineData("legalName", 257)]
	[InlineData("description", 1025)]
	[InlineData("notes", 4001)]
	[InlineData("name", 257)]
	public async Task
	ItShouldReturnUnprocessableEntityWhenOrganizationFieldExceedsMaxLength(
		string field,
		int length
	) {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Org Fields Too Long");

		var value = new string('a', length);
		var body = $$"""{ "{{field}}": "{{value}}" }""";

		using var response = await _http.SendAsync(
			CreateRawUpdateRequest(
				staffToken,
				seededTenant.TenantId,
				body
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldUpdateTenantWhenNameIsExactlyAtMaxLength() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Name Exact Length");

		// Prefixed with a unique marker (well under the limit) so the name stays
		// unique across test runs while the total length still lands exactly at
		// NameMaxLength.
		var prefix = $"Tenant Exact {Guid.NewGuid():N} ";
		var name = prefix + new string(
			'a', TenantValidationRules.NameMaxLength - prefix.Length
		);
		name.Length.Should().Be(TenantValidationRules.NameMaxLength);

		using var response = await TenantTestHelper.UpdateTenantAsync(
			_http,
			staffToken,
			seededTenant.TenantId,
			new { name }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var persisted = await dbContext.Tenant
			.Where(t => t.Id == seededTenant.TenantId)
			.SingleAsync();
		persisted.Name.Should().Be(name);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenWebsiteUrlExceedsMaxLength() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant WebsiteUrl Too Long");

		var oversizedWebsiteUrl =
			"https://example.com/" + new string('a', TenantValidationRules.WebsiteUrlMaxLength);

		using var response = await TenantTestHelper.UpdateTenantAsync(
			_http,
			staffToken,
			seededTenant.TenantId,
			new { websiteUrl = oversizedWebsiteUrl }
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenMaxUsersBelowCurrentUserCount() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantWithUsersAsync(
				"Tenant Max Below Count",
				usersCount: 2,
				maxUsers: 5
			);

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				seededTenant.TenantId,
				new { maxUsers = 1 }
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be(ResponseKeys.TenantMaxUsersBelowCount);
	}

	[Fact]
	public async Task
	ItShouldReturn400ForEmptyPatchBody() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { }
			);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl(Guid.NewGuid().ToString());

		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { name = "Updated Name" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var url = GetUrl("not-a-guid");

		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { name = "Updated Name" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be("malformed-id");
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenMaxUsersBelowCurrentCount() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Acme has seeded users, so setting maxUsers to 0
		// should fail
		using var response =
			await TenantTestHelper.UpdateTenantAsync(
				_http,
				staffToken,
				tenantId,
				new { maxUsers = 0 }
			);

		// maxUsers = 0 should fail validation (must be > 0)
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Theory]
	[MemberData(nameof(InvalidUpdateTenantBodies))]
	public async Task
	ItShouldReturnUnprocessableEntityWhenPatchBodyIsInvalid(
		string body,
		string expectedField
	) {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var seededTenant =
			await SeedTenantAsync("Tenant Invalid Patch");

		using var response =
			await _http.SendAsync(
				CreateRawUpdateRequest(
					staffToken,
					seededTenant.TenantId,
					body
				)
			);

		await AssertValidationProblemAsync(
			response,
			expectedField
		);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		);
		request.Content = JsonContent.Create(
			new { name = "Updated" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Login as tenant admin (not staff)
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = GetUrl(tenantId.ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(tenantToken);

		request.Content = JsonContent.Create(
			new { name = "Updated" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url = GetUrl(Guid.NewGuid().ToString());
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { name = "Updated" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	public static TheoryData<string, string>
	InvalidUpdateTenantBodies() {
		var oversizedLogoUrl =
			"https://cdn.example.com/" + new string('a', 2048) + ".png";

		var data = new TheoryData<string, string> {
			{
			"""
			{ "name": 123 }
			""",
			"Name"
			},
			{
			"""
			{ "name": null }
			""",
			"Name"
			},
			{
			"""
			{ "name": "Tiny" }
			""",
			"Name"
			},
			{
			"""
			{ "logoUrl": 123 }
			""",
			"LogoUrl"
			},
			{
			"""
			{ "logoUrl": "javascript:alert(document.cookie)" }
			""",
			"LogoUrl"
			},
			{
			"""
			{ "logoUrl": "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" }
			""",
			"LogoUrl"
			},
			{
			"""
			{ "logoUrl": "not-a-url-or-served-upload-path" }
			""",
			"LogoUrl"
			},
			{
			"""
			{ "maxUsers": "10" }
			""",
			"MaxUsers"
			},
			{
			"""
			{ "maxUsers": 1.5 }
			""",
			"MaxUsers"
			},
			{
			"""
			{ "maxUsers": 999999999999999999999999999999 }
			""",
			"MaxUsers"
			},
			{
			"""
			{ "maxUsers": -1 }
			""",
			"MaxUsers"
			},
		};

		data.Add(
			$$"""{ "logoUrl": "{{oversizedLogoUrl}}" }""",
			"LogoUrl"
		);

		return data;
	}

	private static HttpRequestMessage
	CreateRawUpdateRequest(
		string staffToken,
		Guid tenantId,
		string body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUrl(tenantId.ToString())
		).WithSessionToken(staffToken);

		request.Content = new StringContent(
			body,
			Encoding.UTF8,
			"application/json"
		);

		return request;
	}

	private async Task<SeededTenantSnapshot>
	SeedTenantAsync(
		string namePrefix,
		TenantStatus status = TenantStatus.Active,
		int maxUsers = 10
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = maxUsers,
		};

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return new SeededTenantSnapshot(
			TenantId: tenant.GetRequiredId(),
			Name: tenant.Name,
			Code: tenant.Code,
			MaxUsers: tenant.MaxUsers
		);
	}

	private async Task<SeededTenantSnapshot>
	SeedTenantWithUsersAsync(
		string namePrefix,
		int usersCount,
		int maxUsers
	) {
		var seededTenant = await SeedTenantAsync(
			namePrefix,
			maxUsers: maxUsers
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		for (var i = 0; i < usersCount; i++) {
			var user = new User {
				Email = $"tenant-update-user-{Guid.NewGuid():N}@example.com",
				Password = PasswordUtils.HashPassword(
					TestConstants.SeedPassword
				),
				FirstName = "Tenant",
				LastName = $"User {i}",
				Status = UserStatus.Active,
				IsVerified = true,
			};

			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			await dbContext.UserAccount.AddAsync(
				UserAccount.CreateTenantAccount(
					user.GetRequiredId(),
					seededTenant.TenantId
				)
			);
		}

		await dbContext.SaveChangesAsync();

		return seededTenant;
	}

	private static readonly byte[] PngBytes = [
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x00, 0x00
	];

	private async Task<StaffUploadCreated> UploadPngLogoAsync(string staffToken) {
		var uploadUrl = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Uploads.ForStaff.Root,
			Routes.Uploads.ForStaff.Create
		);

		using var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(PngBytes);
		fileContent.Headers.ContentType =
			new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", "logo.png");

		using var request = new HttpRequestMessage(HttpMethod.Post, uploadUrl) {
			Content = content
		}.WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var result = await response.Content.ReadFromJsonAsync<StaffUploadCreated>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException("Upload response was empty.");
		}
		return result;
	}

	private string GetStorageFilePath(string relativePath) {
		var fileStorage = _fixture.Factory.Services.GetRequiredService<IFileStorage>();
		return Path.Combine(
			fileStorage.RootPath,
			relativePath.Replace('/', Path.DirectorySeparatorChar)
		);
	}

	private async Task<AuditLog?> GetLatestAuditLogAsync(
		string action,
		Guid targetId
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var query =
			from log in dbContext.AuditLog
			where log.Action == action
				&& log.TargetId == targetId
			orderby log.CreatedAt descending
			select log;

		return await query.FirstOrDefaultAsync();
	}

	// IgnoreQueryFilters mirrors BulkRemoveTenantUsersAsStaff.Spec.cs's
	// re-read pattern: fetch from a brand-new scope/DbContext so the result
	// can only reflect what was actually persisted, never the request-scoped
	// tracked entity the handler returned in its response body.
	private async Task<Tenant> GetTenantIgnoringFiltersAsync(Guid tenantId) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = await dbContext.Tenant
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(t => t.Id == tenantId);

		if (tenant is null) {
			throw new InvalidOperationException(
				$"Tenant {tenantId} could not be re-read from a fresh scope."
			);
		}

		return tenant;
	}

	private static void AssertUpdateAuditDetails(
		AuditLog auditLog,
		string expectedName,
		string expectedLogoUrl,
		int expectedMaxUsers
	) {
		auditLog.Details.Should().NotBeNull();
		if (auditLog.Details is null) {
			throw new InvalidOperationException(
				"Tenant update audit log details were empty."
			);
		}

		using var document = JsonDocument.Parse(
			auditLog.Details
		);
		var details = document.RootElement;

		details.GetProperty("Name").GetString()
			.Should().Be(expectedName);
		details.GetProperty("LogoUrl").GetString()
			.Should().Be(expectedLogoUrl);
		details.GetProperty("MaxUsers").GetInt32()
			.Should().Be(expectedMaxUsers);
	}

	private static async Task AssertValidationProblemAsync(
		HttpResponseMessage response,
		string expectedField
	) {
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem =
			await response.Content
				.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		if (problem is null) {
			throw new InvalidOperationException(
				"Validation problem response was empty."
			);
		}

		problem.TranslationKey.Should()
			.Be(ResponseKeys.RequestBodyValidationFailed.Value);
		problem.Errors.Keys.Should()
			.Contain(expectedField);
	}

	private sealed record SeededTenantSnapshot(
		Guid TenantId,
		string Name,
		string Code,
		int MaxUsers
	);
}
