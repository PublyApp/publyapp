
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Roles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class UpdateTenantRoleAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public UpdateTenantRoleAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(string tenantId, string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.UpdateFn(roleId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await this._GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { name = "Updated" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await this._GetTenantIdAsync();
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await this._GetTenantIdAsync();
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForEmptyPatchBody() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "Updated" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRejectDuplicateNamesWithinTenant() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId, "Update A");
		var existingRoleId = await this._CreateRoleAsync(token, tenantId, "Update B");

		var existingName = await this._GetRoleNameAsync(token, tenantId, existingRoleId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = existingName });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RoleNameAlreadyExists);
	}

	[Fact]
	public async Task ItShouldUpdateNameAndDescription() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);
		var roleGuid = Guid.Parse(roleId);
		await this._AddRolePermissionAsync(
			roleGuid,
			AppPermissions.Tenant.Modules.ACCESS_USERS.Key
		);
		var originalName = await this._GetRoleNameAsync(token, tenantId, roleId);
		var originalDescription = "Role created for update tests";
		var updatedName = "Renamed " + Guid.NewGuid().ToString("N")[..8];
		var updatedDescription = "Updated description";

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name = updatedName,
			description = updatedDescription,
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Role.Description.Should().Be(updatedDescription);
		payload.Role.PermissionsCount.Should().Be(1);
		payload.Role.CreatedAt.Should().NotBe(default);
		payload.Role.UpdatedAt.Should().NotBe(default);

		var persistedRole = await this._GetRoleAsync(roleGuid);
		payload.Role.CreatedAt.Should()
			.BeCloseTo(persistedRole.CreatedAt, TimeSpan.FromMicroseconds(1));
		payload.Role.UpdatedAt.Should()
			.BeCloseTo(persistedRole.UpdatedAt, TimeSpan.FromMicroseconds(1));

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleUpdated,
			Guid.Parse(roleId)
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantRoleUpdated);
		UpdateTenantRoleAsStaffSpec._AssertAuditDetails(
			auditLog,
			expectedTenantId: tenantId,
			expectedRoleId: Guid.Parse(roleId),
			expectedRoleName: updatedName,
			expectedIsDefault: false,
			expectedNameOld: originalName,
			expectedNameNew: updatedName,
			expectedDescriptionOld: originalDescription,
			expectedDescriptionNew: updatedDescription
		);
	}

	[Fact]
	public async Task ItShouldClearDescriptionWhenNullIsProvided() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);
		var roleGuid = Guid.Parse(roleId);

		var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = new StringContent(
			"{\"description\":null}",
			Encoding.UTF8,
			"application/json"
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Role.Description.Should().BeNull();

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleUpdated,
			roleGuid
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantRoleUpdated);
		UpdateTenantRoleAsStaffSpec._AssertAuditDetails(
			auditLog,
			expectedTenantId: tenantId,
			expectedRoleId: roleGuid,
			expectedRoleName: payload.Role.Name,
			expectedIsDefault: false,
			expectedNameOld: null,
			expectedNameNew: null,
			expectedDescriptionOld: "Role created for update tests",
			expectedDescriptionNew: null
		);
	}

	[Fact]
	public async Task ItShouldSetIconAndTone() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			icon = "users-group",
			tone = "6",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Role.Icon.Should().Be("users-group");
		payload.Role.Tone.Should().Be("6");

		var persistedRole = await this._GetRoleAsync(Guid.Parse(roleId));
		persistedRole.Icon.Should().Be("users-group");
		persistedRole.Tone.Should().Be("6");
	}

	[Fact]
	public async Task ItShouldWriteAuditLogWhenOnlyIconChanges() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);
		var roleGuid = Guid.Parse(roleId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { icon = "users-group" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleUpdated,
			roleGuid
		);
		UpdateTenantRoleAsStaffSpec._AssertStyleAuditDetails(
			auditLog,
			tenantId,
			roleGuid,
			payload.Role.Name,
			new Dictionary<string, (string? Old, string? New)> {
				["icon"] = (null, "users-group"),
			}
		);
	}

	[Fact]
	public async Task ItShouldWriteAuditLogWhenOnlyToneChanges() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);
		var roleGuid = Guid.Parse(roleId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { tone = "6" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleUpdated,
			roleGuid
		);
		UpdateTenantRoleAsStaffSpec._AssertStyleAuditDetails(
			auditLog,
			tenantId,
			roleGuid,
			payload.Role.Name,
			new Dictionary<string, (string? Old, string? New)> {
				["tone"] = (null, "6"),
			}
		);
	}

	[Fact]
	public async Task ItShouldClearIconAndToneWhenNullIsProvided() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);
		await this._SetRoleStyleAsync(Guid.Parse(roleId), "shield", "2");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = new StringContent(
			"{\"icon\":null,\"tone\":null}",
			Encoding.UTF8,
			"application/json"
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Role.Icon.Should().BeNull();
		payload.Role.Tone.Should().BeNull();

		var persistedRole = await this._GetRoleAsync(Guid.Parse(roleId));
		persistedRole.Icon.Should().BeNull();
		persistedRole.Tone.Should().BeNull();

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleUpdated,
			Guid.Parse(roleId)
		);
		UpdateTenantRoleAsStaffSpec._AssertStyleAuditDetails(
			auditLog,
			tenantId,
			Guid.Parse(roleId),
			payload.Role.Name,
			new Dictionary<string, (string? Old, string? New)> {
				["icon"] = ("shield", null),
				["tone"] = ("2", null),
			}
		);
	}

	[Fact]
	public async Task ItShouldLeaveIconAndToneUnchangedWhenOmitted() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);
		await this._SetRoleStyleAsync(Guid.Parse(roleId), "briefcase", "3");

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			description = "Style fields omitted",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Role.Icon.Should().Be("briefcase");
		payload.Role.Tone.Should().Be("3");

		var persistedRole = await this._GetRoleAsync(Guid.Parse(roleId));
		persistedRole.Icon.Should().Be("briefcase");
		persistedRole.Tone.Should().Be("3");
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidTone() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { tone = "8" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Tone");
	}

	[Fact]
	public async Task ItShouldNotWriteAuditLogWhenPatchNormalizesToNoChange() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(token, tenantId);
		var roleGuid = Guid.Parse(roleId);
		var noOpDescription = "Role created for update tests";

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			UpdateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			description = noOpDescription,
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Role.Description.Should().Be(noOpDescription);

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleUpdated,
			roleGuid
		);
		auditLog.Should().BeNull();
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<string> _CreateRoleAsync(
		string staffToken,
		Guid tenantId,
		string? name = null
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Roles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Roles.ForTenantAsStaff.Create
			)
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new {
			name = name ?? ("Tenant Role " + Guid.NewGuid().ToString("N")[..8]),
			description = "Role created for update tests",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		return payload.Role.Id.ToString();
	}

	private async Task<string> _GetRoleNameAsync(
		string staffToken,
		Guid tenantId,
		string roleId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Roles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Roles.ForTenantAsStaff.GetFn(roleId)
			)
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		if (payload is null) {
			throw new InvalidOperationException("Failed to deserialize tenant role");
		}

		return payload.Role.Name;
	}

	private async Task<AuditLog?> _GetLatestAuditLogAsync(
		string action,
		Guid targetId
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log => log.Action == action && log.TargetId == targetId)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();
	}

	private async Task _SetRoleStyleAsync(
		Guid roleId,
		string icon,
		string tone
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var role = await dbContext.Role.SingleAsync(item => item.Id == roleId);
		role.Icon = icon;
		role.Tone = tone;
		await dbContext.SaveChangesAsync();
	}

	private async Task _AddRolePermissionAsync(
		Guid roleId,
		string permissionKey
	) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		await dbContext.RolePermission.AddAsync(new RolePermission {
			RoleId = roleId,
			PermissionKey = permissionKey,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task<Role> _GetRoleAsync(Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.Role
			.AsNoTracking()
			.SingleAsync(item => item.Id == roleId);
	}

	private static void _AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedRoleId,
		string expectedRoleName,
		bool expectedIsDefault,
		string? expectedNameOld,
		string? expectedNameNew,
		string? expectedDescriptionOld,
		string? expectedDescriptionNew
	) {
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("RoleId").GetGuid().Should().Be(expectedRoleId);
		details.GetProperty("RoleName").GetString().Should().Be(expectedRoleName);
		details.GetProperty("IsDefault").GetBoolean().Should().Be(expectedIsDefault);

		var changedFields = details.GetProperty("ChangedFields");
		if (expectedNameOld is not null || expectedNameNew is not null) {
			var name = changedFields.GetProperty("name");
			name.GetProperty("Old").GetString().Should().Be(expectedNameOld);
			name.GetProperty("New").GetString().Should().Be(expectedNameNew);
		}

		if (expectedDescriptionOld is not null || expectedDescriptionNew is not null) {
			var description = changedFields.GetProperty("description");
			description.GetProperty("Old").GetString().Should().Be(expectedDescriptionOld);
			if (expectedDescriptionNew is null) {
				description.GetProperty("New").ValueKind.Should().Be(JsonValueKind.Null);
			} else {
				description.GetProperty("New").GetString().Should().Be(expectedDescriptionNew);
			}
		}
	}

	private static void _AssertStyleAuditDetails(
		AuditLog? auditLog,
		Guid expectedTenantId,
		Guid expectedRoleId,
		string expectedRoleName,
		IReadOnlyDictionary<string, (string? Old, string? New)> expectedChanges
	) {
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantRoleUpdated);
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);

		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;
		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("RoleId").GetGuid().Should().Be(expectedRoleId);
		details.GetProperty("RoleName").GetString().Should().Be(expectedRoleName);

		var changedFields = details.GetProperty("ChangedFields");
		changedFields.EnumerateObject()
			.Select(property => property.Name)
			.Should()
			.BeEquivalentTo(expectedChanges.Keys);

		foreach (var expectedChange in expectedChanges) {
			var changedField = changedFields.GetProperty(expectedChange.Key);
			UpdateTenantRoleAsStaffSpec._GetNullableString(changedField.GetProperty("Old"))
				.Should().Be(expectedChange.Value.Old);
			UpdateTenantRoleAsStaffSpec._GetNullableString(changedField.GetProperty("New"))
				.Should().Be(expectedChange.Value.New);
		}
	}

	private static string? _GetNullableString(JsonElement element) {
		if (element.ValueKind == JsonValueKind.Null) {
			return null;
		}

		return element.GetString();
	}

	private sealed record GetTenantRoleByIdResponse {
		public required TenantRoleItemResponse Role { get; init; }
	}

	private sealed record TenantRoleItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Description { get; init; }
		public string? Icon { get; init; }
		public string? Tone { get; init; }
		public bool IsDefault { get; init; }
		public int UserAccountCount { get; init; }
		public int PermissionsCount { get; init; }
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
