using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Posts.Validation;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

public sealed class PostTenantCrudSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public PostTenantCrudSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _PostsUrl {
		get {
			return "/posts";
		}
	}

	private static string _PostByIdUrl(string postId) {
		return PathUtils.Join("/posts", postId);
	}

	// ── Create ──────────────────────────────────────────────────────────

	[Fact]
	public async Task
	ItShouldCreateAPostAndReturn201WithDtoWhenBodyValid() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		var body = "Hello posts " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(HttpMethod.Post, _PostsUrl)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body,
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload =
			await response.Content.ReadFromJsonAsync<PostCreated>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Body.Should().Be(body);
		payload.TenantId.Should().Be(tenantId);
		payload.Status.Should().Be("draft");
		Guid.TryParse(payload.Id.ToString(), out _).Should().BeTrue();

		// persisted
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var persisted = await (
			from p in db.Post.AsNoTracking()
			where p.Id == payload.Id
			select p
		).FirstOrDefaultAsync();
		persisted.Should().NotBeNull();
		Assert.NotNull(persisted);
		persisted.Body.Should().Be(body);
		persisted.TenantId.Should().Be(tenantId);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenBodyEmptyOnCreate() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(HttpMethod.Post, _PostsUrl)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem =
			await response.Content
				.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenBodyOverMaxLengthOnCreate() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		var longBody =
			new string('a', PostValidationRules.BodyMaxLength + 1);

		using var request = new HttpRequestMessage(HttpMethod.Post, _PostsUrl)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = longBody,
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenProjectIdInvalidOnCreate() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(HttpMethod.Post, _PostsUrl)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "valid body",
			projectId = "not-a-guid",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenProjectFromAnotherTenantOnCreate() {
		var (acmeId, acmeToken) = await _LoginAsAcmeAdminAsync();
		var otherProjectId = await _CreateProjectForTenantAsync(
			await _GetTenantIdByNameAsync(SeedConstants.Tenants.GlobalName)
		);

		using var request = new HttpRequestMessage(HttpMethod.Post, _PostsUrl)
			.WithSessionToken(acmeToken)
			.WithTenantId(acmeId);
		request.Content = JsonContent.Create(new {
			body = "cross-tenant project attempt",
			projectId = otherProjectId.ToString(),
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		_ = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenProjectDeletedOnCreate() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		var deletedProjectId =
			await _CreateDeletedProjectForTenantAsync(tenantId);

		using var request = new HttpRequestMessage(HttpMethod.Post, _PostsUrl)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "deleted project attempt on create",
			projectId = deletedProjectId.ToString(),
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		_ = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
	}

	[Fact]
	public async Task
	ItShouldReturn403WithoutCreatePermission() {
		var tenantId = await _GetAcmeIdAsync();
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(HttpMethod.Post, _PostsUrl)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "no permission",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		var problem =
			await response.Content
				.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
			.Be("user-does-not-have-the-necessary-permissions");
	}

	// ── Get ─────────────────────────────────────────────────────────────

	[Fact]
	public async Task
	ItShouldGetAPostByIdForOwnerTenant() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		var postId = await _CreatePostViaApiAsync(
			tenantId, token, "get-me " + Guid.NewGuid().ToString("N")[..8]
		);

		using var request =
			new HttpRequestMessage(HttpMethod.Get, _PostByIdUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var detail =
			await response.Content.ReadFromJsonAsync<PostDetail>();
		detail.Should().NotBeNull();
		Assert.NotNull(detail);
		detail.Id.ToString().Should().Be(postId);
	}

	[Fact]
	public async Task
	ItShouldReturn404WhenGettingOtherTenantsPost() {
		var (acmeId, acmeToken) = await _LoginAsAcmeAdminAsync();
		var globalId =
			await _GetTenantIdByNameAsync(SeedConstants.Tenants.GlobalName);
		var globalToken = await _AuthClient.LoginAsync(
			TestConstants.GlobalAdminEmail,
			TestConstants.SeedPassword
		);
		var postId =
			await _CreatePostViaApiAsync(acmeId, acmeToken, "acme only");

		// Global admin tries to fetch Acme's post — tenant isolation must 404
		using var request =
			new HttpRequestMessage(HttpMethod.Get, _PostByIdUrl(postId))
				.WithSessionToken(globalToken)
				.WithTenantId(globalId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturn400ForMalformedIdOnGet() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_PostByIdUrl("not-a-guid")
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturn403WithoutViewPermissionOnGet() {
		var postId = await _CreatePostAsAcmeAdminAsync(
			"view-permission " + Guid.NewGuid().ToString("N")[..8]
		);
		// Round 2: the seeded Acme member now holds publishing permissions via the
		// demo profile; this view-denial pin uses a dedicated profile-less member.
		var (acmeId, bareEmail) = await _CreateBareAcmeMemberAsync();
		var userToken = await _AuthClient.LoginAsync(
			bareEmail,
			TestConstants.SeedPassword
		);

		using var request =
			new HttpRequestMessage(HttpMethod.Get, _PostByIdUrl(postId))
				.WithSessionToken(userToken)
				.WithTenantId(acmeId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// ── Find (pagination + isolation) ──────────────────────────────────

	[Fact]
	public async Task
	ItShouldFindPostsPaginatedAndIsolatedPerTenant() {
		var (acmeId, acmeToken) = await _LoginAsAcmeAdminAsync();
		var globalId =
			await _GetTenantIdByNameAsync(SeedConstants.Tenants.GlobalName);
		var globalToken = await _AuthClient.LoginAsync(
			TestConstants.GlobalAdminEmail,
			TestConstants.SeedPassword
		);

		var sentinel =
			"isolation-" + Guid.NewGuid().ToString("N")[..8];
		_ = await _CreatePostViaApiAsync(
			acmeId, acmeToken, sentinel + " acme"
		);
		_ = await _CreatePostViaApiAsync(
			globalId, globalToken, sentinel + " global"
		);

		// List as Acme: must see acme-sentinel, never global's
		using var acmeFind = new HttpRequestMessage(
			HttpMethod.Get,
			_PostsUrl + "?q=" + Uri.EscapeDataString(sentinel) + "&limit=20"
		)
			.WithSessionToken(acmeToken)
			.WithTenantId(acmeId);

		using var acmeResponse = await _Http.SendAsync(acmeFind);
		acmeResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var acmePayload =
			await acmeResponse.Content
				.ReadFromJsonAsync<FindPostsPayload>();
		acmePayload.Should().NotBeNull();
		Assert.NotNull(acmePayload);
		_ = acmePayload.Data.Should().Contain(item =>
			item.BodyPreview.Contains(
				sentinel + " acme",
				StringComparison.Ordinal
			)
		);
		_ = acmePayload.Data.Any(item =>
			item.BodyPreview.Contains(
				sentinel + " global",
				StringComparison.Ordinal
			)
		).Should().BeFalse();

		// Pagination: at least one more page when limit=1 across distinct q
		using var paged = new HttpRequestMessage(
			HttpMethod.Get,
			_PostsUrl + "?limit=1"
		)
			.WithSessionToken(acmeToken)
			.WithTenantId(acmeId);

		using var pagedResponse = await _Http.SendAsync(paged);
		pagedResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var pagedPayload =
			await pagedResponse.Content
				.ReadFromJsonAsync<FindPostsPayload>();
		pagedPayload.Should().NotBeNull();
		Assert.NotNull(pagedPayload);
		pagedPayload.Data.Count.Should().BeLessThanOrEqualTo(1);
	}

	[Fact]
	public async Task
	ItShouldReturn403WithoutViewPermissionOnFind() {
		// Round 2: same adaptation as the get pin above — a dedicated bare member.
		var (acmeId, bareEmail) = await _CreateBareAcmeMemberAsync();
		var userToken = await _AuthClient.LoginAsync(
			bareEmail,
			TestConstants.SeedPassword
		);

		using var request =
			new HttpRequestMessage(HttpMethod.Get, _PostsUrl)
				.WithSessionToken(userToken)
				.WithTenantId(acmeId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// ── Update ─────────────────────────────────────────────────────────

	[Fact]
	public async Task
	ItShouldUpdateAPostBodyAndProject() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		var projectId = await _CreateProjectForTenantAsync(tenantId);
		var postId = await _CreatePostViaApiAsync(
			tenantId, token, "before update"
		);
		var newBody = "after update " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_PostByIdUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = newBody,
			projectId = projectId.ToString(),
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var updated =
			await response.Content.ReadFromJsonAsync<PostUpdated>();
		updated.Should().NotBeNull();
		Assert.NotNull(updated);
		updated.Body.Should().Be(newBody);
		updated.ProjectId.Should().Be(projectId);
	}

	[Fact]
	public async Task
	ItShouldClearProjectOnUpdateWhenNull() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		var projectId = await _CreateProjectForTenantAsync(tenantId);
		var postId = await _CreatePostViaApiAsyncWithProjectAsync(
			tenantId, token, "clear-project", projectId
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_PostByIdUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = new StringContent(
			"""{"projectId":null}""",
			System.Text.Encoding.UTF8,
			"application/json"
		);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var updated =
			await response.Content.ReadFromJsonAsync<PostUpdated>();
		updated.Should().NotBeNull();
		Assert.NotNull(updated);
		updated.ProjectId.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenProjectFromAnotherTenantOnUpdate() {
		var (acmeId, acmeToken) = await _LoginAsAcmeAdminAsync();
		var postId =
			await _CreatePostViaApiAsync(acmeId, acmeToken, "update cross");
		var otherProjectId = await _CreateProjectForTenantAsync(
			await _GetTenantIdByNameAsync(SeedConstants.Tenants.GlobalName)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_PostByIdUrl(postId)
		)
			.WithSessionToken(acmeToken)
			.WithTenantId(acmeId);
		request.Content = JsonContent.Create(new {
			projectId = otherProjectId.ToString(),
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturn422WhenProjectDeletedOnUpdate() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		var postId =
			await _CreatePostViaApiAsync(tenantId, token, "update deleted");
		var deletedProjectId =
			await _CreateDeletedProjectForTenantAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_PostByIdUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			projectId = deletedProjectId.ToString(),
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturn404WhenUpdatingOtherTenantsPost() {
		var (acmeId, acmeToken) = await _LoginAsAcmeAdminAsync();
		var postId =
			await _CreatePostViaApiAsync(acmeId, acmeToken, "acme only 2");
		var globalId =
			await _GetTenantIdByNameAsync(SeedConstants.Tenants.GlobalName);
		var globalToken = await _AuthClient.LoginAsync(
			TestConstants.GlobalAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_PostByIdUrl(postId)
		)
			.WithSessionToken(globalToken)
			.WithTenantId(globalId);
		request.Content = JsonContent.Create(new {
			body = "hijack",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturn403WithoutEditPermissionOnUpdate() {
		var postId = await _CreatePostAsAcmeAdminAsync("edit perm");
		var acmeId = await _GetAcmeIdAsync();
		var userToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_PostByIdUrl(postId)
		)
			.WithSessionToken(userToken)
			.WithTenantId(acmeId);
		request.Content = JsonContent.Create(new {
			body = "try edit",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturn400ForMalformedIdOnUpdate() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_PostByIdUrl("not-a-guid")
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "x",
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	// ── Delete ─────────────────────────────────────────────────────────

	[Fact]
	public async Task
	ItShouldDeleteAPostAndHideItOnGet() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		var postId =
			await _CreatePostViaApiAsync(tenantId, token, "to delete");

		using var deleteReq = new HttpRequestMessage(
			HttpMethod.Delete,
			_PostByIdUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var deleteResp = await _Http.SendAsync(deleteReq);
		deleteResp.StatusCode.Should().Be(HttpStatusCode.OK);

		using var getReq =
			new HttpRequestMessage(HttpMethod.Get, _PostByIdUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);

		using var getResp = await _Http.SendAsync(getReq);
		getResp.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturn404WhenDeletingOtherTenantsPost() {
		var (acmeId, acmeToken) = await _LoginAsAcmeAdminAsync();
		var postId = await _CreatePostViaApiAsync(
			acmeId, acmeToken, "acme delete"
		);
		var globalId =
			await _GetTenantIdByNameAsync(SeedConstants.Tenants.GlobalName);
		var globalToken = await _AuthClient.LoginAsync(
			TestConstants.GlobalAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_PostByIdUrl(postId)
		)
			.WithSessionToken(globalToken)
			.WithTenantId(globalId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturn403WithoutDeletePermissionOnDelete() {
		var postId = await _CreatePostAsAcmeAdminAsync("delete perm");
		var acmeId = await _GetAcmeIdAsync();
		var userToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_PostByIdUrl(postId)
		)
			.WithSessionToken(userToken)
			.WithTenantId(acmeId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturn400ForMalformedIdOnDelete() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_PostByIdUrl("not-a-guid")
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	// ── helpers ────────────────────────────────────────────────────────

	private async Task<(Guid TenantId, string Token)>
	_LoginAsAcmeAdminAsync() {
		var tenantId = await _GetAcmeIdAsync();
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Guid> _GetAcmeIdAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	// Creates a bare Acme tenant member with NO profiles at all. Round 2 granted
	// the seeded AcmeUserEmail member publishing permissions through the
	// demo-publishing-acme profile, so permission-denial pins must not lean on
	// that member's (now non-empty) derived permission set.
	private async Task<(Guid TenantId, string Email)> _CreateBareAcmeMemberAsync() {
		var acmeId = await _GetAcmeIdAsync();
		var email = $"posts-crud-{Guid.NewGuid():N}@example.com";

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			IsVerified = true,
			Status = UserStatus.Active,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(
			user.GetRequiredId(), acmeId, AccountLevel.User
		);
		account.ValidateAccountType();
		db.UserAccount.Add(account);
		await db.SaveChangesAsync();

		return (acmeId, email);
	}

	private async Task<Guid> _GetTenantIdByNameAsync(string name) {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			staffToken,
			name
		);
	}

	private async Task<string> _CreatePostViaApiAsync(
		Guid tenantId,
		string token,
		string body
	) {
		using var request = new HttpRequestMessage(HttpMethod.Post, _PostsUrl)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body,
		});

		using var response = await _Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var payload =
			await response.Content.ReadFromJsonAsync<PostCreated>();
		if (payload is null) {
			throw new InvalidOperationException("Create post returned null");
		}

		return payload.Id.ToString();
	}

	private async Task<string> _CreatePostViaApiAsyncWithProjectAsync(
		Guid tenantId,
		string token,
		string body,
		Guid projectId
	) {
		using var request = new HttpRequestMessage(HttpMethod.Post, _PostsUrl)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body,
			projectId = projectId.ToString(),
		});

		using var response = await _Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var payload =
			await response.Content.ReadFromJsonAsync<PostCreated>();
		if (payload is null) {
			throw new InvalidOperationException("Create post returned null");
		}

		return payload.Id.ToString();
	}

	private async Task<string> _CreatePostAsAcmeAdminAsync(string body) {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		return await _CreatePostViaApiAsync(tenantId, token, body);
	}

	private async Task<Guid> _CreateDeletedProjectForTenantAsync(
		Guid tenantId
	) {
		var projectId = await _CreateProjectForTenantAsync(tenantId);
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var project = await db.Project.FirstAsync(p => p.Id == projectId);
		project.IsDeleted = true;
		project.DeletedAt = DateTime.UtcNow;
		await db.SaveChangesAsync();
		return projectId;
	}

	private async Task<Guid> _CreateProjectForTenantAsync(Guid tenantId) {
		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var project = new PublyApp.Api.Modules.Projects.Entities.Project {
			TenantId = tenantId,
			Name = "Spec Project " + Guid.NewGuid().ToString("N")[..8],
			Status = PublyApp.Api.Modules.Projects.Entities.ProjectStatus
				.Active,
		};
		_ = await db.Project.AddAsync(project);
		await db.SaveChangesAsync();
		return project.GetRequiredId();
	}

	private sealed record FindPostsPayload {
		public List<PostListPayload> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record PostListPayload {
		public Guid Id { get; init; }
		public Guid? ProjectId { get; init; }
		public string Status { get; init; } = string.Empty;
		public string BodyPreview { get; init; } = string.Empty;
		public Guid CreatedByUserId { get; init; }
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
