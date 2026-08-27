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
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);
		var postIdGuid = Guid.Parse(postId);

		// Baseline the blobs already carrying a reference in this SHARED db, so
		// the leak assertion scopes to blobs THIS storm creates (not leftovers
		// from sibling tests in the same class).
		List<string> baselineReferencedPaths;
		await using (var baselineScope =
			_fixture.Factory.Services.CreateAsyncScope()) {
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
				AttachImageUrl(postId)
			)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			request.Content =
				BuildFileContent(PngBytes(width: 8 + i, height: 8));
			requests.Add(request);
			tasks.Add(_http.SendAsync(request));
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
			_fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			// (a) exactly one live asset row remains for the post.
			var livePaths = await (
				from a in db.PostMediaAsset.AsNoTracking()
				where a.PostId == postIdGuid && !a.IsDeleted
				select a.RelativePath
			).ToListAsync();
			livePaths.Should().ContainSingle(
				"concurrent attaches to one post must leave exactly one live image"
			);

			var winnerPath = livePaths[0];

			// (b) every blob that is NOT the live image and was created by this
			// storm must have its reference released back to zero. Any entry here
			// is the #1617 (or #1616) leak.
			var leaked = await (
				from u in db.UploadAsset.AsNoTracking()
				where !u.IsDeleted
					&& u.ReferenceCount > 0
					&& u.RelativePath != winnerPath
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
		// (ux_post_media_assets_live_post_id) actually arbitrates between them.
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
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);
		var postIdGuid = Guid.Parse(postId);

		// Baseline referenced blobs so the leak assertion scopes to THIS storm.
		List<string> baselineReferencedPaths;
		await using (var baselineScope =
			_fixture.Factory.Services.CreateAsyncScope()) {
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
				AttachImageUrl(postId)
			)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			request.Content =
				BuildFileContent(PngBytes(width: 8 + i, height: 8));
			requests.Add(request);
			tasks.Add(_http.SendAsync(request));
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
			_fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			// (a) exactly one survivor asset row.
			var livePaths = await (
				from a in db.PostMediaAsset.AsNoTracking()
				where a.PostId == postIdGuid && !a.IsDeleted
				select a.RelativePath
			).ToListAsync();
			livePaths.Should().ContainSingle(
				"concurrent attaches must leave exactly one live image"
			);

			// (b) no storm blob other than the survivor may be left stuck at
			// reference_count > 0 — a stuck reference is the #1617/#1616 leak.
			var leaked = await (
				from u in db.UploadAsset.AsNoTracking()
				where !u.IsDeleted
					&& u.ReferenceCount > 0
					&& u.RelativePath != livePaths[0]
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
	/// Deterministic proof of the #1616 loser contract: the partial unique index
	/// arbiter MUST be provoked, not hoped for. The existing storm test
	/// (<see cref="ItShouldNotLeakReferenceUnderConcurrentPostImageAttach"/>) fires
	/// N concurrent attaches to an empty post and only checks the
	/// <c>post-image-conflict</c> key if a conflict happens to occur. This test
	/// holds the contended row lock in a barrier transaction, waits until both
	/// contenders are provably parked on it, then releases — so the unique index
	/// is guaranteed to arbitrate and the 409+key is a REQUIRED assertion.
	///
	/// The barrier holds a <c>SELECT ... FOR UPDATE</c> on a pre-existing live asset row.
	/// Each contender's <c>AttachAsync</c> hard-deletes that row
	/// (via <c>ForceHardDelete</c>) inside its own <c>SaveChanges</c>, so both transactions
	/// stall on the row lock. When the barrier commits, both proceed to INSERT their new row;
	/// the partial unique index <c>ux_post_media_assets_live_post_id</c> admits exactly one
	/// and rejects the other with a PostgreSQL <c>UniqueViolation</c> on
	/// <c>post_media_assets</c>. The handler catches that, releases the loser's blob reference,
	/// and returns 409 with the <c>post-image-conflict</c> translation key.
	///
	/// The conflict is produced by the database's own unique index — never stubbed, never
	/// raised by the test. The barrier only controls scheduling, not the violation.
	/// </summary>
	[Fact]
	public async Task ItShouldReturnPostImageConflictFromUniqueIndexWhenConcurrentReplaceRaces() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var postId = await CreatePostAsync(tenantId, token);
		var postIdGuid = Guid.Parse(postId);

		// Pre-attach a first image so a live asset row exists for the
		// contenders to race over. Without a pre-existing row there is nothing
		// for the barrier to lock and nothing for the index to arbitrate.
		string seedPath;
		using (var seedRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AttachImageUrl(postId)
		)
			.WithSessionToken(token)
			.WithTenantId(tenantId)) {
			seedRequest.Content =
				BuildFileContent(PngBytes(width: 64, height: 32));
			using var seedResponse = await _http.SendAsync(seedRequest);
			seedResponse.EnsureSuccessStatusCode();
			var seed = await seedResponse.Content
				.ReadFromJsonAsync<PostImageAttached>();
			Assert.NotNull(seed);
			seedPath = seed.Path;
		}

		// --- Barrier setup -------------------------------------------------
		// Hold a SELECT ... FOR UPDATE on the existing live asset row. This
		// blocks both contenders' AttachAsync from hard-deleting it, parking
		// them inside their SaveChanges DELETE step — the exact point where
		// the unique-index INSERT race will fire once the lock releases.
		await using var barrierScope =
			_fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database
			.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"""
			SELECT 1 FROM post_media_assets
			WHERE post_id = {postIdGuid}
			  AND tenant_id = {tenantId}
			  AND is_deleted = false
			FOR UPDATE
			"""
		);
		var barrierPid =
			await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		// --- Fire two concurrent replaces ---------------------------------
		// Distinct dimensions so each contender uploads a distinct blob.
		const int contenderCount = 2;
		var contenderTasks = new List<Task<HttpResponseMessage>>(contenderCount);
		var contenderRequests = new List<HttpRequestMessage>(contenderCount);
		for (var i = 0; i < contenderCount; i++) {
			var request = new HttpRequestMessage(
				HttpMethod.Post,
				AttachImageUrl(postId)
			)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			request.Content = BuildFileContent(
				PngBytes(width: 96 + i, height: 48)
			);
			contenderRequests.Add(request);
			contenderTasks.Add(_http.SendAsync(request));
		}

		// --- Wait until BOTH contenders are parked on the barrier's row lock
		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			contenderCount,
			barrierPid
		);

		// --- Release the barrier; both proceed to INSERT simultaneously ---
		await barrierTx.CommitAsync();

		var responses = await Task.WhenAll(contenderTasks);
		foreach (var request in contenderRequests) {
			request.Dispose();
		}

		// --- Assert the #1616 loser contract: exactly one winner, exactly one loser
		responses.Count(r => r.StatusCode == HttpStatusCode.Created)
			.Should().Be(1, "the unique index admits exactly one live image");
		responses.Count(r => r.StatusCode == HttpStatusCode.Conflict)
			.Should().Be(1, "the loser is rejected by the unique index and gets a 409");

		// The 409 MUST surface the post-image-conflict key — that is the #1616
		// observable contract. This is a REQUIRED assertion, not best-effort:
		// the barrier guarantees the conflict occurs, so the key MUST be present.
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

		// Exactly one live asset row must survive — the winner's. The seed
		// row was hard-deleted by the winner's AttachAsync, and the loser's
		// insert was rejected by the unique index.
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		var livePaths = await (
			from a in db.PostMediaAsset.AsNoTracking()
			where a.PostId == postIdGuid && !a.IsDeleted
			select a.RelativePath
		).ToListAsync();
		livePaths.Should().ContainSingle(
			"concurrent replaces must leave exactly one live image");

		// The winner's blob keeps its reference (>= 1); the loser's blob
		// must have been released back to zero by the handler's catch block.
		var winnerPath = livePaths[0];
		var winnerRefCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == winnerPath && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleAsync();
		winnerRefCount.Should().BeGreaterThanOrEqualTo(
			1, "the winning blob must keep its reference"
		);

		// The seed blob (replaced by the winner) must have been released to 0.
		var seedRefCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where u.RelativePath == seedPath && !u.IsDeleted
			select (int?)u.ReferenceCount
		).SingleOrDefaultAsync();
		seedRefCount.Should().Be(0,
			"the replaced seed blob's reference must be released");

		// The loser's blob (not the winner, not the seed) must also be at 0.
		// We find it as the only other unreferenced blob on disk that is
		// not the seed or the winner.
		var loserRefCount = await (
			from u in db.UploadAsset.AsNoTracking()
			where !u.IsDeleted
				&& u.RelativePath != winnerPath
				&& u.RelativePath != seedPath
			select (int?)u.ReferenceCount
		).FirstOrDefaultAsync();
		loserRefCount.Should().Be(0,
			"the loser must have released its blob reference (#1616)");
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
