using System.Reflection;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Architecture guard for issue #866 round 1 (jobs design §4.4/K-6): every
/// <c>email_log</c> evidence-transition contract NAMES its author as an
/// <see cref="Modules.Messaging.Entities.EmailLogActor"/> value — never two free
/// strings, never null, never "", never a fabricated users.id.
///
/// The convention this guard enforces (made explicit by the marker itself):
/// <see cref="Modules.Messaging.Services.IEmailLogTransition"/> marks every type that
/// carries the identity + evidence of one email-log transition. The guard enumerates
/// EVERY implementor in the API assembly and requires a required, init-only,
/// non-nullable <c>Actor</c> member of the value type — so a transition added later
/// without a named author goes red in CI naming the type, not just at review
/// (paired RED proof recorded in the lane log: a scratch implementor without an
/// actor failed <see cref="ItShouldRequireAnEmailLogActorOnEveryTransitionContract"/>
/// naming it, and passed again once reverted).
///
/// Also pinned: the evidence entity stays tenant-free and user-attribution-free, and
/// the value type's invariants hold (vocabulary kind via its factories, bounded id).
/// Types are resolved via <see cref="ArchitectureDiscovery"/> so this spec compiles
/// before the contracts exist and fails with named assertions instead of build breaks.
/// </summary>
public sealed class EmailEvidenceAuditActorGuardSpec {
	static EmailEvidenceAuditActorGuardSpec() {
		AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldExposeTheProviderEvidenceTransitionContract() {
		var writerInterface = Resolve(
			"PublyApp.Api.Modules.Messaging.Services.IEmailLogWriter"
		);

		writerInterface
			.GetMethod("ApplyProviderEvidenceAsync")
			.Should()
			.NotBeNull(
				"§4.4's single provider-evidence transition path must exist on "
				+ "IEmailLogWriter; if it is renamed or removed, update this guard "
				+ "deliberately (#866/K-6)"
			);
	}

	[Fact]
	public void ItShouldHaveAtLeastOneTransitionMarkerImplementor() {
		Transitions.Should().NotBeEmpty(
			"IEmailLogTransition is the explicit convention marking every email-log "
			+ "transition contract; with zero implementors the enumeration below "
			+ "would pass vacuously. If the marker was renamed or repurposed, update "
			+ "this guard deliberately (#866)"
		);
	}

	// Finding-2 core property: EVERY implementor of the IEmailLogTransition marker —
	// today's ApplyProviderEvidenceEmailLogArgs and any transition contract added
	// later — must carry a required, init-only, non-nullable EmailLogActor `Actor`.
	// A new transition without an author fails HERE, naming the type.
	[Fact]
	public void ItShouldRequireAnEmailLogActorOnEveryTransitionContract() {
		var failures = new List<string>();

		foreach (var transition in Transitions) {
			var property = transition.GetProperty("Actor");
			if (property is null) {
				failures.Add(
					$"{transition.FullName}: no Actor member — every email-log "
					+ "transition contract must name its author with an "
					+ "EmailLogActor (#866)"
				);
				continue;
			}

			if (property.PropertyType != ActorType) {
				failures.Add(
					$"{transition.FullName}: Actor must be the EmailLogActor value "
					+ $"type, not {property.PropertyType} — free-string authors are "
					+ "the #866 defect (empty or out-of-vocabulary kinds compile)"
				);
			}

			var setMethod = property.SetMethod;
			if (setMethod is null) {
				failures.Add(
					$"{transition.FullName}: Actor must be object-initializer-settable"
				);
			} else if (!setMethod.ReturnParameter!
					.GetRequiredCustomModifiers()
					.Any(modifier => modifier.Name == "IsExternalInit")) {
				// init-only is a metadata modreq on the setter's return, not an attribute.
				failures.Add(
					$"{transition.FullName}: Actor must be init-only — the author is "
					+ "fixed at construction and cannot be rewritten afterwards"
				);
			}

			var nullabilityContext = new NullabilityInfoContext();
			if (nullabilityContext.Create(property).WriteState
				!= NullabilityState.NotNull) {
				failures.Add(
					$"{transition.FullName}: Actor must be non-nullable — never a "
					+ "null author (#866)"
				);
			}
		}

		_ = failures.Should().BeEmpty(
			"every IEmailLogTransition implementor must carry a required, init-only, "
			+ "non-nullable EmailLogActor Actor; violations:\n" + string.Join("\n", failures)
		);
	}

	// The compiler emits [RequiredMember] once on the DECLARING type for any type
	// carrying `required` members. Requiring it on every transition forces every
	// caller through the required-members constructor path — omission is a compile
	// error, not a silent default (#866).
	[Fact]
	public void ItShouldMakeTheAuthorUnomittableOnEveryTransitionContract() {
		foreach (var transition in Transitions) {
			transition
				.GetCustomAttributes()
				.Any(attribute => attribute.GetType().Name == "RequiredMemberAttribute")
				.Should()
				.BeTrue(
					"{0} must carry `required` members so the compiler forces every "
					+ "caller to name the transition's author (#866)",
					transition.FullName
				);
		}
	}

	[Fact]
	public void ItShouldKeepEvidenceRowsUserAttributionFreeAndTenantFree() {
		var eventType = Resolve(
			"PublyApp.Api.Modules.Messaging.Entities.EmailLogEvidenceEvent"
		);

		eventType.GetInterfaces().Should().Contain(
			i => i.Name == "INoTenantEntity",
			"engine/provider-written evidence rows carry no tenant scope"
		);

		eventType.GetProperties()
			.Where(p => p.Name.EndsWith("UserId", StringComparison.Ordinal)
				|| p.Name == "User")
			.Should()
			.BeEmpty(
				"email_log_evidence_events is the actor-less evidence table: its author "
				+ "is actor_kind/actor_id text, NEVER a users.id column (#866/K-6)"
			);

		eventType.GetProperty("ActorKind").Should().NotBeNull();
		eventType.GetProperty("ActorId").Should().NotBeNull();
	}

	[Fact]
	public void ItShouldKeepTheActorValueTypeInvariantEnforcing() {
		var actorType = Resolve(
			"PublyApp.Api.Modules.Messaging.Entities.EmailLogActor"
		);

		// The static factories are the ONLY public constructors: a caller cannot build
		// an out-of-vocabulary Kind because the constructor is private.
		actorType.GetConstructors(BindingFlags.Public | BindingFlags.Instance)
			.Should()
			.BeEmpty(
				"EmailLogActor's vocabulary Kind can only be built through its "
				+ "factories — no public constructor may bypass them (#866)"
			);

		actorType.GetMethods(BindingFlags.Public | BindingFlags.Static)
			.Where(m => m.ReturnType == ActorType)
			.Select(m => m.Name)
			.Should()
			.Contain(VocabularyFactoryNames,
				"each vocabulary kind has exactly one factory");
	}

	private static readonly string[] VocabularyFactoryNames =
		["ProviderWebhook", "ProviderReconciliation"];

	private static Type? ActorType {
		get {
			return ArchitectureDiscovery.EnumerateApiTypes()
				.FirstOrDefault(t => t.FullName == ActorTypeFullName);
		}
	}

	private const string ActorTypeFullName =
		"PublyApp.Api.Modules.Messaging.Entities.EmailLogActor";

	private static List<Type> Transitions {
		get {
			return ArchitectureDiscovery.EnumerateApiTypes()
				.Where(t => t.GetInterfaces()
					.Any(i => i.FullName == TransitionMarkerFullName))
				.ToList();
		}
	}

	private const string TransitionMarkerFullName =
		"PublyApp.Api.Modules.Messaging.Services.IEmailLogTransition";

	private static Type Resolve(string fullName) {
		var type = ArchitectureDiscovery.EnumerateApiTypes()
			.FirstOrDefault(t => t.FullName == fullName);

		type.Should().NotBeNull(
			"type {0} must exist — it is the #866 contract surface this guard pins; "
			+ "if it moved, update the reference deliberately",
			fullName
		);

		return type!;
	}
}
