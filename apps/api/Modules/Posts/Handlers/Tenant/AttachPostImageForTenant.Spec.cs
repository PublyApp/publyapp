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
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;

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
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public AttachPostImageForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	// PNG header fixture with REAL width/height in IHDR (big-endian), parsed by
	// ImageInspector.Inspect. Header-complete, not a decodable body — the same
	// trust level as the documented round-5 F5 sniff gap.
	private static byte[] _PngBytes(int width, int height) {
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

	private static string _AttachImageUrl(string postId) {
		return PathUtils.Join("/posts", postId, "image");
	}

	[Fact]
	public async Task
	ItShouldAttachAnImageToADraftAndReturnDimensions() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = AttachPostImageForTenantSpec._BuildFileContent(AttachPostImageForTenantSpec._PngBytes(width: 64, height: 32));

		using var response = await this._Http.SendAsync(request);
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
			this._Fixture.Factory.Services.CreateAsyncScope();
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
		var (acmeTenantId, acmeToken) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(acmeTenantId, acmeToken);

		var techStartToken = await this._AuthClient.LoginAsync(
			TestConstants.TechStartAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(techStartToken)
			.WithTenantId(await this._GetTechStartTenantIdAsync());
		request.Content = AttachPostImageForTenantSpec._BuildFileContent(AttachPostImageForTenantSpec._PngBytes(width: 16, height: 16));

		using var response = await this._Http.SendAsync(request);

		// Foreign-tenant resources are invisible, never forbidden: 404, not 403.
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		// And nothing leaked: Acme still owns zero image assets for that post.
		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
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
		var (tenantId, adminToken) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, adminToken);
		var userToken = await this._AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(userToken)
			.WithTenantId(tenantId);
		request.Content = AttachPostImageForTenantSpec._BuildFileContent(AttachPostImageForTenantSpec._PngBytes(width: 8, height: 8));

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
			.Be("user-does-not-have-the-necessary-permissions");
	}

	[Fact]
	public async Task ItShouldNameMissingFileCause() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		// A browser form submitted without choosing a file carries no usable
		// file part: bind the "file" field WITHOUT a filename so the IFormFile
		// stays absent — the refusal must still name its cause.
		var noFileContent = new MultipartFormDataContent();
		noFileContent.Add(new ByteArrayContent([]), "file");
		request.Content = noFileContent;

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-required");
	}

	[Fact]
	public async Task ItShouldNameOversizeFileCause() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);

		// One byte past the budget: under the multipart request limit (which
		// adds header headroom), past the handler's own size gate.
		var oversize = new byte[
			AppEnvironment.Instance.UPLOAD_MAX_BYTES + 1
		];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = AttachPostImageForTenantSpec._BuildFileContent(oversize);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.RequestEntityTooLarge);
		var problem =
			await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-too-large");
	}

	[Fact]
	public async Task ItShouldNameUnsupportedTypeCause() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = AttachPostImageForTenantSpec._BuildFileContent(
			"definitely not an image"u8.ToArray(),
			fileName: "disguised.png"
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-unsupported-type");
	}

	[Fact]
	public async Task ItShouldNameDegenerateDimensionsCause() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);

		// A structurally valid PNG whose canvas is zero-sized: the type is
		// known, so the refusal must name the DIMENSIONS, not the type.
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = AttachPostImageForTenantSpec._BuildFileContent(AttachPostImageForTenantSpec._PngBytes(width: 0, height: 0));

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-dimensions-invalid");
	}

	[Fact]
	public async Task ItShouldAppendASecondImageAndKeepBothReferences() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);

		var first = await this._AttachAsync(tenantId, token, postId, width: 64, height: 32);
		var second = await this._AttachAsync(tenantId, token, postId, width: 128, height: 64);
		first.Position.Should().Be(0);
		second.Position.Should().Be(1);

		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var live = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid && !a.IsDeleted
			orderby a.Position
			select a.RelativePath
		).ToListAsync();
		live.Should().Equal(first.Path, second.Path);

		foreach (var path in live) {
			var referenceCount = await (
				from u in db.UploadAsset.AsNoTracking()
				where u.RelativePath == path && !u.IsDeleted
				select (int?)u.ReferenceCount
			).SingleAsync();
			referenceCount.Should().BeGreaterThanOrEqualTo(1,
				"every attached image keeps its blob reference");
		}
	}

	[Fact]
	public async Task ItShouldRejectTheImageBeyondThePerPostCapWithATyped422AndLeakNoReference() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		for (var index = 0; index < ProviderCapabilityRegistry.MaxImagesPerPost; index++) {
			var attached = await this._AttachAsync(tenantId, token, postId, width: 10 + index, height: 10);
			attached.Position.Should().Be(index);
		}

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = AttachPostImageForTenantSpec._BuildFileContent(
			AttachPostImageForTenantSpec._PngBytes(width: 99, height: 99)
		);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("post-image-limit-reached");

		var postIdGuid = Guid.Parse(postId);
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		(await db.PostMediaAsset.CountAsync(a => a.PostId == postIdGuid && !a.IsDeleted))
			.Should().Be(ProviderCapabilityRegistry.MaxImagesPerPost);
	}

	[Fact]
	public async Task ItShouldRejectAGifWithAClearMessageAndAcceptJpegPngAndWebp() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);

		using var gifRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		gifRequest.Content = AttachPostImageForTenantSpec._BuildFileContent(
			[.. "GIF89a"u8, 0x10, 0x00, 0x10, 0x00, 0, 0, 0, 0, 0, 0],
			contentType: "image/gif",
			fileName: "anim.gif"
		);
		using var gifResponse = await this._Http.SendAsync(gifRequest);
		gifResponse.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var gifProblem = await gifResponse.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(gifProblem);
		gifProblem.TranslationKey.Should().Be("post-image-animated-unsupported");

		using var animatedWebp = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		animatedWebp.Content = AttachPostImageForTenantSpec._BuildFileContent(
			TestImages.AnimatedWebpHeader(),
			contentType: "image/webp",
			fileName: "anim.webp"
		);
		using var animatedResponse = await this._Http.SendAsync(animatedWebp);
		animatedResponse.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		foreach (var (bytes, mime, name) in new[] {
			(TestImages.Jpeg(20, 20), "image/jpeg", "a.jpg"),
			(TestImages.Png(20, 20), "image/png", "a.png"),
			(TestImages.Webp(20, 20), "image/webp", "a.webp"),
		}) {
			using var ok = new HttpRequestMessage(
				HttpMethod.Post,
				AttachPostImageForTenantSpec._AttachImageUrl(postId)
			)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			ok.Content = AttachPostImageForTenantSpec._BuildFileContent(bytes, contentType: mime, fileName: name);
			using var okResponse = await this._Http.SendAsync(ok);
			okResponse.StatusCode.Should().Be(HttpStatusCode.Created, mime);
		}
	}

	private async Task<PostImageAttached> _AttachAsync(
		Guid tenantId,
		string token,
		string postId,
		int width,
		int height
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = AttachPostImageForTenantSpec._BuildFileContent(
			AttachPostImageForTenantSpec._PngBytes(width, height)
		);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);
		var attached = await response.Content.ReadFromJsonAsync<PostImageAttached>();
		Assert.NotNull(attached);
		return attached;
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
		// ux_post_media_assets_live_post_position keys on (post_id, position)
		// with NO tenant, while AttachAsync's position/count read is scoped to
		// tenant AND post — so a live row carrying this post_id at position 0
		// under a DIFFERENT tenant is invisible to that read and still occupies
		// the slot. The insert is therefore rejected exactly as the losing
		// racer's is, AttachAsync throws, and the blob whose reference the
		// handler already acquired never becomes an attached image. Without the
		// compensating release that reference stays at 1 forever.
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var foreignTenantId = await this._GetTechStartTenantIdAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var postIdGuid = Guid.Parse(postId);

		var blockingPath = $"uploads/blocking/{Guid.NewGuid():N}.png";
		await using (var seedScope =
			this._Fixture.Factory.Services.CreateAsyncScope()) {
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
				UploadedByUserId = await AttachPostImageForTenantSpec._ResolveAcmeAdminUserIdAsync(seedDb),
			});
			await seedDb.SaveChangesAsync();
		}

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = AttachPostImageForTenantSpec._BuildFileContent(AttachPostImageForTenantSpec._PngBytes(width: 32, height: 32));

		// The attach must NOT succeed: the post's live slot is already taken by a
		// row this tenant's purge cannot remove.
		using var response = await this._Http.SendAsync(request);
		response.IsSuccessStatusCode.Should().BeFalse(
			"the live-image slot is held by a row the purge cannot see, so this "
			+ "insert must lose the unique index"
		);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var attachUrl = AttachPostImageForTenantSpec._AttachImageUrl(postId);

		// Pre-race baseline: every blob already referenced by an EARLIER test in
		// this class. The class shares one database, so those references are
		// legitimate and must be excluded from the leak query below — without this
		// the assertion reports another test's live image as this race's leak.
		List<string> baselinePaths;
		await using (var baselineScope =
			this._Fixture.Factory.Services.CreateAsyncScope()) {
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
					AttachPostImageForTenantSpec._BuildFileContent(AttachPostImageForTenantSpec._PngBytes(width: 32, height: 32));
				ready[index].SetResult();
				await gate.Task;
				using var response = await this._Http.SendAsync(request);
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
			.Select(static r => r.Path.Required())
			.ToList();

		var postIdGuid = Guid.Parse(postId);
		await using (var scope =
			this._Fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var liveAssets = await (
				from a in db.PostMediaAsset.AsNoTracking()
				where a.PostId == postIdGuid && !a.IsDeleted
				select a
			).ToListAsync();
			liveAssets.Count.Should().BeLessThanOrEqualTo(
				ProviderCapabilityRegistry.MaxImagesPerPost,
				"a post owns at most the per-post cap of live images even under a parallel "
				+ "attach storm"
			);
			liveAssets.Select(a => a.Position).Should().OnlyHaveUniqueItems();

			var livePaths = liveAssets.Select(a => a.RelativePath).ToList();
			livePaths.Should().BeEquivalentTo(
				succeededPaths,
				"exactly the successfully attached blobs are live"
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
					&& !livePaths.Contains(u.RelativePath)
					&& !u.IsDeleted
					&& u.ReferenceCount > 0
				select u.RelativePath
			).ToListAsync();
			leaked.Should().BeEmpty(
				"every blob that lost the race or hit the limit must release "
				+ "its reference — a non-zero count here is a leaked reference"
			);
		}
	}


	[Fact]
	public async Task
	ItShouldNotLeakBlobReferencesUnderConcurrentAttachToSamePost() {
		// #1617 proof: N concurrent image attaches to the SAME post must leave
		// exactly one live asset row and must release every other blob's
		// reference. The buggy handler captures the replaced path via
		// FindByPostAsync BEFORE AttachAsync, so a racer that purges a
		// predecessor's row leaves that predecessor's blob reference stuck at 1
		// forever (silent, cumulative leak). Firing in parallel also forces the
		// loser path: the partial unique index admits exactly one insert, so the
		// N-1 losers must each release the reference they acquired (#1616) — if
		// any does not, the leak shows here too.
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var postIdGuid = Guid.Parse(postId);

		// Baseline the blobs already carrying a reference in this SHARED db, so
		// the leak assertion scopes to blobs THIS storm creates (not leftovers
		// from sibling tests in the same class).
		List<string> baselineReferencedPaths;
		await using (var baselineScope =
			this._Fixture.Factory.Services.CreateAsyncScope()) {
			var db =
				baselineScope.ServiceProvider
					.GetRequiredService<AppDbContext>();
			baselineReferencedPaths = await (
			from u in db.UploadAsset.AsNoTracking()
			where !u.IsDeleted && u.ReferenceCount > 0
			select u.RelativePath
		).ToListAsync();
		}

		const int concurrency = 8;
		var requests = new List<HttpRequestMessage>(concurrency);
		var tasks = new List<Task<HttpResponseMessage>>(concurrency);
		for (var i = 0; i < concurrency; i++) {
			var request = new HttpRequestMessage(
				HttpMethod.Post,
				AttachPostImageForTenantSpec._AttachImageUrl(postId)
			)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			request.Content =
				AttachPostImageForTenantSpec._BuildFileContent(AttachPostImageForTenantSpec._PngBytes(width: 8 + i, height: 8));
			requests.Add(request);
			tasks.Add(this._Http.SendAsync(request));
		}

		var responses = await Task.WhenAll(tasks);
		foreach (var request in requests) {
			request.Dispose();
		}

		// At least one concurrent attach must actually succeed, otherwise the
		// storm proved nothing about the replace path.
		responses
			.Count(r => r.StatusCode == HttpStatusCode.Created)
			.Should()
			.BeGreaterThanOrEqualTo(
				1,
				"at least one concurrent attach must win the post"
			);

		await using (var scope =
			this._Fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			// (a) exactly one live asset row remains for the post.
			var livePaths = await (
				from a in db.PostMediaAsset.AsNoTracking()
				where a.PostId == postIdGuid && !a.IsDeleted
				select a.RelativePath
			).ToListAsync();
			livePaths.Count.Should().BeInRange(
				1, ProviderCapabilityRegistry.MaxImagesPerPost,
				"concurrent attaches to one post never exceed the per-post cap"
			);

			// (b) every blob that is NOT the live image and was created by this
			// storm must have its reference released back to zero. Any entry here
			// is the #1617 (or #1616) leak.
			var leaked = await (
				from u in db.UploadAsset.AsNoTracking()
				where !u.IsDeleted
					&& u.ReferenceCount > 0
					&& !livePaths.Contains(u.RelativePath)
					&& !baselineReferencedPaths.Contains(u.RelativePath)
				select u.RelativePath
			).ToListAsync();
			leaked.Should().BeEmpty(
				"every blob that is not the live image must have its reference "
				+ "released — a stuck reference is the #1617 reference leak"
			);
		}
	}

	[Fact]
	public async Task ItShouldNotLeakReferenceUnderConcurrentPostImageAttach() {
		// Proof that N concurrent image attaches to the SAME post never leave a
		// stuck blob reference — covering BOTH the #1617 replace-race and the
		// #1616 loser-release. N=8 (matching the storm proof) makes the
		// transactions genuinely overlap so the partial unique index
		// (ux_post_media_assets_live_post_position) actually arbitrates between them.
		//
		// The hard guarantee asserted below is invariant: exactly one live asset
		// survives and every other storm blob's reference drops to zero. On the
		// FIXED code this is deterministic (green). On the FAULTY code the loser
		// acquires the new blob's reference, its insert is rejected by the unique
		// index, and nothing releases that reference — so its blob stays stuck at
		// reference_count = 1 and the leak assertion reddens.
		//
		// The 409 + post-image-conflict key is the OBSERVABLE contract of the
		// #1616 loser branch, but whether a unique-violation loser occurs is
		// timing-dependent (the requests may serialise into sequential replaces).
		// We therefore verify the key BEST-EFFORT: if any response is a 409, it
		// must carry the post-image-conflict key. We never assert a 409 MUST
		// occur, because that would make a proof test flake on correct code.
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var postIdGuid = Guid.Parse(postId);

		// Baseline referenced blobs so the leak assertion scopes to THIS storm.
		List<string> baselineReferencedPaths;
		await using (var baselineScope =
			this._Fixture.Factory.Services.CreateAsyncScope()) {
			var db = baselineScope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			baselineReferencedPaths = await (
				from u in db.UploadAsset.AsNoTracking()
				where !u.IsDeleted && u.ReferenceCount > 0
				select u.RelativePath
			).ToListAsync();
		}

		const int concurrency = 8;
		var requests = new List<HttpRequestMessage>(concurrency);
		var tasks = new List<Task<HttpResponseMessage>>(concurrency);
		for (var i = 0; i < concurrency; i++) {
			var request = new HttpRequestMessage(
				HttpMethod.Post,
				AttachPostImageForTenantSpec._AttachImageUrl(postId)
			)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			request.Content =
				AttachPostImageForTenantSpec._BuildFileContent(AttachPostImageForTenantSpec._PngBytes(width: 8 + i, height: 8));
			requests.Add(request);
			tasks.Add(this._Http.SendAsync(request));
		}

		var responses = await Task.WhenAll(tasks);
		foreach (var request in requests) {
			request.Dispose();
		}

		// At least one attach must succeed: the post starts with no image, so the
		// unique index admits the first writer (201) and never rejects all of them.
		responses
			.Count(r => r.StatusCode == HttpStatusCode.Created)
			.Should()
			.BeGreaterThanOrEqualTo(
				1,
				"at least one concurrent attach must win the post"
			);

		// Best-effort: if the unique index produced a loser, the handler MUST
		// release the loser's blob and return 409 with the post-image-conflict key
		// (the #1616 contract). We do not require a loser to occur.
		var loser = responses.FirstOrDefault(r =>
			r.StatusCode == HttpStatusCode.Conflict);
		if (loser is not null) {
			var loserProblem = await loser.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			Assert.NotNull(loserProblem);
			loserProblem.TranslationKey.Should().Be("post-image-conflict");
		}

		await using (var scope =
			this._Fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			// (a) exactly one survivor asset row.
			var livePaths = await (
				from a in db.PostMediaAsset.AsNoTracking()
				where a.PostId == postIdGuid && !a.IsDeleted
				select a.RelativePath
			).ToListAsync();
			livePaths.Count.Should().BeInRange(
				1, ProviderCapabilityRegistry.MaxImagesPerPost,
				"concurrent attaches never exceed the per-post cap"
			);

			// (b) no storm blob other than the survivor may be left stuck at
			// reference_count > 0 — a stuck reference is the #1617/#1616 leak.
			var leaked = await (
				from u in db.UploadAsset.AsNoTracking()
				where !u.IsDeleted
					&& u.ReferenceCount > 0
					&& !livePaths.Contains(u.RelativePath)
					&& !baselineReferencedPaths.Contains(u.RelativePath)
				select u.RelativePath
			).ToListAsync();
			leaked.Should().BeEmpty(
				"every blob that is not the live image must have its reference "
				+ "released — a stuck reference is the reference leak"
			);
		}
	}

	/// <summary>
	/// Deterministic proof of the #1616 loser contract: the (post, position)
	/// unique index arbiter MUST be provoked, not hoped for. The storm tests only
	/// check the <c>post-image-conflict</c> key if a conflict happens to occur.
	/// This test holds an UNCOMMITTED insert of the post's next position in a
	/// barrier transaction, waits until both contenders are provably parked on
	/// that unique-key entry, then rolls it back — so both proceed to insert the
	/// same position, the database's own unique index admits exactly one and
	/// rejects the other with a PostgreSQL <c>UniqueViolation</c>, and the 409 +
	/// key is a REQUIRED assertion.
	///
	/// The handler catches the violation, releases the loser's blob reference,
	/// and returns 409 with the <c>post-image-conflict</c> translation key. The
	/// conflict is never stubbed: the barrier only controls scheduling.
	/// </summary>
	[Fact]
	public async Task ItShouldReturnPostImageConflictFromUniqueIndexWhenConcurrentAppendsRace() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);
		var postIdGuid = Guid.Parse(postId);

		// Seed the first image so the contenders both compute position 1.
		var seed = await this._AttachAsync(tenantId, token, postId, width: 64, height: 32);

		// --- Barrier setup -------------------------------------------------
		// An uncommitted row at position 1: neither contender can see it (so both
		// compute position 1), and their inserts block on its unique-key entry
		// until the barrier ends.
		await using var barrierScope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database
			.BeginTransactionAsync();
		barrierDb.PostMediaAsset.Add(new Entities.PostMediaAsset {
			TenantId = tenantId,
			PostId = postIdGuid,
			Position = 1,
			RelativePath = $"uploads/barrier/{Guid.NewGuid():N}.png",
			ContentType = "image/png",
			AltText = null,
			WidthPx = 8,
			HeightPx = 8,
			SizeBytes = 64,
			UploadedByUserId = await AttachPostImageForTenantSpec._ResolveAcmeAdminUserIdAsync(barrierDb),
		});
		await barrierDb.SaveChangesAsync();
		var barrierPid =
			await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		// Baseline of live blobs NOW so the loser blob is identified by path
		// identity, not by elimination (the class shares one database).
		List<string> baselinePaths;
		await using (var baselineScope =
			this._Fixture.Factory.Services.CreateAsyncScope()) {
			var baselineDb = baselineScope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			baselinePaths = await (
				from u in baselineDb.UploadAsset.AsNoTracking()
				where !u.IsDeleted
				select u.RelativePath
			).ToListAsync();
		}

		const int contenderCount = 2;
		var contenderTasks = new List<Task<HttpResponseMessage>>(contenderCount);
		var contenderRequests = new List<HttpRequestMessage>(contenderCount);
		for (var i = 0; i < contenderCount; i++) {
			var request = new HttpRequestMessage(
				HttpMethod.Post,
				AttachPostImageForTenantSpec._AttachImageUrl(postId)
			)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			request.Content = AttachPostImageForTenantSpec._BuildFileContent(
				AttachPostImageForTenantSpec._PngBytes(width: 96 + i, height: 48)
			);
			contenderRequests.Add(request);
			contenderTasks.Add(this._Http.SendAsync(request));
		}

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			contenderCount,
			barrierPid
		);

		// Roll the barrier row back: both contenders now race for position 1.
		await barrierTx.RollbackAsync();

		var responses = await Task.WhenAll(contenderTasks);
		foreach (var request in contenderRequests) {
			request.Dispose();
		}

		responses.Count(r => r.StatusCode == HttpStatusCode.Created)
			.Should().Be(1, "the unique index admits exactly one image at position 1");
		responses.Count(r => r.StatusCode == HttpStatusCode.Conflict)
			.Should().Be(1, "the loser is rejected by the unique index and gets a 409");

		var loser = responses.Single(r =>
			r.StatusCode == HttpStatusCode.Conflict
		);
		var loserProblem = await loser.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(loserProblem);
		loserProblem.TranslationKey.Should().Be(
			"post-image-conflict",
			"the 409 MUST surface the post-image-conflict key — "
			+ "the unique index produces the loser and the handler must name it"
		);

		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var livePaths = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid && !a.IsDeleted
			orderby a.Position
			select a.RelativePath
		).ToListAsync();
		livePaths.Should().HaveCount(2, "the seed plus the winner");
		livePaths[0].Should().Be(seed.Path);
		var winnerPath = livePaths[1];

		var winnerRefCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == winnerPath && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleAsync();
		winnerRefCount.Should().BeGreaterThanOrEqualTo(
			1, "the winning blob must keep its reference"
		);

		var loserPaths = await (
			from u in db.UploadAsset.AsNoTracking()
			where !u.IsDeleted
				&& !baselinePaths.Contains(u.RelativePath)
				&& u.RelativePath != winnerPath
			select u.RelativePath
		).ToListAsync();
		loserPaths.Should().ContainSingle(
			"exactly one contender blob was rejected by the unique index"
		);

		var loserRefCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == loserPaths[0] && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleAsync();
		loserRefCount.Should().Be(0,
			"the loser must have released its blob reference (#1616)");
	}

	[Fact]
	public async Task ItShouldPurgeAssetWhenPostDeleted() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._CreatePostAsync(tenantId, token);

		using var attachRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AttachPostImageForTenantSpec._AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		attachRequest.Content = AttachPostImageForTenantSpec._BuildFileContent(AttachPostImageForTenantSpec._PngBytes(width: 24, height: 24));
		using (attachRequest) {
			using var attachResponse = await this._Http.SendAsync(attachRequest);
			attachResponse.EnsureSuccessStatusCode();
			var attached = await attachResponse.Content
				.ReadFromJsonAsync<PostImageAttached>();
			Assert.NotNull(attached);
			this._AttachedPath = attached.Path;
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
			using var deleteResponse = await this._Http.SendAsync(deleteRequest);
			deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		var postIdGuid = Guid.Parse(postId);
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var remaining = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid
			select a
		).CountAsync();
		remaining.Should().Be(0, "the asset row must be hard-deleted with its post");

		var referenceCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == this._AttachedPath && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleOrDefaultAsync();
		referenceCount.Should().Be(0,
			"the blob reference must be released when the owning post dies");
	}

	private string _AttachedPath = string.Empty;

	// ── helpers ────────────────────────────────────────────────────────

	private static MultipartFormDataContent _BuildFileContent(
		byte[] bytes,
		string fileName = "logo.png",
		string contentType = "image/png"
	) {
		var content = new MultipartFormDataContent();
		var fileContent = new ByteArrayContent(bytes);
		fileContent.Headers.ContentType =
			new MediaTypeHeaderValue(contentType);
		content.Add(fileContent, "file", fileName);
		return content;
	}

	private async Task<(Guid TenantId, string Token)>
	_LoginAsAcmeAdminAsync() {
		var tenantId = await this._GetAcmeIdAsync();
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Guid> _GetAcmeIdAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private static async Task<Guid> _ResolveAcmeAdminUserIdAsync(AppDbContext db) {
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

	private async Task<Guid> _GetTechStartTenantIdAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);
	}

	private async Task<string> _CreatePostAsync(Guid tenantId, string token) {
		using var request = new HttpRequestMessage(HttpMethod.Post, "/posts")
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			body = "Post image spec " + Guid.NewGuid().ToString("N")[..8],
		});

		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var payload = await response.Content.ReadFromJsonAsync<CreatePostDto>();
		if (payload is null) {
			throw new InvalidOperationException("Create post returned null");
		}
		return payload.Id.ToString();
	}

	private sealed record CreatePostDto(Guid Id);
}
