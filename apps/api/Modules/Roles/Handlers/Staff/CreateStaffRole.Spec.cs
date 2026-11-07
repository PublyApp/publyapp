
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Roles.Jobs;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class CreateStaffRoleSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CreateStaffRoleSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetCreateRoleUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Create
		);
	}

	// round-6 API F4: a request-scoped Task.Run previously sent this
	// invitation email with no durable record — an aborted request or process
	// restart between the 201 response and the fire-and-forget send silently
	// lost it. Proves the durable path instead: a linked, deliverable
	// InvitationEmailOutbox row exists as soon as the response returns,
	// independent of whether any email was actually sent yet.
	[Fact]
	public async Task
	ItShouldWriteADurableOutboxRowForANewUserInvitationInsteadOfOnlyFireAndForgetSending() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var invitedEmail = $"new-staff-invite-{Guid.NewGuid():N}@example.com";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateStaffRoleSpec._GetCreateRoleUrl()
		) {
			Content = JsonContent.Create(new {
				name = $"Outbox Durability {Guid.NewGuid():N}",
				description = (string?)null,
				permissions = new[] { AppPermissions.Staff.Roles.GET_FOR_STAFF.Key },
				emails = new List<string> { invitedEmail }
			})
		}.WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var result = await response.Content.ReadFromJsonAsync<StaffRoleCreated>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.InvitationsSent.Should().Be(1);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var invitation = await dbContext.Invitation
			.SingleAsync(i => i.Email == invitedEmail);

		var outboxRow = await dbContext.InvitationEmailOutbox
			.SingleAsync(o => o.Email == invitedEmail);

		outboxRow.InvitationId.Should().Be(invitation.Id);
		outboxRow.Token.Should().Be(invitation.Token);
		// The integration host registers no live dispatcher (ApiFactory removes it for
		// every spec), so nothing claims this row before the assertion runs.
		outboxRow.Status.Should().Be(InvitationEmailOutboxStatus.Pending);
	}

	// #291: the EXISTING-user "you have been added as a staff member" notification
	// previously rode a request-scoped Task.Run in the handler with no durable record —
	// an aborted request or process restart silently lost it while the 201 response
	// still claimed the assignment succeeded. Proves the durable path instead: one
	// committed job_queue row for email.staff-joined-notification.v1 carrying the
	// recipient's user id exists as soon as the response returns (the
	// no-fire-and-forget invariant).
	[Fact]
	public async Task
	ItShouldWriteADurableJobQueueRowForAnExistingUserJoinedStaffNotification() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var existingEmail = $"joined-staff-{Guid.NewGuid():N}@example.com";

		await using var setupScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var setupDb = setupScope.ServiceProvider.GetRequiredService<AppDbContext>();
		setupDb.User.Add(new User {
			Email = existingEmail,
			Password = "unused",
			Status = UserStatus.Active,
			IsVerified = true
		});
		await setupDb.SaveChangesAsync();
		var existingUser = await setupDb.User.AsNoTracking()
			.SingleAsync(u => u.Email == existingEmail);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateStaffRoleSpec._GetCreateRoleUrl()
		) {
			Content = JsonContent.Create(new {
				name = $"Durable Joined Notification {Guid.NewGuid():N}",
				description = (string?)null,
				permissions = new[] { AppPermissions.Staff.Roles.GET_FOR_STAFF.Key },
				emails = new List<string> { existingEmail }
			})
		}.WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var result = await response.Content.ReadFromJsonAsync<StaffRoleCreated>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.UsersAssigned.Should().Be(1);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var joinedJobs = await dbContext.JobQueue.AsNoTracking()
			.Where(j => j.JobType == StaffRoleEmailJobs.StaffJoinedNotificationV1.JobType)
			.ToListAsync();

		joinedJobs
			.Where(j => CreateStaffRoleSpec._JobPayloadContainsUserId(j.Payload, existingUser.GetRequiredId()))
			.Should().HaveCount(1);
	}

	private static bool _JobPayloadContainsUserId(string? payload, Guid userId) {
		if (string.IsNullOrWhiteSpace(payload)) {
			return false;
		}

		using var doc = JsonDocument.Parse(payload);
		var root = doc.RootElement;
		if (!root.TryGetProperty("userId", out var token)
			|| token.ValueKind is not JsonValueKind.String) {
			return false;
		}

		return token.GetString() == userId.ToString();
	}

	[Fact]
	public async Task
	ItShouldRejectEmailArraysAboveTheBulkInvitationBound() {
		var emails = Enumerable
			.Range(
				0,
				AppEnvironment.Instance
					.MAX_BULK_INVITATIONS_SIZE
					+ 1
			)
			.Select(index =>
				$"role-bound-{index}@example.com"
			)
			.ToArray();
		var body = new CreateStaffRoleBody {
			Name = JsonSerializer.SerializeToElement(
				"Bounded Role"
			),
			Permissions =
				JsonSerializer.SerializeToElement(
					new[] {
						AppPermissions.Staff.Roles
							.GET_FOR_STAFF.Key,
					}
				),
			Emails = JsonSerializer.SerializeToElement(
				emails
			),
		};

		var result =
			await new CreateStaffRoleBodyValidator()
				.ValidateAsync(body);

		result.IsValid.Should().BeFalse();
		result.Errors.Should().Contain(failure =>
			failure.ErrorMessage.Contains(
				"Emails cannot contain more than",
				StringComparison.Ordinal
			)
		);
	}

	[Fact]
	public async Task ItShouldCreateStaffRoleWithIconAndTone() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var name = $"Styled Staff Role {Guid.NewGuid():N}";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateStaffRoleSpec._GetCreateRoleUrl()
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new {
			name,
			description = "Styled and persisted",
			icon = "shield-check",
			tone = "4",
			permissions = new[] { AppPermissions.Staff.Roles.GET_FOR_STAFF.Key },
			emails = Array.Empty<string>(),
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffRoleCreated>();
		created.Should().NotBeNull();
		Assert.NotNull(created);

		var persistedRole = await this._GetRoleByNameAsync(name);
		persistedRole.Should().NotBeNull();
		Assert.NotNull(persistedRole);
		persistedRole.Icon.Should().Be("shield-check");
		persistedRole.Tone.Should().Be("4");
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidIcon() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var name = $"Staff Role Invalid Icon {Guid.NewGuid():N}";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateStaffRoleSpec._GetCreateRoleUrl()
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new {
			name,
			icon = "not-an-icon",
			permissions = new[] { AppPermissions.Staff.Roles.GET_FOR_STAFF.Key },
			emails = Array.Empty<string>(),
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Icon");
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidTone() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var name = $"Staff Role Invalid Tone {Guid.NewGuid():N}";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateStaffRoleSpec._GetCreateRoleUrl()
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new {
			name,
			tone = "8",
			permissions = new[] { AppPermissions.Staff.Roles.GET_FOR_STAFF.Key },
			emails = Array.Empty<string>(),
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Tone");
	}

	private async Task<Role?> _GetRoleByNameAsync(string name) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.Role
			.AsNoTracking()
			.FirstOrDefaultAsync(role =>
				role.Scope == RoleScope.Staff
				&& !role.IsDeleted
				&& role.Name == name
			);
	}
}
