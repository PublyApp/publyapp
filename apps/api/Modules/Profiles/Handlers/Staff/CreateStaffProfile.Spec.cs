
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class CreateStaffProfileSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateStaffProfileSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
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
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var invitedEmail = $"new-staff-invite-{Guid.NewGuid():N}@example.com";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateProfileUrl()
		) {
			Content = JsonContent.Create(new {
				name = $"Outbox Durability {Guid.NewGuid():N}",
				description = (string?)null,
				permissions = new[] { AppPermissions.Staff.Profiles.GET_FOR_STAFF.Key },
				emails = new List<string> { invitedEmail }
			})
		}.WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var result = await response.Content.ReadFromJsonAsync<StaffProfileCreated>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.InvitationsSent.Should().Be(1);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
				$"profile-bound-{index}@example.com"
			)
			.ToArray();
		var body = new CreateStaffProfileBody {
			Name = JsonSerializer.SerializeToElement(
				"Bounded Profile"
			),
			Permissions =
				JsonSerializer.SerializeToElement(
					new[] {
						AppPermissions.Staff.Profiles
							.GET_FOR_STAFF.Key,
					}
				),
			Emails = JsonSerializer.SerializeToElement(
				emails
			),
		};

		var result =
			await new CreateStaffProfileBodyValidator()
				.ValidateAsync(body);

		result.IsValid.Should().BeFalse();
		result.Errors.Should().Contain(failure =>
			failure.ErrorMessage.Contains(
				"Emails cannot contain more than",
				StringComparison.Ordinal
			)
		);
	}
}
