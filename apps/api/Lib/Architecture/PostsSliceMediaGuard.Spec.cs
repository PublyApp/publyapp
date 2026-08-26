using System.Reflection;

using FluentAssertions;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Services;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Slice-level architecture pin for the #639 post-image media path. The
/// repo-wide guards (<see cref="HandlerContractGuardSpec"/>,
/// <see cref="EndpointPermissionMetadataGuardSpec"/>,
/// <see cref="EndpointRateLimitStartupGuardSpec"/> already scan every
/// endpoint and handler generically; THIS spec makes the constraint explicit
/// for the new slice so a review can see it pinned by name, and so renaming or
/// deleting one of these types cannot silently escape the global scans.
/// Pinned contract:
/// - AttachPostImageForTenant, RemovePostImageForTenant and DeletePostForTenant
///   never touch a <see cref="DbContext"/> — orchestration only, queries live in
///   services;
/// - those handlers consume the asset service through its ABSTRACTION
///   (<see cref="IPostMediaAssetService"/>), never the concrete class;
/// - <see cref="PostMediaAssetService"/> depends on nothing but its
///   <see cref="AppDbContext"/> — handlers orchestrate, services implement;
///   the #807 F5 asset-reference acquire/release coordination lives in the
///   calling handlers, which inject <c>IUploadAssetReferenceService</c>
///   themselves.
/// - the mutating media endpoints keep their route-level authorization
///   (<c>.WithTenantPermission</c> → <see cref="HasPermissionMetadata"/>) and
///   the multipart attach endpoint keeps the shared Upload rate-limit policy.
/// </summary>
public sealed class PostsSliceMediaGuardSpec : IDisposable {
	static PostsSliceMediaGuardSpec() {
		AppEnvironment.Initialize();
	}

	private static readonly string[] MediaHandlerFullNames = [
		"PublyApp.Api.Modules.Posts.Handlers.Tenant.AttachPostImageForTenant",
		"PublyApp.Api.Modules.Posts.Handlers.Tenant.RemovePostImageForTenant",
		"PublyApp.Api.Modules.Posts.Handlers.Tenant.DeletePostForTenant",
	];

	[Fact]
	public void ItShouldDiscoverPostsHandlersToGuard() {
		// Vacuity check: a broken namespace filter would make every fact below
		// pass for the wrong reason.
		var postsHandlers = ArchitectureDiscovery
			.EnumerateHandlerEntrypointTypes()
			.Where(type =>
				type.Namespace?.Contains(
					".Modules.Posts.",
					StringComparison.Ordinal
				) == true)
			.ToList();

		_ = postsHandlers.Should().NotBeEmpty(
			"Posts handler discovery must find the module's handlers; an empty "
			+ "result would make the slice guards vacuous."
		);
	}

	[Fact]
	public void ItShouldKeepMediaHandlersFreeOfDbContext() {
		var offenders = new List<string>();

		foreach (var handlerFullName in MediaHandlerFullNames) {
			var handler = ResolveApiType(handlerFullName);
			handler.Should().NotBeNull(
				$"the pinned slice handler {handlerFullName} must exist; if it was "
				+ "renamed or removed, update this slice pin deliberately"
			);
			Assert.NotNull(handler);

			var dbContextTouchpoints =
				CollectMemberTypes(handler).Where(IsDbContextType);
			foreach (var touchpoint in dbContextTouchpoints) {
				offenders.Add($"{handler.FullName} -> {touchpoint.Name}");
			}
		}

		_ = offenders.Should().BeEmpty(
			"post-image handlers orchestrate requests and must never take, hold, "
			+ "or receive an EF Core DbContext (incl. AppDbContext); asset queries "
			+ "belong in PostMediaAssetService"
		);
	}

	[Fact]
	public void ItShouldConsumeTheAssetServiceThroughItsAbstraction() {
		var offenders = new List<string>();

		foreach (var handlerFullName in MediaHandlerFullNames) {
			var handler = ResolveApiType(handlerFullName);
			Assert.NotNull(handler);

			var handle = handler.GetMethod(
				"Handle",
				BindingFlags.Public | BindingFlags.Static
			);
			handle.Should().NotBeNull(
				$"{handlerFullName} must expose the standard Handle entrypoint"
			);
			Assert.NotNull(handle);

			foreach (var parameter in handle.GetParameters()) {
				var parameterType = parameter.ParameterType;
				var isConcretePostsService =
					parameterType.Namespace?
						.StartsWith(
							"PublyApp.Api.Modules.Posts.Services",
							StringComparison.Ordinal
						) == true
					&& !parameterType.IsInterface;
				if (isConcretePostsService) {
					offenders.Add(
						$"{handler.FullName}.Handle({parameter.Name}: "
						+ $"{parameterType.Name})"
					);
				}
			}
		}

		_ = offenders.Should().BeEmpty(
			"handlers must depend on Posts services via their interfaces (e.g. "
			+ "IPostMediaAssetService), never on concrete service classes"
		);
	}

	[Fact]
	public void ItShouldPinPostMediaAssetServiceDependencies() {
		var service = ResolveApiType(
			"PublyApp.Api.Modules.Posts.Services.PostMediaAssetService"
		);
		service.Should().NotBeNull(
			"the pinned slice service PostMediaAssetService must exist; if it was "
			+ "renamed or removed, update this slice pin deliberately"
		);
		Assert.NotNull(service);

		var allowedDependencies = new HashSet<Type> {
			typeof(AppDbContext),
		};

		var offenders = service
			.GetConstructors()
			.SelectMany(constructor => constructor.GetParameters())
			.Where(parameter => !allowedDependencies.Contains(
				parameter.ParameterType))
			.Select(parameter =>
				$"{service.Name}.ctor({parameter.Name}: {parameter.ParameterType.Name})")
			.ToList();

		_ = offenders.Should().BeEmpty(
			"PostMediaAssetService may depend only on its DbContext (#1461 ratchet: "
			+ "the uploads reference service moved to the calling handlers); "
			+ "adding another domain-service dependency couples slices and belongs "
			+ "behind a deliberate change to this pin"
		);
	}

	// ── route-map facts ─────────────────────────────────────────────────

	/// <summary>Tenant-scope mount point of the posts slice.</summary>
	private const string TenantPostsPrefix = "/posts";

	/// <summary>Route suffix shared by attach/remove image.</summary>
	private const string ImageSuffix = "/{postId}/image";

	/// <summary>
	/// Route-level authorization: every mutating media endpoint of the slice
	/// must carry <see cref="HasPermissionMetadata"/> (attached by
	/// <c>.WithTenantPermission</c>). Dropping the builder call — e.g. during a
	/// refactor of the endpoint mapping — turns this fact red instead of
	/// silently publishing an unguarded upload surface.
	/// </summary>
	[Fact]
	public void ItShouldRequirePermissionMetadataOnMutatingMediaEndpoints() {
		var offenders = new List<string>();
		var matched = 0;

		foreach (var endpoint in GetAllRouteEndpoints()) {
			if (!IsTenantMutatingMediaEndpoint(endpoint, out var isImageRoute)) {
				continue;
			}

			matched++;
			var hasPermissionMetadata = endpoint.Metadata
				.OfType<HasPermissionMetadata>()
				.Any();
			if (!hasPermissionMetadata) {
				offenders.Add(
					(isImageRoute ? "image-route " : "delete-route ")
					+ BuildEndpointKey(endpoint));
			}
		}

		_ = matched.Should().Be(
			3,
			"the pin covers DELETE /posts/{{postId}}, POST /posts/{{postId}}/image "
			+ "and DELETE /posts/{{postId}}/image; a different count means the "
			+ "route map drifted and this pin must be revisited"
		);
		_ = offenders.Should().BeEmpty(
			"every mutating media endpoint must declare explicit permission "
			+ "metadata via .WithTenantPermission(…); an unguarded upload/delete "
			+ "surface must never ship"
		);
	}

	/// <summary>
	/// Rate limiting: multipart image admission must sit behind the shared
	/// Upload bucket policy. Removing <c>.RequireRateLimiting(...)</c> from the
	/// attach endpoint turns this fact red.
	/// </summary>
	[Fact]
	public void ItShouldRequireUploadRateLimitPolicyOnAttachImage() {
		var attachEndpoints = GetAllRouteEndpoints()
			.Where(endpoint => {
				var path = endpoint.RoutePattern.RawText ?? string.Empty;
				return path.StartsWith(
						TenantPostsPrefix + "/",
						StringComparison.Ordinal)
					&& path.EndsWith(ImageSuffix, StringComparison.Ordinal)
					&& endpoint.Metadata
						.OfType<HttpMethodMetadata>()
						.Any(metadata =>
							metadata.HttpMethods.Contains("POST"));
			})
			.ToList();

		attachEndpoints.Should().HaveCount(
			1,
			"POST {{postId}}/image must exist exactly once; if the route moved "
			+ "or was renamed, update this pin deliberately"
		);

		var endpoint = attachEndpoints.Single();
		var policyName = endpoint.Metadata
			.GetMetadata<EnableRateLimitingAttribute>()
			?.PolicyName;

		policyName.Should().NotBeNull(
			"the multipart attach endpoint must declare a rate-limit policy; "
			+ "unlimited upload admission is a denial-of-service vector"
		);
		policyName.Should().Be(
			ApiRateLimitPolicies.Upload,
			"image attach admission is transport-shaped by the shared Upload "
			+ "bucket, mirroring CreateStaffUpload"
		);
	}

	// ── helpers ────────────────────────────────────────────────────

	/// <summary>
	/// Matches the slice's mutating media endpoints: DELETE /posts/{postId},
	/// POST /posts/{postId}/image and DELETE /posts/{postId}/image. Read
	/// routes (GET by id/list) are outside this pin.
	/// </summary>
	private static bool IsTenantMutatingMediaEndpoint(
		RouteEndpoint candidate,
		out bool isImageRoute
	) {
		isImageRoute = false;
		var path = candidate.RoutePattern.RawText ?? string.Empty;
		if (!path.StartsWith(
				TenantPostsPrefix + "/",
				StringComparison.Ordinal)) {
			return false;
		}

		var httpMethods = candidate.Metadata
			.OfType<HttpMethodMetadata>()
			.SelectMany(metadata => metadata.HttpMethods)
			.ToHashSet(StringComparer.Ordinal);

		if (httpMethods.Contains("DELETE")
			&& path.EndsWith("/{postId}", StringComparison.Ordinal)
			&& !path.EndsWith(ImageSuffix, StringComparison.Ordinal)) {
			isImageRoute = false;
			return true;
		}

		if (path.EndsWith(ImageSuffix, StringComparison.Ordinal)
			&& (httpMethods.Contains("POST") || httpMethods.Contains("DELETE"))) {
			isImageRoute = true;
			return true;
		}

		return false;
	}

	private static string BuildEndpointKey(RouteEndpoint endpoint) {
		var httpMethodMetadata = endpoint.Metadata
			.OfType<HttpMethodMetadata>()
			.FirstOrDefault();
		var method = httpMethodMetadata?.HttpMethods.FirstOrDefault() ?? "ANY";
		var path = endpoint.RoutePattern.RawText ?? "(unknown)";
		return $"{method} {path}";
	}

	private IReadOnlyList<RouteEndpoint> GetAllRouteEndpoints() {
		using var scope = _factory.Services.CreateScope();
		var dataSource = scope.ServiceProvider
			.GetRequiredService<EndpointDataSource>();

		return dataSource.Endpoints
			.OfType<RouteEndpoint>()
			.ToList();
	}

	public void Dispose() {
		_factory.Dispose();
	}

	/// <summary>
	/// Minimal <see cref="WebApplicationFactory{TEntryPoint}"/> variant that
	/// replaces the EF Core <see cref="DbContext"/> with an unreachable stub —
	/// route metadata exists after WebApplication.Build(), before any HTTP
	/// request, so no real database is needed to inspect it.
	/// </summary>
	private sealed class RouteMapFactory : WebApplicationFactory<Program> {
		protected override void ConfigureWebHost(IWebHostBuilder builder) {
			builder.UseEnvironment(EnvironmentNames.Testing);

			builder.ConfigureServices(services => {
				services.RemoveAll<DbContextOptions<AppDbContext>>();
				services.RemoveAll<AppDbContext>();
				services.AddDbContext<AppDbContext>(options =>
					options.UseNpgsql(
						"Host=architecture-guard-stub;Database=stub;Username=stub;Password=stub"
					)
				);

				services.RemoveAll<Infrastructure.Messaging.Email.IEmailSender>();
				services.AddSingleton<FakeEmailSender>();
				services.AddSingleton<Infrastructure.Messaging.Email.IEmailSender>(
					sp => sp.GetRequiredService<FakeEmailSender>()
				);

				ApiFactory.RemoveWorkerHostedServices(services);
			});
		}
	}

	private readonly RouteMapFactory _factory = new();

	private static Type? ResolveApiType(string fullName) {
		return ArchitectureDiscovery
			.EnumerateApiTypes()
			.FirstOrDefault(type =>
				string.Equals(
					type.FullName,
					fullName,
					StringComparison.Ordinal
				));
	}

	private static IEnumerable<Type> CollectMemberTypes(Type type) {
		const BindingFlags instanceScope =
			BindingFlags.Public
			| BindingFlags.NonPublic
			| BindingFlags.Instance
			| BindingFlags.DeclaredOnly;

		foreach (var constructor in type.GetConstructors()) {
			foreach (var parameter in constructor.GetParameters()) {
				yield return parameter.ParameterType;
			}
		}
		foreach (var field in type.GetFields(instanceScope)) {
			yield return field.FieldType;
		}
		foreach (var property in type.GetProperties(instanceScope)) {
			yield return property.PropertyType;
		}
		var handle = type.GetMethod(
			"Handle",
			BindingFlags.Public | BindingFlags.Static
		);
		if (handle is null) {
			yield break;
		}
		foreach (var parameter in handle.GetParameters()) {
			yield return parameter.ParameterType;
		}
	}

	private static bool IsDbContextType(Type candidate) {
		if (candidate == typeof(AppDbContext)) {
			return true;
		}
		return typeof(DbContext).IsAssignableFrom(candidate)
			&& candidate != typeof(DbContext);
	}
}
