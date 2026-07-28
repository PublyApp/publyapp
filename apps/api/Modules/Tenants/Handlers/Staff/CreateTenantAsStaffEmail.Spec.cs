
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

// Email-observing sibling of CreateTenantAsStaffSpec. xUnit instantiates a test class
// fresh per test method; because this class owns its ApiFixture directly (constructed
// here, not injected via IClassFixture), every method gets its own database and its own
// DI-registered FakeEmailSender. No two methods — present or future — can ever see each
// other's sent emails, so there is nothing to Clear() and no dependency on run order. See
// docs/guides/api-integration-tests.md ("Fixture Lifecycle and Mutable Test State").
public sealed class CreateTenantAsStaffEmailSpec : IAsyncLifetime {
	private readonly ApiFixture _fixture = new();
	private HttpClient _http = null!;
	private TestAuthClient _authClient = null!;

	public async Task InitializeAsync() {
		await _fixture.InitializeAsync();
		_http = _fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	public Task DisposeAsync() {
		return _fixture.DisposeAsync();
	}

	[Fact]
	public async Task
	ItShouldCreatePendingTenantDefaultProfileInvitationsAndEmails() {
		var fakeEmailSender = _fixture.GetFakeEmailSender();

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

		var outboxRows = await dbContext.InvitationEmailOutbox
			.Where(outbox =>
				outbox.Email == adminEmail
				|| outbox.Email == userEmail
			)
			.Include(outbox => outbox.Invitation)
			.ToListAsync();
		outboxRows.Should().HaveCount(2);

		var dispatcher =
			ActivatorUtilities.CreateInstance<InvitationEmailOutboxDispatcher>(
				scope.ServiceProvider
			);
		var emailService = scope.ServiceProvider
			.GetRequiredService<IEmailService>();

		foreach (var outboxRow in outboxRows) {
			await dispatcher.SendOneAsync(
				dbContext,
				emailService,
				outboxRow,
				CancellationToken.None
			);
		}

		var sentEmails = fakeEmailSender.SentEmails;
		sentEmails.Select(email => email.To)
			.Should().BeEquivalentTo([adminEmail, userEmail]);
		sentEmails.Should().OnlyContain(email =>
			email.Subject.Contains(tenantName, StringComparison.Ordinal)
			&& email.HtmlBody.Contains("Accept the invitation", StringComparison.Ordinal)
		);
	}

	// Regression probe for #548-class contamination: this method neither Clears the fake
	// nor runs before/after the method above in any guaranteed order — it cannot, because
	// each method in this class stands up its own ApiFixture (own database, own DI
	// container, own FakeEmailSender). The empty-queue assertion at the top proves nothing
	// leaked IN from another method; the exact-count assertion at the bottom proves nothing
	// this method sends is visible to any other method. Kept permanently: it is the cheapest
	// possible guard against a future refactor reintroducing a shared fixture here.
	[Fact]
	public async Task
	ItShouldObserveOnlyItsOwnEmailWithNoResetRegardlessOfExecutionOrder() {
		var fakeEmailSender = _fixture.GetFakeEmailSender();
		fakeEmailSender.SentEmails.Should().BeEmpty(
			"this method owns a fresh FakeEmailSender — nothing else can have written to it"
		);

		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantName =
			$"Tenant Create Probe {Guid.NewGuid():N}";
		var adminEmail =
			$"tenant-create-probe-admin-{Guid.NewGuid():N}@example.com";

		using var response = await _http.SendAsync(
			CreateTenantRequest(
				token,
				new {
					name = tenantName,
					maxUsers = 1,
					initialUsers = new[] {
						new {
							email = adminEmail,
							accountLevel = "admin",
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

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var outboxRow = await dbContext.InvitationEmailOutbox
			.Include(outbox => outbox.Invitation)
			.SingleAsync(outbox => outbox.Email == adminEmail);

		var dispatcher =
			ActivatorUtilities.CreateInstance<InvitationEmailOutboxDispatcher>(
				scope.ServiceProvider
			);
		var emailService = scope.ServiceProvider
			.GetRequiredService<IEmailService>();

		await dispatcher.SendOneAsync(
			dbContext,
			emailService,
			outboxRow,
			CancellationToken.None
		);

		fakeEmailSender.SentEmails.Should().ContainSingle(
			email => email.To == adminEmail,
			"only this method's own send should be visible, with no cross-method leftovers"
		);
	}

	private static string GetCreateTenantUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.Create
		);
	}

	private static HttpRequestMessage CreateTenantRequest(
		string sessionToken,
		object body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateTenantUrl()
		).WithSessionToken(sessionToken);
		request.Content = JsonContent.Create(body);

		return request;
	}
}
