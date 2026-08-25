using System.Reflection;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Uploads.Services;

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
///   <see cref="AppDbContext"/> and the uploads reference service (#807 F5
///   discipline) — no domain-service-to-domain-service coupling.
/// </summary>
public sealed class PostsSliceMediaGuardSpec {
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
			typeof(IUploadAssetReferenceService),
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
			"PostMediaAssetService may depend only on its DbContext and the "
			+ "uploads reference service (#807 F5); adding another domain-service "
			+ "dependency couples slices and belongs behind a deliberate change "
			+ "to this pin"
		);
	}

	// ── helpers ────────────────────────────────────────────────────────

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
