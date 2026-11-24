using System.Reflection;

using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Adapters;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// #2509 owner guardrail: an adapter is only reachable through the registry, so a
/// business class cannot inject <see cref="ISocialPublisher"/> (or the collection of
/// them) and bypass the network routing. The registry owns the list it is built from,
/// and <see cref="SocialAdapterServiceCollectionExtensions"/> is the one wiring point;
/// no other constructor may take the port. The Roslyn analyzer and the attribute that
/// make this a build error are part of PR 2; until then this reflection guard is the
/// executable check.
/// </summary>
public sealed class SocialAdapterArchitectureSpec {
	[Fact]
	public void ItShouldOnlyLetTheRegistryAndTheWiringTakePublishers() {
		var allowed = new[] {
			typeof(SocialAdapterRegistry),
			typeof(SocialAdapterServiceCollectionExtensions),
		};

		var offenders = typeof(Program).Assembly
			.GetTypes()
			.Where(type => !allowed.Contains(type))
			.SelectMany(type => type
				.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
				.Where(constructor => constructor
					.GetParameters()
					.Any(parameter => SocialAdapterArchitectureSpec._TakesPublishers(parameter.ParameterType)))
				.Select(constructor => $"{type.FullName}({string.Join(", ", constructor
					.GetParameters()
					.Select(parameter => parameter.ParameterType.Name))})"))
			.ToList();

		offenders.Should().BeEmpty(
			"only SocialAdapterRegistry may take ISocialPublisher; everyone else must go "
			+ "through ISocialAdapterRegistry.Publisher(network)"
		);
	}

	private static bool _TakesPublishers(Type parameterType) {
		return parameterType == typeof(ISocialPublisher)
			|| (parameterType.IsGenericType
				&& parameterType.GetGenericTypeDefinition() == typeof(IEnumerable<>)
				&& parameterType.GetGenericArguments()[0] == typeof(ISocialPublisher));
	}
}
