using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Integration proofs for the per-post image attach/remove endpoints (#639).
/// Fixtures are hand-built PNG/GIF headers carrying REAL dimensions, parsed by
/// ImageInspector the same way the production handler will store them. The
/// foreign-tenant case is the exact isolation point later targeted by the
/// adverse-mutation proof (removing the TenantId filter must turn it red).
/// </summary>
public sealed class AttachPostImageForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public AttachPostImageForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	// PNG header fixture with REAL width/height in IHDR (big-endian), parsed by
	// ImageInspector.Inspect. Header-complete, not a decodable body — the same
	// trust level as the documented round-5 F5 sniff gap.
	private static byte[] PngBytes(int width, int height) {
		var bytes = new List<byte> {
			0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
			0x00, 0x00, 0x00, 0x0D,
			(byte)'I', (byte)'H', (byte)'D', (byte)'R',
		};
		bytes.AddRange(BitConverter.GetBytes(
			System.Buffers.Binary.BinaryPrimitives.ReverseEndianness(width)
		));
		bytes.AddRange(BitConverter.GetBytes(
			System.Buffers.Binary.BinaryPrimitives.ReverseEndianness(height)
		));
		return [.. bytes];
	}

	private static string AttachImageUrl(string postId) {
		return PathUtils.Join("/posts", postId, "image");
	}

	[Fact]
	public async Task
	ItShouldAttachAnImageToADraftAndReturnDimensions() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = BuildFileContent(PngBytes(width: 64, height: 32));

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload =
			await response.Content.ReadFromJsonAsync<PostImageAttached>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.WidthPx.Should().Be(64);
		payload.HeightPx.Should().Be(32);
		payload.Url.Should().StartWith("/files/");
		payload.Url.Should().Be($"/files/{payload.Path}");
		payload.AltText.Should().BeNull();

		// Exactly one live asset row owns the post, and the underlying blob's
		// reference was acquired (reference_count >= 1) per #807 F5 discipline.
		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var asset = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid && !a.IsDeleted
			select a
		).SingleAsync();
		asset.TenantId.Should().Be(tenantId);
		asset.ContentType.Should().Be("image/png");
		asset.WidthPx.Should().Be(64);
		asset.HeightPx.Should().Be(32);
		asset.SizeBytes.Should().BeGreaterThan(0);
		asset.RelativePath.Should().Be(payload.Path);

		var referenced = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == payload.Path && !u.IsDeleted
			select u.ReferenceCount
		).SingleAsync();
		referenced.Should().BeGreaterThanOrEqualTo(1);
	}

	[Fact]
	public async Task
	ItShouldHideForeignTenantPostFromAttach() {
		var (acmeTenantId, acmeToken) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(acmeTenantId, acmeToken);

		var techStartToken = await _authClient.LoginAsync(
			TestConstants.TechStartAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(techStartToken)
			.WithTenantId(await GetTechStartTenantIdAsync());
		request.Content = BuildFileContent(PngBytes(width: 16, height: 16));

		using var response = await _http.SendAsync(request);

		// Foreign-tenant resources are invisible, never forbidden: 404, not 403.
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		// And nothing leaked: Acme still owns zero image assets for that post.
		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var leaked = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid
			select a
		).AnyAsync();
		leaked.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldRefuseAttachWithoutPermission() {
		var (tenantId, adminToken) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, adminToken);
		var userToken = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(userToken)
			.WithTenantId(tenantId);
		request.Content = BuildFileContent(PngBytes(width: 8, height: 8));

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
			.Be("user-does-not-have-the-necessary-permissions");
	}

	[Fact]
	public async Task ItShouldNameMissingFileCause() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		// A browser form submitted without choosing a file carries no usable
		// file part: bind the "file" field WITHOUT a filename so the IFormFile
		// stays absent — the refusal must still name its cause.
		var noFileContent = new MultipartFormDataContent();
		noFileContent.Add(new ByteArrayContent([]), "file");
		request.Content = noFileContent;

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-required");
	}

	[Fact]
	public async Task ItShouldNameOversizeFileCause() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		// One byte past the budget: under the multipart request limit (which
		// adds header headroom), past the handler's own size gate.
		var oversize = new byte[
			AppEnvironment.Instance.UPLOAD_MAX_BYTES + 1
		];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = BuildFileContent(oversize);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.RequestEntityTooLarge);
		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-too-large");
	}

	[Fact]
	public async Task ItShouldNameUnsupportedTypeCause() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = BuildFileContent(
			"definitely not an image"u8.ToArray(),
			fileName: "disguised.png"
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-unsupported-type");
	}

	[Fact]
	public async Task ItShouldNameDegenerateDimensionsCause() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		// A structurally valid PNG whose canvas is zero-sized: the type is
		// known, so the refusal must name the DIMENSIONS, not the type.
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = BuildFileContent(PngBytes(width: 0, height: 0));

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-dimensions-invalid");
	}

	[Fact]
	public async Task ItShouldReplaceExistingImageWithoutOrphan() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		using var firstRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		firstRequest.Content =
			BuildFileContent(PngBytes(width: 64, height: 32));
		string firstPath;
		using (firstRequest) {
			using var firstResponse = await _http.SendAsync(firstRequest);
			firstResponse.EnsureSuccessStatusCode();
			var first = await firstResponse.Content
				.ReadFromJsonAsync<PostImageAttached>();
			Assert.NotNull(first);
			firstPath = first.Path;
		}

		using var secondRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		secondRequest.Content =
			BuildFileContent(PngBytes(width: 128, height: 64));
		string secondPath;
		using (secondRequest) {
			using var secondResponse = await _http.SendAsync(secondRequest);
			secondResponse.EnsureSuccessStatusCode();
			var second = await secondResponse.Content
				.ReadFromJsonAsync<PostImageAttached>();
			Assert.NotNull(second);
			secondPath = second.Path;
		}

		// Exactly ONE live asset row remains — the replacement — pointing at
		// the new blob; the old blob's reference dropped back to zero.
		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var livePaths = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid && !a.IsDeleted
			select a.RelativePath
		).ToListAsync();
		livePaths.Should().BeEquivalentTo([secondPath]);

		var oldReferenceCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == firstPath && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleOrDefaultAsync();
		oldReferenceCount.Should().Be(0,
			"a replaced image must release its blob reference — no orphans");

		var newReferenceCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == secondPath && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleAsync();
		newReferenceCount.Should().BeGreaterThanOrEqualTo(1);
	}

	[Fact]
	public async Task
	ItShouldReleaseTheNewBlobReferenceWhenTheAttachWriteIsRejected() {
		// Deterministic counterpart to the parallel storm above, and the proof
		// that actually pins the #1616 loser-release fix.
		//
		// The storm only reaches this window when the requests genuinely collide,
		// which depends on thread-pool timing: measured against a mutation that
		// deletes the compensating release, it failed 5/5 runs alone but 0/4 runs
		// inside this class, where the shared fixture shifts the timing. A race
		// the proof detects only sometimes cannot guard a regression, so this test
		// removes the timing entirely.
		//
		// It recreates the loser's exact DATABASE situation: a live asset row that
		// the handler's purge cannot see, yet the unique index still enforces.
		// ux_post_media_assets_live_post_id keys on post_id ALONE, while
		// AttachAsync's purge query is scoped to tenant AND post — so a live row
		// carrying this post_id under a DIFFERENT tenant is invisible to the purge
		// and still occupies the post's one live slot. The insert is therefore
		// rejected exactly as the losing racer's is (whose purge ran before the
		// winner's row existed), AttachAsync throws, and the blob whose reference
		// the handler already acquired never becomes the live image. Without the
		// compensating release that reference stays at 1 forever.
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var foreignTenantId = await GetTechStartTenantIdAsync();
		var postId = await CreatePostAsync(tenantId, token);
		var postIdGuid = Guid.Parse(postId);

		var blockingPath = $"uploads/blocking/{Guid.NewGuid():N}.png";
		await using (var seedScope =
			_fixture.Factory.Services.CreateAsyncScope()) {
			var seedDb = seedScope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			seedDb.PostMediaAsset.Add(new Entities.PostMediaAsset {
				TenantId = foreignTenantId,
				PostId = postIdGuid,
				RelativePath = blockingPath,
				ContentType = "image/png",
				AltText = null,
				WidthPx = 8,
				HeightPx = 8,
				SizeBytes = 64,
				UploadedByUserId = await ResolveAcmeAdminUserIdAsync(seedDb),
			});
			await seedDb.SaveChangesAsync();
		}

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = BuildFileContent(PngBytes(width: 32, height: 32));

		// The attach must NOT succeed: the post's live slot is already taken by a
		// row this tenant's purge cannot remove.
		using var response = await _http.SendAsync(request);
		response.IsSuccessStatusCode.Should().BeFalse(
			"the live-image slot is held by a row the purge cannot see, so this "
			+ "insert must lose the unique index"
		);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// The blocking row still owns the slot — the failed attach changed nothing.
		var livePaths = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid && !a.IsDeleted
			select a.RelativePath
		).ToListAsync();
		livePaths.Should().BeEquivalentTo([blockingPath]);

		// The rejected attach's own blob must hold NO reference: it never became
		// the live image, so the reference acquired for it had to be released.
		// A blob referenced by no live asset row IS the #1616 leak.
		var livePathsAllPosts = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where !a.IsDeleted
			select a.RelativePath
		).ToListAsync();
		var leaked = await (
			from u in db.UploadAsset.AsNoTracking()
			where !u.IsDeleted
				&& u.ReferenceCount > 0
				&& !livePathsAllPosts.Contains(u.RelativePath)
			select u.RelativePath
		).ToListAsync();
		leaked.Should().BeEmpty(
			"a rejected attach must release the reference it acquired for its "
			+ "own blob — a blob referenced by no live asset row is the #1616 leak"
		);
	}

	[Fact]
	public async Task
	ItShouldNotOrphanBlobReferencesUnderConcurrentAttachToSamePost() {
		// Race proof for the #807 F5 reference discipline on
		// AttachPostImageForTenant. N image attaches fire at the SAME post truly
		// in parallel. Exactly one live asset row must survive (pointing at a real
		// uploaded blob) and every OTHER blob this race uploaded must return to a
		// zero reference count. Two distinct windows leak here, and this test
		// covers both:
		//   1. The replaced path captured in the HANDLER before the service
		//      commits (the shape #1461 introduced): a racing attach can
		//      hard-delete a row whose path the first handler never observed, so
		//      that blob's reference is acquired and never released. Closed by
		//      capturing the replaced paths atomically inside AttachAsync.
		//   2. The LOSER of the race: ux_post_media_assets_live_post_id rejects
		//      its insert, AttachAsync throws, its blob never becomes the live
		//      image, and nothing releases the reference it already acquired
		//      (#1616). Closed by the handler's compensating release. The loser
		//      returns no path at all, which is why the leak query below is scoped
		//      by a pre-race baseline rather than by the succeeded paths.
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);
		var attachUrl = AttachImageUrl(postId);

		// Pre-race baseline: every blob already referenced by an EARLIER test in
		// this class. The class shares one database, so those references are
		// legitimate and must be excluded from the leak query below — without this
		// the assertion reports another test's live image as this race's leak.
		List<string> baselinePaths;
		await using (var baselineScope =
			_fixture.Factory.Services.CreateAsyncScope()) {
			var baselineDb = baselineScope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			baselinePaths = await (
				from u in baselineDb.UploadAsset.AsNoTracking()
				where !u.IsDeleted && u.ReferenceCount > 0
				select u.RelativePath
			).ToListAsync();
		}

		const int Attempts = 12;
		// A release barrier, not just Task.Run: thread-pool scheduling staggers
		// bare Task.Run starts enough that the attaches often SERIALISE, each
		// cleanly replacing the previous one, so no racer ever loses the unique
		// index and the loser-release window is never entered. Every task builds
		// its request first, reports ready, then blocks on one gate that opens
		// only once all of them are ready — that is what makes the collision the
		// test claims to exercise actually happen.
		var gate = new TaskCompletionSource(
			TaskCreationOptions.RunContinuationsAsynchronously
		);
		var ready = new TaskCompletionSource[Attempts];
		for (var index = 0; index < Attempts; index++) {
			ready[index] = new TaskCompletionSource(
				TaskCreationOptions.RunContinuationsAsynchronously
			);
		}

		var attachTasks = Enumerable.Range(0, Attempts)
			.Select(index => Task.Run(async () => {
				using var request = new HttpRequestMessage(
					HttpMethod.Post, attachUrl
				)
					.WithSessionToken(token)
					.WithTenantId(tenantId);
				request.Content =
					BuildFileContent(PngBytes(width: 32, height: 32));
				ready[index].SetResult();
				await gate.Task;
				using var response = await _http.SendAsync(request);
				if (!response.IsSuccessStatusCode) {
					return (Succeeded: false, Path: null);
				}
				var payload = await response.Content
					.ReadFromJsonAsync<PostImageAttached>();
				return (Succeeded: true, Path: payload?.Path);
			}))
			.ToArray();

		await Task.WhenAll(ready.Select(static r => r.Task));
		gate.SetResult();

		var results = await Task.WhenAll(attachTasks);
		var succeededPaths = results
			.Where(static r => r.Succeeded && r.Path is not null)
			.Select(static r => r.Path!)
			.ToList();

		var postIdGuid = Guid.Parse(postId);
		await using (var scope =
			_fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var liveAssets = await (
				from a in db.PostMediaAsset.AsNoTracking()
				where a.PostId == postIdGuid && !a.IsDeleted
				select a
			).ToListAsync();
			liveAssets.Should().HaveCount(
				1,
				"a post owns at most one live image even under a parallel "
				+ "attach storm"
			);

			var survivorPath = liveAssets[0].RelativePath;
			succeededPaths.Should().Contain(
				survivorPath,
				"the surviving live asset must be one of the successfully "
				+ "attached blobs"
			);

			// Every blob THIS race uploaded and did not leave live must have its
			// reference released back to zero — a non-zero count is the upload
			// reference leaked by the replace race.
			//
			// Scoped by the pre-race baseline, NOT by succeededPaths: the whole
			// class shares one database, so earlier tests' blobs are legitimately
			// Referenced and an unscoped query reports them as this race's leak
			// (a false red). Scoping to succeededPaths would be the opposite
			// error — it would HIDE the real bug, because the racer whose insert
			// the unique index rejects never returns a path to succeed with, and
			// that loser's orphaned reference is exactly the #1616 leak.
			var leaked = await (
				from u in db.UploadAsset.AsNoTracking()
				where !baselinePaths.Contains(u.RelativePath)
					&& u.RelativePath != survivorPath
					&& !u.IsDeleted
					&& u.ReferenceCount > 0
				select u.RelativePath
			).ToListAsync();
			leaked.Should().BeEmpty(
				"every replaced blob must release its reference — a non-zero "
				+ "count here is the upload reference leaked by the replace race"
			);
		}
	}

	[Fact]
	public async Task ItShouldPurgeAssetWhenPostDeleted() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);

		using var attachRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		attachRequest.Content = BuildFileContent(PngBytes(width: 24, height: 24));
		using (attachRequest) {
			using var attachResponse = await _http.SendAsync(attachRequest);
			attachResponse.EnsureSuccessStatusCode();
			var attached = await attachResponse.Content
				.ReadFromJsonAsync<PostImageAttached>();
			Assert.NotNull(attached);
			attachedPath = attached.Path;
		}

		// Deleting the post must purge the asset row (hard delete, no soft
		// residue) and drop the blob's reference to zero — no orphans.
		using var deleteRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			PathUtils.Join("/posts", postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using (deleteRequest) {
			using var deleteResponse = await _http.SendAsync(deleteRequest);
			deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var remaining = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid
			select a
		).CountAsync();
		remaining.Should().Be(0, "the asset row must be hard-deleted with its post");

		var referenceCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == attachedPath && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleOrDefaultAsync();
		referenceCount.Should().Be(0,
			"the blob reference must be released when the owning post dies");
	}

	private string attachedPath = string.Empty;

	// ── helpers ────────────────────────────────────────────────────────

	private static MultipartFormDataContent BuildFileContent(
		byte[] bytes,
		string fileName = "logo.png"
	) {
		var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(bytes);
		fileContent.Headers.ContentType =
			new MediaTypeHeaderValue("image/png");
		content.Add(fileContent, "file", fileName);
		return content;
	}

	private async Task<(Guid TenantId, string Token)>
	LoginAsAcmeAdminAsync() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Guid> GetAcmeIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private static async Task<Guid> ResolveAcmeAdminUserIdAsync(AppDbContext db) {
		var user = await (
			from u in db.User.AsNoTracking()
			where u.Email == TestConstants.AcmeAdminEmail
			select u
		).FirstOrDefaultAsync();
		if (user is null) {
			throw new InvalidOperationException(
				$"Seeded user {TestConstants.AcmeAdminEmail} not found"
			);
		}
		return user.GetRequiredId();
	}

	private async Task<Guid> GetTechStartTenantIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);
	}

	private async Task<string> CreatePostAsync(Guid tenantId, string token) {
		using var request = new HttpRequestMessage(HttpMethod.Post, "/posts")
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "Post image spec " + Guid.NewGuid().ToString("N")[..8],
		});

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var payload = await response.Content.ReadFromJsonAsync<CreatePostDto>();
		if (payload is null) {
			throw new InvalidOperationException("Create post returned null");
		}
		return payload.Id.ToString();
	}

	private sealed record CreatePostDto(Guid Id);
}
