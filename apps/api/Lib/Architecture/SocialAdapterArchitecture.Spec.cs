using System.Reflection;

using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Adapters;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// #2509 owner guardrail: an adapter is only reachable through the registry, so a
/// business class cannot inject <see cref="ISocialPublisher"/> (or any collection of
/// them) and bypass the network routing. The registry owns the list it is built from,
/// and <see cref="SocialAdapterServiceCollectionExtensions"/> is the one wiring point;
/// no other constructor may take the port. The Roslyn analyzer and the attribute that
/// make this a build error are part of PR 2; until then this reflection guard is the
/// executable check.
/// </summary>
public sealed class SocialAdapterArchitectureSpec {
	private static readonly Type[] _Allowed = [
		typeof(SocialAdapterRegistry),
		typeof(SocialAdapterServiceCollectionExtensions),
	];

	[Fact]
	public void ItShouldOnlyLetTheRegistryAndTheWiringTakePublishers() {
		List<string> offenders = SocialAdapterArchitectureSpec.FindOffenders(
			typeof(Program).Assembly, SocialAdapterArchitectureSpec._Allowed);

		offenders.Should().BeEmpty(
			"only SocialAdapterRegistry may take ISocialPublisher; everyone else must go "
			+ "through ISocialAdapterRegistry.Publisher(network)"
		);
	}

	// Every container shape Microsoft DI resolves counts: a constructor taking the
	// array, IEnumerable<T>, IReadOnlyList<T>, ICollection<T> or IList<T> bypasses the
	// registry exactly like the bare port. Pinned per shape so a regression to the old
	// "only IEnumerable<>" check fails naming the shape it stopped covering.
	public static TheoryData<Type> PublisherCollectionShapes() {
		return new TheoryData<Type> {
			typeof(ISocialPublisher),
			typeof(ISocialPublisher[]),
			typeof(IEnumerable<ISocialPublisher>),
			typeof(IReadOnlyList<ISocialPublisher>),
			typeof(ICollection<ISocialPublisher>),
			typeof(IList<ISocialPublisher>),
			typeof(IReadOnlyCollection<ISocialPublisher>),
			typeof(List<ISocialPublisher>),
		};
	}

	[Theory]
	[MemberData(nameof(SocialAdapterArchitectureSpec.PublisherCollectionShapes))]
	public void ItShouldRecogniseEveryPublisherCollectionShape(Type parameterType) {
		SocialAdapterArchitectureSpec.TakesPublishers(parameterType).Should().BeTrue(
			"{0} is a publisher container DI resolves into a constructor", parameterType
		);
	}

	[Fact]
	public void ItShouldIgnoreParametersThatCarryNoPublisher() {
		SocialAdapterArchitectureSpec.TakesPublishers(typeof(IEnumerable<int>)).Should().BeFalse();
		SocialAdapterArchitectureSpec.TakesPublishers(typeof(int[])).Should().BeFalse();
		SocialAdapterArchitectureSpec.TakesPublishers(typeof(string)).Should().BeFalse();
	}

	// End-to-end over real constructors: the reflection scan itself must name every
	// offending shape, not just the predicate in isolation.
	[Fact]
	public void ItShouldNameAConstructorForEveryPublisherCollectionShape() {
		Type[] offenders = [
			typeof(SocialAdapterArchitectureSpec.PublisherParameterConsumer),
			typeof(SocialAdapterArchitectureSpec.PublisherArrayConsumer),
			typeof(SocialAdapterArchitectureSpec.PublisherEnumerableConsumer),
			typeof(SocialAdapterArchitectureSpec.PublisherReadOnlyListConsumer),
			typeof(SocialAdapterArchitectureSpec.PublisherCollectionConsumer),
		];

		List<string> found = SocialAdapterArchitectureSpec.FindOffenders(
			typeof(SocialAdapterArchitectureSpec).Assembly,
			typeof(SocialAdapterArchitectureSpec));

		foreach (var offender in offenders) {
			found.Should().Contain(
				name => name.StartsWith(offender.FullName + "(", StringComparison.Ordinal),
				"{0} takes a publisher container and must be reported", offender.Name
			);
		}
	}

	internal static List<string> FindOffenders(Assembly assembly, params Type[] allowed) {
		return assembly
			.GetTypes()
			.Where(type => !allowed.Contains(type))
			.SelectMany(type => type
				.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
				.Where(constructor => constructor
					.GetParameters()
					.Any(parameter => SocialAdapterArchitectureSpec.TakesPublishers(parameter.ParameterType)))
				.Select(constructor => $"{type.FullName}({string.Join(", ", constructor
					.GetParameters()
					.Select(parameter => parameter.ParameterType.Name))})"))
			.ToList();
	}

	// Arrays implement IEnumerable<T>, so interface discovery covers them too; a type
	// that is itself IEnumerable<ISocialPublisher> (no inherited interface match) is
	// appended explicitly. This also catches List<>, ReadOnlyCollection<> and every
	// other IEnumerable<ISocialPublisher> implementation a handler might ask DI for.
	internal static bool TakesPublishers(Type parameterType) {
		if (parameterType == typeof(ISocialPublisher)) {
			return true;
		}

		return parameterType
			.GetInterfaces()
			.Append(parameterType)
			.Any(candidate => candidate.IsGenericType
				&& candidate.GetGenericTypeDefinition() == typeof(IEnumerable<>)
				&& candidate.GetGenericArguments()[0] == typeof(ISocialPublisher));
	}

	private sealed class PublisherParameterConsumer {
		public PublisherParameterConsumer(ISocialPublisher publisher) {
			this.Publisher = publisher;
		}

		public ISocialPublisher Publisher { get; }
	}

	private sealed class PublisherArrayConsumer {
		public PublisherArrayConsumer(ISocialPublisher[] publishers) {
			this.Publishers = publishers;
		}

		public ISocialPublisher[] Publishers { get; }
	}

	private sealed class PublisherEnumerableConsumer {
		public PublisherEnumerableConsumer(IEnumerable<ISocialPublisher> publishers) {
			this.Publishers = publishers;
		}

		public IEnumerable<ISocialPublisher> Publishers { get; }
	}

	private sealed class PublisherReadOnlyListConsumer {
		public PublisherReadOnlyListConsumer(IReadOnlyList<ISocialPublisher> publishers) {
			this.Publishers = publishers;
		}

		public IReadOnlyList<ISocialPublisher> Publishers { get; }
	}

	private sealed class PublisherCollectionConsumer {
		public PublisherCollectionConsumer(ICollection<ISocialPublisher> publishers) {
			this.Publishers = publishers;
		}

		public ICollection<ISocialPublisher> Publishers { get; }
	}
}
