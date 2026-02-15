namespace MainApi.Src.Modules.AuditLogs.Handlers.Staff;

using System.Net;
using System.Reflection;

using FluentAssertions;

using MainApi.Src.Lib;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Modules.AuditLogs.Entities;

using Xunit;

// SetExportMaxRows mutates the global AppEnvironment
// singleton via reflection. DisableParallelization
// ensures this class never overlaps with other test
// classes that might hit the export endpoint.
[CollectionDefinition(
	"AuditLogExport",
	DisableParallelization = true
)]
public class AuditLogExportCollection;

[Collection("AuditLogExport")]
public sealed class ExportAuditLogsSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;
	private readonly ApiFixture _fixture;

	public ExportAuditLogsSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldReturnCsvWithValidFormat() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			AuditActions.LoginSucceeded
		);

		var url = AuditLogTestHelper.GetExportUrl(
			"csv"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		response.Content.Headers.ContentType!
			.MediaType.Should().Be("text/csv");

		var dispositionHeader =
			response.Content.Headers
				.ContentDisposition;
		dispositionHeader.Should().NotBeNull();
		dispositionHeader!.DispositionType.Should()
			.Be("attachment");
		dispositionHeader.FileName.Should()
			.StartWith("audit-logs-")
			.And.EndWith(".csv");

		var content = await response.Content
			.ReadAsStringAsync();
		content.Should().StartWith("Id,UserName");
		content.Should().Contain(
			AuditActions.LoginSucceeded
		);
	}

	[Fact]
	public async Task
	ItShouldReturnJsonWithValidFormat() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			AuditActions.InvitationAccepted
		);

		var url = AuditLogTestHelper.GetExportUrl(
			"json"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		response.Content.Headers.ContentType!
			.MediaType.Should()
			.Be("application/json");

		var content = await response.Content
			.ReadAsStringAsync();
		content.Should().StartWith("[");
		content.Should().EndWith("]");
		content.Should().Contain(
			AuditActions.InvitationAccepted
		);
	}

	[Fact]
	public async Task
	ItShouldReturn422ForInvalidFormat() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetExportUrl(
			"xml"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldApplyFiltersToExport() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			AuditActions.StaffProfileCreated
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			AuditActions.ImpersonationEnded
		);

		var url = AuditLogTestHelper.GetExportUrl(
			"csv",
			action: AuditActions.StaffProfileCreated
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var content = await response.Content
			.ReadAsStringAsync();
		content.Should().Contain(
			AuditActions.StaffProfileCreated
		);
		content.Should().NotContain(
			AuditActions.ImpersonationEnded
		);
	}

	[Fact]
	public async Task
	ItShouldNeutralizeFormulaTriggerCharsWhenExportingCsv() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		var uniqueAction =
			$"test.csv.injection.{Guid.NewGuid().ToString()[..8]}";

		// Seed logs with formula-trigger details
		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			uniqueAction,
			details: "=1+1"
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			uniqueAction,
			details: "+cmd|'/C calc'!A0"
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			uniqueAction,
			details: "-1+1"
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			uniqueAction,
			details: "@SUM(A1:A10)"
		);
		await AuditLogTestHelper.SeedAuditLogAsync(
			_fixture.Factory,
			userId,
			uniqueAction,
			details: "\t=bypass"
		);

		var url = AuditLogTestHelper.GetExportUrl(
			"csv",
			action: uniqueAction
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var content = await response.Content
			.ReadAsStringAsync();

		// All formula triggers must be prefixed
		// with a single quote
		content.Should().Contain("'=1+1");
		content.Should().Contain(
			"'+cmd|'/C calc'!A0"
		);
		content.Should().Contain("'-1+1");
		content.Should().Contain("'@SUM(A1:A10)");
		content.Should().Contain("'\t=bypass");

		// Raw formula triggers must NOT appear
		// (without the single-quote prefix)
		var lines = content.Split('\n')
			.Where(l => l.Contains(uniqueAction))
			.ToList();
		foreach (var line in lines) {
			// Details column should never start
			// a cell with a bare formula trigger
			line.Should().NotContain(",=");
			line.Should().NotContain(",+cmd");
			line.Should().NotContain(",-1+1");
			line.Should().NotContain(",@SUM");
		}
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenStartDateIsMalformed() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetExportUrl(
			"csv",
			startDate: "xyz"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenTargetIdIsNotValidGuid() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = AuditLogTestHelper.GetExportUrl(
			"csv",
			targetId: "abc"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var url = AuditLogTestHelper.GetExportUrl(
			"csv"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForNonStaffUser() {
		var token =
			await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var url = AuditLogTestHelper.GetExportUrl(
			"csv"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

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

		var url = AuditLogTestHelper.GetExportUrl(
			"csv"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturn400WhenExportExceedsLimit() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var userId =
			await AuditLogTestHelper
				.GetUserIdByEmailAsync(
					_fixture.Factory,
					TestConstants.StaffAdminEmail
				);

		// Seed more logs than the export limit
		// The default limit is 10000, but we use
		// a targeted action filter to control count.
		// Seed 3 logs, then query with a limit
		// override that makes 3 exceed it.
		var uniqueAction = $"test.export.limit.{Guid.NewGuid().ToString()[..8]}";
		for (var i = 0; i < 3; i++) {
			await AuditLogTestHelper
				.SeedAuditLogAsync(
					_fixture.Factory,
					userId,
					uniqueAction
				);
		}

		// Override the export max rows to 2
		// so that 3 rows exceed the limit
		var originalLimit = AppEnvironment.Instance
			.AUDIT_LOG_EXPORT_MAX_ROWS;
		SetExportMaxRows(2);

		try {
			var url = AuditLogTestHelper.GetExportUrl(
				"csv",
				action: uniqueAction
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);
		} finally {
			SetExportMaxRows(originalLimit);
		}
	}

	/// <summary>
	/// Uses reflection on the auto-property backing
	/// field because AppEnvironment is a singleton
	/// with a get-only property. This will break if
	/// the property becomes a non-auto property —
	/// update the field name accordingly if that
	/// happens.
	/// </summary>
	private static void SetExportMaxRows(int value) {
		var fieldName =
			$"<{nameof(
				AppEnvironment
					.AUDIT_LOG_EXPORT_MAX_ROWS
			)}>k__BackingField";
		var field = typeof(AppEnvironment)
			.GetField(
				fieldName,
				BindingFlags.Instance
				| BindingFlags.NonPublic
			);

		if (field is null) {
			throw new InvalidOperationException(
				$"Backing field '{fieldName}' not "
				+ "found. Has the property changed "
				+ "from an auto-property?"
			);
		}

		field.SetValue(
			AppEnvironment.Instance, value
		);
	}
}
