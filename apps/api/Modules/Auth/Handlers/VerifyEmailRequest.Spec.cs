
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class VerifyEmailRequestSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;

	public VerifyEmailRequestSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
	}

	// Success path: the endpoint was previously reached only through its failure
	// branches (docs/records/2026-10-28-analysis-endpoint-coverage.md). It mints a
	// one-time token and enqueues the email job, so both are asserted, not just the
	// 200.
	[Fact]
	public async Task ItShouldMintAVerificationTokenAndEnqueueTheEmailForAnUnverifiedUser() {
		var (userId, email) = await this._SeedUnverifiedUserAsync();

		using var response = await this._SendAsync(
			email.ToUpperInvariant()
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<VerifyEmailRequestResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Status.Should().Be("success");

		var user = await this._LoadUserAsync(userId);
		var mintedToken = user.EmailVerifyToken;
		mintedToken.Should().NotBeNullOrWhiteSpace();
		mintedToken.Should().HaveLength(
			AppEnvironment.Instance.EMAIL_VERIFY_TOKEN_LENGTH
		);
		user.EmailVerifyTokenExpiresAt.Should().BeAfter(DateTime.UtcNow);
		(await this._LoadJobsAsync(userId)).Should().ContainSingle()
			.Which.JobType.Should().Be(AuthEmailJobs.VerifyEmailV1.JobType);

		// A second request while a live token exists must NOT rotate it (the link
		// already in the user's inbox keeps working) and must send again.
		var firstToken = user.EmailVerifyToken;
		using var second = await this._SendAsync(email);
		second.StatusCode.Should().Be(HttpStatusCode.OK);

		var reloaded = await this._LoadUserAsync(userId);
		reloaded.EmailVerifyToken.Should().Be(firstToken);
		(await this._LoadJobsAsync(userId)).Should().HaveCount(2);
	}

	// An already-verified account is a refusal, not a silent re-send.
	[Fact]
	public async Task ItShouldReturnBadRequestWhenTheEmailIsAlreadyVerified() {
		using var response = await this._SendAsync(
			TestConstants.AcmeAdminEmail
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("email-already-verified");
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundForNonExistentEmail() {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Auth.VerifyEmailRequest
		);

		request.Content = JsonContent.Create(
			new { email = "nonexistent@example.com" }
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnValidationErrorForInvalidEmail() {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Auth.VerifyEmailRequest
		);

		request.Content = JsonContent.Create(
			new { email = "not-an-email" }
		);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	private async Task<HttpResponseMessage> _SendAsync(string email) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			Routes.Auth.VerifyEmailRequest
		);
		request.Content = JsonContent.Create(new { email });
		return await this._Http.SendAsync(request);
	}

	private async Task<(Guid UserId, string Email)> _SeedUnverifiedUserAsync() {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var email = $"verify-email-{Guid.NewGuid():N}@example.com";
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = "VerifyEmail",
			LastName = "Spec",
			Status = UserStatus.Active,
			IsVerified = false,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		return (user.GetRequiredId(), email);
	}

	private async Task<User> _LoadUserAsync(Guid userId) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		return await dbContext.User
			.AsNoTracking()
			.SingleAsync(user => user.Id == userId);
	}

	private async Task<List<JobQueueItem>> _LoadJobsAsync(Guid userId) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var jobs = await dbContext.JobQueue
			.AsNoTracking()
			.Where(job => job.JobType == AuthEmailJobs.VerifyEmailV1.JobType)
			.ToListAsync();

		return jobs
			.Where(job => job.Payload.Contains(userId.ToString()))
			.ToList();
	}
}
