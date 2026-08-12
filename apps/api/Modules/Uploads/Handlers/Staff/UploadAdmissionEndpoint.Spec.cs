using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Uploads.Handlers.Staff;

public sealed class UploadAdmissionEndpointSpec : IClassFixture<ApiFixture> {
	private static readonly byte[] PngBytes = [
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x00, 0x00
	];

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UploadAdmissionEndpointSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldRejectAnOverBudgetUploadBeforeStorageAndAudit() {
		var admission = _fixture.Factory.Services
			.GetRequiredService<IUploadAdmissionService>();
		FillGlobalBudget(admission);

		var storage = _fixture.Factory.Services.GetRequiredService<IFileStorage>();
		var filesBefore = GetStoredFiles(storage.RootPath);
		var auditCountBefore = await CountUploadAuditsAsync();
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			BuildUploadRequest(token)
		);

		response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
		response.Content.Headers.ContentType.Should().NotBeNull();
		response.Content.Headers.ContentType!.MediaType
			.Should().Be("application/problem+json");
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Status.Should().Be(StatusCodes.Status429TooManyRequests);
		problem.TranslationKey.Should().Be(ResponseKeys.TooManyRequests);

		GetStoredFiles(storage.RootPath).Should().Equal(filesBefore);
		(await CountUploadAuditsAsync()).Should().Be(auditCountBefore);
	}

	private static void FillGlobalBudget(IUploadAdmissionService admission) {
		var remaining = AppEnvironment.Instance.UPLOAD_GLOBAL_MAX_BYTES;
		var chunk = AppEnvironment.Instance.UPLOAD_PER_STAFF_MAX_BYTES;
		var index = 0;

		while (remaining > 0) {
			var reservationResult = admission.TryReserve(
				Guid.NewGuid(),
				Math.Min(chunk, remaining)
			);
			reservationResult.Should().BeOfType<UploadAdmissionResult.Accepted>();
			var reservation = ((UploadAdmissionResult.Accepted)reservationResult).Reservation;
			admission.Commit(reservation);
			remaining -= Math.Min(chunk, remaining);
			index += 1;
		}

		index.Should().BeGreaterThan(0);
	}

	private async Task<int> CountUploadAuditsAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.AuditLog.CountAsync(
			log => log.Action == AuditActions.UploadCreated
		);
	}

	private static HashSet<string> GetStoredFiles(string rootPath) {
		return Directory.Exists(rootPath)
			? Directory.EnumerateFiles(rootPath, "*", SearchOption.AllDirectories)
				.ToHashSet(StringComparer.Ordinal)
			: [];
	}

	private static HttpRequestMessage BuildUploadRequest(string token) {
		var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(PngBytes);
		fileContent.Headers.ContentType =
			new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", "over-budget.png");

		return new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Uploads.ForStaff.Root,
				Routes.Uploads.ForStaff.Create
			)
		) {
			Content = content
		}.WithSessionToken(token);
	}
}
