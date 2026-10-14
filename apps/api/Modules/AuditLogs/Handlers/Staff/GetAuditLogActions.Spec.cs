
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.AuditLogs.Entities;

using Xunit;

namespace PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

public sealed class GetAuditLogActionsSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetAuditLogActionsSpec(
		ApiFixture fixture
	) {
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithActionsList() {
		var token =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var url =
			AuditLogTestHelper.GetActionsUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ActionsResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Actions.Should().NotBeEmpty();
		result.Actions.Should().Contain(
			AuditActions.InvitationCreated
		);
		result.Actions.Should().Contain(
			AuditActions.LoginSucceeded
		);

		// Verify alphabetical sort
		result.Actions.Should()
			.BeInAscendingOrder();
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var url =
			AuditLogTestHelper.GetActionsUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var token =
			await this._AuthClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var url =
			AuditLogTestHelper.GetActionsUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token =
			await this._AuthClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url =
			AuditLogTestHelper.GetActionsUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	private record ActionsResponse {
		public List<string> Actions { get; init; }
			= [];
	}
}
