
using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Tenants.Validation;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public sealed class CreateTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateTenantAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldCreatePendingTenantDefaultProfileInvitationsAndEmails() {
		var fakeEmailSender = _fixture.GetFakeEmailSender();
		fakeEmailSender.Clear();

		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Create Contract {Guid.NewGuid():N}";
		var adminEmail =
			$"tenant-create-admin-{Guid.NewGuid():N}@example.com";
		var userEmail =
			$"tenant-create-user-{Guid.NewGuid():N}@example.com";

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				token,
				new {
					name = tenantName,
					maxUsers = 3,
					initialUsers = new[] {
						new {
							email = adminEmail,
							accountLevel = "admin",
						},
						new {
							email = userEmail,
							accountLevel = "user",
						},
					},
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var created = await response.Content
			.ReadFromJsonAsync<CreateTenantAsStaffResult>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		created.Id.Should().NotBeEmpty();
		created.Name.Should().Be(tenantName);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = await dbContext.Tenant
			.Where(t => t.Id == created.Id)
			.SingleAsync();
		tenant.Name.Should().Be(tenantName);
		tenant.MaxUsers.Should().Be(3);
		tenant.Status.Should().Be(TenantStatus.Pending);

		var defaultProfile = await dbContext.Profile
			.Where(profile =>
				profile.TenantId == created.Id
				&& profile.Scope == ProfileScope.Tenant
				&& profile.IsDefault
			)
			.SingleAsync();
		defaultProfile.Name.Should().Be("Default profile");

		var invitations = await dbContext.Invitation
			.Where(invitation =>
				invitation.TenantId == created.Id
				&& invitation.Scope == InvitationScope.Tenant
			)
			.Include(invitation => invitation.InvitationProfiles)
			.ToListAsync();

		invitations.Should().HaveCount(2);

		var adminInvitation = invitations.Single(inv => inv.Email == adminEmail);
		adminInvitation.Status.Should().Be(InvitationStatus.Pending);
		adminInvitation.AccountLevel.Should().Be(AccountLevel.Admin);
		adminInvitation.InvitationProfiles.Should().BeEmpty();

		var userInvitation = invitations.Single(inv => inv.Email == userEmail);
		userInvitation.Status.Should().Be(InvitationStatus.Pending);
		userInvitation.AccountLevel.Should().Be(AccountLevel.User);
		userInvitation.InvitationProfiles.Should().ContainSingle(link =>
			link.ProfileId == defaultProfile.GetRequiredId()
		);

		var sentEmails = await WaitForEmailsAsync(fakeEmailSender, 2);
		// Filter to this test's own recipients rather than asserting on the
		// whole fixture-scoped buffer: a straggling fire-and-forget email from
		// a prior test in this class can still land here after Clear().
		var relevantEmails = sentEmails
			.Where(email => email.To == adminEmail || email.To == userEmail)
			.ToList();

		relevantEmails.Select(email => email.To)
			.Should().BeEquivalentTo([adminEmail, userEmail]);
		relevantEmails.Should().OnlyContain(email =>
			email.Subject.Contains(tenantName, StringComparison.Ordinal)
			&& email.HtmlBody.Contains("Accept the invitation", StringComparison.Ordinal)
		);
	}

	[Fact]
	public async Task
	ItShouldAcceptCustomCodeAndPersistItLowercase() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Custom Code {Guid.NewGuid():N}";
		var customCode = $"custom-code-{Guid.NewGuid():N}"[..30];

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = tenantName,
				maxUsers = 3,
				code = customCode,
				initialUsers = new[] {
					new {
						email = $"tenant-custom-code-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin",
					},
				},
			}
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = await dbContext.Tenant
			.Where(t => t.Id == created.Id)
			.SingleAsync();
		tenant.Code.Should().Be(customCode.ToLowerInvariant());
	}

	[Theory]
	[InlineData("AB")]
	[InlineData("Has-Upper-Case")]
	[InlineData("has spaces")]
	[InlineData("-leading-hyphen")]
	[InlineData("trailing-hyphen-")]
	[InlineData("has_underscore")]
	public async Task
	ItShouldReturnUnprocessableEntityForInvalidCodeShapes(
		string invalidCode
	) {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				token,
				new {
					name = $"Tenant Invalid Code {Guid.NewGuid():N}",
					maxUsers = 3,
					code = invalidCode,
					initialUsers = new[] {
						new {
							email = $"tenant-invalid-code-{Guid.NewGuid():N}@example.com",
							accountLevel = "Admin",
						},
					},
				}
			)
		);

		await AssertValidationProblemAsync(response, "Code");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenCodeIsDuplicate() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var duplicateCode = $"dup-code-{Guid.NewGuid():N}"[..25];

		await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = $"Tenant Duplicate Code First {Guid.NewGuid():N}",
				maxUsers = 3,
				code = duplicateCode,
				initialUsers = new[] {
					new {
						email = $"tenant-dup-code-first-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin",
					},
				},
			}
		);

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				token,
				new {
					name = $"Tenant Duplicate Code Second {Guid.NewGuid():N}",
					maxUsers = 3,
					code = duplicateCode,
					initialUsers = new[] {
						new {
							email = $"tenant-dup-code-second-{Guid.NewGuid():N}@example.com",
							accountLevel = "Admin",
						},
					},
				}
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
			.Be(ResponseKeys.CodeAlreadyTaken.Value);
		problem.Errors.Keys.Should().Contain("code");
	}

	[Fact]
	public async Task
	ItShouldSkipDefaultProfileWhenSeedDefaultProfileIsFalse() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant No Default Profile {Guid.NewGuid():N}";
		var userEmail =
			$"tenant-no-profile-user-{Guid.NewGuid():N}@example.com";

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = tenantName,
				maxUsers = 3,
				seedDefaultProfile = false,
				initialUsers = new[] {
					new {
						email = $"tenant-no-profile-admin-{Guid.NewGuid():N}@example.com",
						accountLevel = "admin",
					},
					new {
						email = userEmail,
						accountLevel = "user",
					},
				},
			}
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var profileCount = await dbContext.Profile
			.Where(p =>
				p.TenantId == created.Id
				&& p.Scope == ProfileScope.Tenant
			)
			.CountAsync();
		profileCount.Should().Be(0);

		var userInvitation = await dbContext.Invitation
			.Where(invitation =>
				invitation.TenantId == created.Id
				&& invitation.Email == userEmail
			)
			.Include(invitation => invitation.InvitationProfiles)
			.SingleAsync();
		userInvitation.InvitationProfiles.Should().BeEmpty();
	}

	[Fact]
	public async Task
	ItShouldPersistOrganizationProfileFieldsWhenProvided() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Create Org Fields {Guid.NewGuid():N}";

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = tenantName,
				maxUsers = 3,
				logoUrl = "https://cdn.example.com/logo.png",
				legalName = "Acme Legal Name LLC",
				description = "A short org description",
				websiteUrl = "https://example.com",
				billingEmail = "billing@example.com",
				supportEmail = "support@example.com",
				defaultLocale = "fr",
				timezone = "Europe/Paris",
				notes = "staff-only note",
				initialUsers = new[] {
					new {
						email = $"tenant-create-org-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin",
					},
				},
			}
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = await dbContext.Tenant
			.Where(t => t.Id == created.Id)
			.SingleAsync();

		tenant.LogoUrl.Should().Be("https://cdn.example.com/logo.png");
		tenant.LegalName.Should().Be("Acme Legal Name LLC");
		tenant.Description.Should().Be("A short org description");
		tenant.WebsiteUrl.Should().Be("https://example.com");
		tenant.BillingEmail.Should().Be("billing@example.com");
		tenant.SupportEmail.Should().Be("support@example.com");
		tenant.DefaultLocale.Should().Be("fr");
		tenant.Timezone.Should().Be("Europe/Paris");
		tenant.Notes.Should().Be("staff-only note");
	}

	[Fact]
	public async Task
	ItShouldPersistNullOrganizationProfileFieldsWhenAbsent() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Create Org Fields Absent {Guid.NewGuid():N}";

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = tenantName,
				maxUsers = 3,
				initialUsers = new[] {
					new {
						email = $"tenant-create-org-absent-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin",
					},
				},
			}
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = await dbContext.Tenant
			.Where(t => t.Id == created.Id)
			.SingleAsync();

		tenant.LogoUrl.Should().BeNull();
		tenant.LegalName.Should().BeNull();
		tenant.Description.Should().BeNull();
		tenant.WebsiteUrl.Should().BeNull();
		tenant.BillingEmail.Should().BeNull();
		tenant.SupportEmail.Should().BeNull();
		tenant.DefaultLocale.Should().BeNull();
		tenant.Timezone.Should().BeNull();
		tenant.Notes.Should().BeNull();
		tenant.LastActivityAt.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldStoreWhitespaceOnlyLegalNameAsNullNotAsAnEmptyishString() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Create Org Fields Whitespace {Guid.NewGuid():N}";

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = tenantName,
				maxUsers = 3,
				legalName = "  ",
				initialUsers = new[] {
					new {
						email = $"tenant-create-org-whitespace-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin",
					},
				},
			}
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = await dbContext.Tenant
			.Where(t => t.Id == created.Id)
			.SingleAsync();

		// A whitespace-only value must collapse to the SAME "cleared" representation
		// as an omitted field — never a second, undocumented "empty" representation.
		tenant.LegalName.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenLogoUrlIsWrongType() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var body = $$"""
			{
				"name": "Tenant Create Logo Url Invalid {{Guid.NewGuid():N}}",
				"maxUsers": 3,
				"logoUrl": 123,
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""";

		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		await AssertValidationProblemAsync(response, "LogoUrl");
	}

	[Theory]
	[InlineData("javascript:alert(document.cookie)")]
	[InlineData("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")]
	[InlineData("not-a-url-or-served-upload-path")]
	public async Task
	ItShouldReturnUnprocessableEntityWhenLogoUrlIsNotAServedUploadPathOrHttpUrl(
		string logoUrl
	) {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var body = new {
			name = $"Tenant Create Logo Url Unsafe {Guid.NewGuid():N}",
			maxUsers = 3,
			logoUrl,
			initialUsers = new[] {
				new { email = "admin@example.com", accountLevel = "Admin" }
			}
		};

		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		await AssertValidationProblemAsync(response, "LogoUrl");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenLogoUrlExceedsMaxLength() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var oversizedLogoUrl =
			"https://cdn.example.com/" + new string('a', 2048) + ".png";

		var body = new {
			name = $"Tenant Create Logo Url Too Long {Guid.NewGuid():N}",
			maxUsers = 3,
			logoUrl = oversizedLogoUrl,
			initialUsers = new[] {
				new { email = "admin@example.com", accountLevel = "Admin" }
			}
		};

		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		await AssertValidationProblemAsync(response, "LogoUrl");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenNameExceedsMaxLength() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var body = new {
			name = new string('a', TenantValidationRules.NameMaxLength + 1),
			maxUsers = 3,
			initialUsers = new[] {
				new { email = "admin@example.com", accountLevel = "Admin" }
			}
		};

		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		await AssertValidationProblemAsync(response, "Name");
	}

	[Fact]
	public async Task
	ItShouldCreateTenantWhenNameIsExactlyAtMaxLength() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		// Prefixed with a unique marker (well under the limit) so the name stays
		// unique across test runs while the total length still lands exactly at
		// NameMaxLength.
		var prefix = $"Tenant Exact {Guid.NewGuid():N} ";
		var name = prefix + new string(
			'a', TenantValidationRules.NameMaxLength - prefix.Length
		);
		name.Length.Should().Be(TenantValidationRules.NameMaxLength);

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name,
				maxUsers = 3,
				initialUsers = new[] {
					new {
						email = $"tenant-name-exact-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin"
					}
				}
			}
		);

		created.Name.Should().Be(name);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenWebsiteUrlExceedsMaxLength() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var oversizedWebsiteUrl =
			"https://example.com/" + new string('a', TenantValidationRules.WebsiteUrlMaxLength);

		var body = new {
			name = $"Tenant Create WebsiteUrl Too Long {Guid.NewGuid():N}",
			maxUsers = 3,
			websiteUrl = oversizedWebsiteUrl,
			initialUsers = new[] {
				new { email = "admin@example.com", accountLevel = "Admin" }
			}
		};

		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		await AssertValidationProblemAsync(response, "WebsiteUrl");
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
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var body = $$"""
			{
				"name": "Tenant Create Org Invalid {{Guid.NewGuid():N}}",
				"maxUsers": 3,
				"{{field}}": "{{invalidValue}}",
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""";

		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		await AssertValidationProblemAsync(response, field.Length > 0
			? char.ToUpperInvariant(field[0]) + field[1..]
			: field);
	}

	[Theory]
	[InlineData("legalName", 257)]
	[InlineData("description", 1025)]
	[InlineData("notes", 4001)]
	public async Task
	ItShouldReturnUnprocessableEntityWhenOrganizationFieldExceedsMaxLength(
		string field,
		int length
	) {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var value = new string('a', length);

		var body = $$"""
			{
				"name": "Tenant Create Org Too Long {{Guid.NewGuid():N}}",
				"maxUsers": 3,
				"{{field}}": "{{value}}",
				"initialUsers": [
					{ "email": "admin@example.com", "accountLevel": "Admin" }
				]
			}
			""";

		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldUseDefaultMaxUsersWhenMaxUsersIsMissing() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Default Max Missing {Guid.NewGuid():N}";

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = tenantName,
				initialUsers = new[] {
					new {
						email = $"tenant-default-missing-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin",
					},
				},
			}
		);

		await AssertTenantMaxUsersAsync(
			created.Id,
			AppEnvironment.Instance.DEFAULT_MAX_USERS_PER_TENANT
		);
	}

	[Fact]
	public async Task
	ItShouldUseDefaultMaxUsersWhenMaxUsersIsNull() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Default Max Null {Guid.NewGuid():N}";

		var created = await CreateTenantSuccessfullyAsync(
			token,
			new {
				name = tenantName,
				maxUsers = (int?)null,
				initialUsers = new[] {
					new {
						email = $"tenant-default-null-{Guid.NewGuid():N}@example.com",
						accountLevel = "Admin",
					},
				},
			}
		);

		await AssertTenantMaxUsersAsync(
			created.Id,
			AppEnvironment.Instance.DEFAULT_MAX_USERS_PER_TENANT
		);
	}

	[Fact]
	public async Task
	ItShouldAllowPermissionedNonAdminStaffUserToCreateTenant() {
		var token = await CreateStaffUserTokenWithPermissionAsync(
			AppPermissions.Staff.Tenants.CREATE.Key
		);

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				token,
				CreateValidTenantBody("Permissioned Staff Tenant")
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWhenNotAuthenticated() {
		using var response = await _http.SendAsync(
			CreateTenantRequest(
				sessionToken: null,
				CreateValidTenantBody("Unauthenticated Tenant")
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUser() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				tenantToken,
				CreateValidTenantBody("Forbidden Tenant User")
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await CreateUnprivilegedStaffUserTokenAsync();

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				token,
				CreateValidTenantBody("Forbidden Staff User")
			)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Theory]
	[MemberData(nameof(InvalidCreateTenantBodies))]
	public async Task
	ItShouldReturnUnprocessableEntityWhenCreateBodyIsInvalid(
		string body,
		string expectedField
	) {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		await AssertValidationProblemAsync(response, expectedField);
	}

	public static TheoryData<string, string> InvalidCreateTenantBodies() {
		return new TheoryData<string, string> {
			{
				"""
				{
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" }
					]
				}
				""",
				"Name"
			},
			{
				"""
				{
					"name": 123,
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" }
					]
				}
				""",
				"Name"
			},
			{
				"""
				{
					"name": "    ",
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" }
					]
				}
				""",
				"Name"
			},
			{
				"""
				{
					"name": "Tiny",
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" }
					]
				}
				""",
				"Name"
			},
			{
				"""
				{
					"name": "Invalid Max Zero",
					"maxUsers": 0,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" }
					]
				}
				""",
				"MaxUsers"
			},
			{
				"""
				{
					"name": "Invalid Max Negative",
					"maxUsers": -1,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" }
					]
				}
				""",
				"MaxUsers"
			},
			{
				"""
				{
					"name": "Invalid Max String",
					"maxUsers": "10",
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" }
					]
				}
				""",
				"MaxUsers"
			},
			{
				"""
				{
					"name": "Invalid Max Decimal",
					"maxUsers": 1.5,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" }
					]
				}
				""",
				"MaxUsers"
			},
			{
				"""
				{
					"name": "Invalid Max Huge",
					"maxUsers": 999999999999999999999999999999,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" }
					]
				}
				""",
				"MaxUsers"
			},
			{
				"""
				{
					"name": "Missing Initial Users",
					"maxUsers": 10
				}
				""",
				"InitialUsers"
			},
			{
				"""
				{
					"name": "Invalid Initial Users",
					"maxUsers": 10,
					"initialUsers": {}
				}
				""",
				"InitialUsers"
			},
			{
				"""
				{
					"name": "Empty Initial Users",
					"maxUsers": 10,
					"initialUsers": []
				}
				""",
				"InitialUsers"
			},
			{
				"""
				{
					"name": "Bad Initial User Item",
					"maxUsers": 10,
					"initialUsers": ["admin@example.com"]
				}
				""",
				"initialUsers[0]"
			},
			{
				"""
				{
					"name": "Missing Initial Email",
					"maxUsers": 10,
					"initialUsers": [
						{ "accountLevel": "Admin" }
					]
				}
				""",
				"initialUsers[0].email"
			},
			{
				"""
				{
					"name": "Invalid Initial Email Type",
					"maxUsers": 10,
					"initialUsers": [
						{ "email": 123, "accountLevel": "Admin" }
					]
				}
				""",
				"initialUsers[0].email"
			},
			{
				"""
				{
					"name": "Invalid Initial Email",
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "not-an-email", "accountLevel": "Admin" }
					]
				}
				""",
				"initialUsers[0].email"
			},
			{
				"""
				{
					"name": "Missing Initial Level",
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "admin@example.com" }
					]
				}
				""",
				"initialUsers[0].accountLevel"
			},
			{
				"""
				{
					"name": "Invalid Initial Level Type",
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": 123 }
					]
				}
				""",
				"initialUsers[0].accountLevel"
			},
			{
				"""
				{
					"name": "Invalid Initial Level",
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Owner" }
					]
				}
				""",
				"initialUsers[0].accountLevel"
			},
			{
				"""
				{
					"name": "Duplicate Initial Emails",
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "duplicate@example.com", "accountLevel": "Admin" },
						{ "email": "DUPLICATE@example.com", "accountLevel": "User" }
					]
				}
				""",
				"InitialUsers"
			},
			{
				"""
				{
					"name": "Missing Initial Admin",
					"maxUsers": 10,
					"initialUsers": [
						{ "email": "user@example.com", "accountLevel": "User" }
					]
				}
				""",
				"InitialUsers"
			},
			{
				"""
				{
					"name": "Too Many Initial Users",
					"maxUsers": 1,
					"initialUsers": [
						{ "email": "admin@example.com", "accountLevel": "Admin" },
						{ "email": "user@example.com", "accountLevel": "User" }
					]
				}
				""",
				"InitialUsers"
			},
		};
	}

	private static object CreateValidTenantBody(string namePrefix) {
		return new {
			name = $"{namePrefix} {Guid.NewGuid():N}",
			maxUsers = 1,
			initialUsers = new[] {
				new {
					email = $"tenant-create-valid-{Guid.NewGuid():N}@example.com",
					accountLevel = "Admin",
				},
			},
		};
	}

	private static string GetCreateTenantUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.Create
		);
	}

	private static HttpRequestMessage CreateTenantRequest(
		string? sessionToken,
		object body
	) {
		var request = CreateTenantRequest(sessionToken);
		request.Content = JsonContent.Create(body);

		return request;
	}

	private static HttpRequestMessage CreateTenantRequest(
		string? sessionToken,
		string rawJsonBody
	) {
		var request = CreateTenantRequest(sessionToken);
		request.Content = new StringContent(
			rawJsonBody,
			Encoding.UTF8,
			"application/json"
		);

		return request;
	}

	private static HttpRequestMessage CreateTenantRequest(
		string? sessionToken
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateTenantUrl()
		);

		if (!string.IsNullOrWhiteSpace(sessionToken)) {
			request = request.WithSessionToken(sessionToken);
		}

		return request;
	}

	private async Task<CreateTenantAsStaffResult> CreateTenantSuccessfullyAsync(
		string token,
		object body
	) {
		using var response = await _http.SendAsync(
			CreateTenantRequest(token, body)
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Created);

		var created = await response.Content
			.ReadFromJsonAsync<CreateTenantAsStaffResult>();
		created.Should().NotBeNull();

		Assert.NotNull(created);
		return created;
	}

	[Fact]
	public async Task
	ItShouldNotExposeCreationExceptionDetailsWhenTenantServiceFails() {
		using var bodyDocument = JsonDocument.Parse(
			"""
			{
				"name": "Sanitized Tenant Failure",
				"maxUsers": 1,
				"initialUsers": [
					{
						"email": "sanitized-tenant@example.com",
						"accountLevel": "Admin"
					}
				]
			}
			"""
		);
		var bodyRoot = bodyDocument.RootElement;
		var body = new CreateTenantAsStaffBody {
			Name = bodyRoot.GetProperty("name"),
			MaxUsers = bodyRoot.GetProperty("maxUsers"),
			InitialUsers = bodyRoot.GetProperty("initialUsers")
		};
		var authContext = new RequestAuthContext {
			AccountStaff = UserAccount.CreateStaffAccount(Guid.NewGuid())
		};
		var tenantService =
			DispatchProxy.Create<ITenantAsStaffService, ThrowingTenantServiceProxy>();

		var result = await CreateTenantAsStaff.Handle(
			body,
			tenantService,
			authContext,
			NullLogger<CreateTenantAsStaff>.Instance,
			CancellationToken.None
		);
		var httpContext = new DefaultHttpContext();
		httpContext.Response.Body = new MemoryStream();

		await result.ExecuteAsync(httpContext);

		httpContext.Response.StatusCode.Should()
			.Be(StatusCodes.Status400BadRequest);
		httpContext.Response.ContentType.Should()
			.Be("application/problem+json");
		httpContext.Response.Body.Position = 0;
		using var reader = new StreamReader(httpContext.Response.Body);
		var responseBody = await reader.ReadToEndAsync();
		responseBody.Should().NotContain(
			ThrowingTenantServiceProxy.RawExceptionMessage
		);

		var problem = JsonSerializer.Deserialize<AppProblemDetails>(
			responseBody,
			JsonSerializerOptions.Web
		);
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Detail.Should().Be("Failed to create tenant");
		problem.TranslationKey.Should().Be(ResponseKeys.BadRequest);
	}

	private async Task AssertTenantMaxUsersAsync(
		Guid tenantId,
		int expectedMaxUsers
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = await dbContext.Tenant
			.Where(t => t.Id == tenantId)
			.SingleAsync();
		tenant.MaxUsers.Should().Be(expectedMaxUsers);
	}

	private async Task<string> CreateUnprivilegedStaffUserTokenAsync() {
		var email =
			$"tenant-create-no-permission-{Guid.NewGuid():N}@example.com";

		await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			email
		);

		return await _authClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	private async Task<string> CreateStaffUserTokenWithPermissionAsync(
		string permissionKey
	) {
		var email =
			$"tenant-create-permissioned-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			email
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var staffAccount = await dbContext.UserAccount
			.Where(account =>
				account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			)
			.FirstAsync();

		var profile = Profile.CreateStaffProfile(
			$"tenant-create-permission-{Guid.NewGuid():N}",
			"Test-only staff profile for tenant creation permission"
		);

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		await dbContext.ProfilePermission.AddAsync(new ProfilePermission {
			ProfileId = profile.GetRequiredId(),
			PermissionKey = permissionKey,
		});
		await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
			UserAccountId = staffAccount.GetRequiredId(),
			ProfileId = profile.GetRequiredId(),
		});
		await dbContext.SaveChangesAsync();

		return await _authClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	private static async Task AssertValidationProblemAsync(
		HttpResponseMessage response,
		string fieldName
	) {
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);

		var problem =
			await response.Content
				.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
					.Be(ResponseKeys.RequestBodyValidationFailed.Value);
		problem.Errors.Keys.Should()
			.Contain(fieldName);
	}

	private static async Task<IReadOnlyCollection<EmailRequest>>
	WaitForEmailsAsync(
		FakeEmailSender fakeEmailSender,
		int expectedCount
	) {
		const int maxAttempts = 20;

		for (var attempt = 0; attempt < maxAttempts; attempt++) {
			var sentEmails = fakeEmailSender.SentEmails;

			if (sentEmails.Count >= expectedCount) {
				return sentEmails;
			}

			await Task.Delay(100);
		}

		return fakeEmailSender.SentEmails;
	}

	public class ThrowingTenantServiceProxy : DispatchProxy {
		public const string RawExceptionMessage =
			"Host=prod-db;Username=admin;Password=super-secret";

		protected override object? Invoke(
			MethodInfo? targetMethod,
			object?[]? args
		) {
			if (
				targetMethod?.Name
				== nameof(ITenantAsStaffService.CreateTenantWithInitialUsersAsync)
			) {
				throw new InvalidOperationException(RawExceptionMessage);
			}

			throw new NotSupportedException(
				$"Unexpected service call: {targetMethod?.Name}"
			);
		}
	}
}
