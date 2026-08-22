using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Posts.Entities;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Posts-specific architecture guard. Discovery-based guards cover Posts
/// implicitly, but none ratchet the conventions this module introduces:
/// the status check constraint, the keyset index, and the tenant-scoping
/// predicate. This guard exists precisely because
/// <c>ProjectExistsForTenantAsync</c> shipped with a missing
/// <c>TenantId == tenantId</c> predicate - the method name and signature
/// promised tenant isolation while the query asked "does this project exist
/// at all?". That bug survived HTTP integration tests because the global
/// tenant query filter compensated at the request boundary. The fix is
/// defense-in-depth (explicit predicate + global filter). The source-scan
/// below is load-bearing: re-introduce the bug (remove
/// <c>project.TenantId == tenantId</c> from <c>ProjectExistsForTenantAsync</c>)
/// and this guard must go red, even when the HTTP specs stay green.
/// </summary>
public sealed class PostArchitectureSpec {
	static PostArchitectureSpec() {
		AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldConfigureCkPostStatusWithExactlyTheEnumValues() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=post_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Post));
		entity.Should().NotBeNull();

		var constraint = entity!
			.GetCheckConstraints()
			.SingleOrDefault(c => c.Name == "CK_Post_Status");
		constraint.Should().NotBeNull(
			"CK_Post_Status must be configured in PostConfiguration"
		);
		constraint!.Sql.Should().Be(
			"status IN (10, 20, 30)",
			"PostStatus enum values are 10/Draft, 20/Scheduled, 30/Published"
		);
	}

	[Fact]
	public void ItShouldConfigurePostIndexes() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=post_architecture_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;
		var entity = model.FindEntityType(typeof(Post));
		entity.Should().NotBeNull();

		var indexes = entity!.GetIndexes().ToList();
		indexes.Should().NotBeEmpty("Post must have indexes");

		var keyset = indexes.SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_posts_tenant_created_at_id"
		);
		keyset.Should().NotBeNull(
			"keyset index ix_posts_tenant_created_at_id must exist for tenant post lists"
		);
		keyset!.Properties.Select(p => p.Name).Should().Equal(
			"TenantId", "CreatedAt", "Id"
		);

		var projectIndex = indexes.SingleOrDefault(i =>
			i.GetDatabaseName() == "ix_posts_tenant_project_id"
		);
		projectIndex.Should().NotBeNull(
			"project index ix_posts_tenant_project_id must exist"
		);
		projectIndex!.Properties.Select(p => p.Name).Should().Equal(
			"TenantId", "ProjectId"
		);
	}

	[Fact]
	public void ItShouldRequireEveryPostServiceMethodWithTenantIdToUseIt() {
		// Bug class of fix-brief-r7 item 1: ProjectExistsForTenantAsync accepted
		// Guid tenantId but never used it in the query, allowing cross-tenant
		// project references. HTTP integration specs stayed green because the
		// global tenant query filter masked the missing predicate. This guard
		// reads PostService.cs source and asserts every method with a
		// Guid tenantId parameter references TenantId == in its body (or
		// delegates to GetByIdForTenantAsync which does). Roslyn-free so the
		// guard itself cannot drift with analyzer suppressions. Paired proof:
		// remove && project.TenantId == tenantId from
		// ProjectExistsForTenantAsync and this guard must fail.
		var path = FindPostServicePath();
		var source = File.ReadAllText(path);

		// Split by method declarations that contain Guid tenantId
		var methodPattern = "public async Task";
		var methods = SplitMethods(source, methodPattern);

		var offenders = new List<string>();
		foreach (var method in methods) {
			if (!method.Signature.Contains("Guid tenantId", StringComparison.Ordinal)) {
				continue;
			}

			var body = method.Body;
			var usesTenantIdPredicate = body.Contains(
				"TenantId ==",
				StringComparison.Ordinal
			);
			var delegatesToTenantScopedLookup = body.Contains(
				"GetByIdForTenantAsync",
				StringComparison.Ordinal
			) && body.Contains("tenantId", StringComparison.Ordinal);

			if (!usesTenantIdPredicate && !delegatesToTenantScopedLookup) {
				offenders.Add(method.Signature.Trim());
			}
		}

		offenders.Should().BeEmpty(
			"every PostService method with Guid tenantId must reference "
			+ "TenantId == in its body (or delegate to a tenant-scoped lookup); "
			+ "otherwise the bug class of r7 item 1 recurs. Offenders:\n"
			+ string.Join("\n", offenders)
		);
	}

	private static string FindPostServicePath() {
		var directory = new DirectoryInfo(AppContext.BaseDirectory);
		while (directory is not null) {
			if (File.Exists(Path.Combine(directory.FullName, "justfile"))) {
				var target = Path.Combine(
					directory.FullName,
					"apps", "api", "Modules", "Posts", "Services", "PostService.cs"
				);
				if (!File.Exists(target)) {
					throw new InvalidOperationException(
						$"Could not locate PostService.cs at expected path: {target}"
					);
				}
				return target;
			}

			directory = directory.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate the repo root (containing justfile) by walking up from " +
			$"{AppContext.BaseDirectory}."
		);
	}

	private sealed record MethodSlice(string Signature, string Body);

	private static List<MethodSlice> SplitMethods(
		string source,
		string methodMarker
	) {
		var slices = new List<MethodSlice>();
		var searchFrom = 0;
		while (true) {
			var idx = source.IndexOf(methodMarker, searchFrom, StringComparison.Ordinal);
			if (idx < 0) {
				break;
			}
			var next = source.IndexOf(methodMarker, idx + methodMarker.Length, StringComparison.Ordinal);
			var slice = next < 0
				? source[idx..]
				: source[idx..next];
			// Signature is first line up to {
			var brace = slice.IndexOf('{');
			var sig = brace >= 0 ? slice[..brace] : slice;
			slices.Add(new MethodSlice(sig, slice));
			if (next < 0) {
				break;
			}
			searchFrom = next;
		}
		return slices;
	}
}
