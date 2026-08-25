using System.Reflection;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Architecture guard for issue #866 (jobs design §11 K-6; R10-3/O30 precedent): the
/// <c>email_log</c> §4.4 provider-evidence transitions are actor-less — a provider webhook
/// or reconciliation import has no user — and the shipped <c>audit_logs</c> table requires a
/// NOT NULL <c>user_id</c> FK to <c>users</c>. Any audit write specified for those
/// transitions is unconstructible. The sanctioned shape (the same one O30 chose for
/// <c>job_dead_letter_events</c>) is an append-only evidence row that NAMES its author with
/// a required actor identity (<c>actor_kind</c> + <c>actor_id</c>) instead of attributing a
/// user. This guard pins, structurally:
///
/// 1. the evidence-transition contract exists on <c>IEmailLogWriter</c>
///    (<see cref="Modules.Messaging.Services.IEmailLogWriter.ApplyProviderEvidenceAsync"/>) —
///    vacuity guard so the checks below cannot pass for the wrong reason;
/// 2. every evidence-transition argument carries a REQUIRED, non-nullable, init-only
///    <c>ActorKind</c>/<c>ActorId</c> string — an author must be named by the compiler,
///    never defaulted to null and never smuggled in as a users.id;
/// 3. no member of the evidence entity is user-attributed and the entity stays
///    tenant-free (<c>INoTenantEntity</c>).
/// Types are resolved via <see cref="ArchitectureDiscovery"/> so this spec compiles before
/// the contract exists and fails with a named assertion instead of a build break.
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
	public void ItShouldRequireAnActorIdentityOnEveryEvidenceTransition() {
		var argsType = Resolve(
			"PublyApp.Api.Modules.Messaging.Services.ApplyProviderEvidenceEmailLogArgs"
		);

		foreach (var propertyName in new[] { "ActorKind", "ActorId" }) {
			var property = argsType.GetProperty(propertyName);

			property.Should().NotBeNull(
				"{0} must exist: an evidence transition without a named author is "
				+ "exactly the #866 defect",
				propertyName
			);

			property!.PropertyType.Should().Be(
				typeof(string),
				"{0} names its author with the controlled vocabulary / provider "
				+ "correlation text, never a users.id",
				propertyName
			);

			var setMethod = property.SetMethod;
			setMethod.Should().NotBeNull(
				"{0} is object-initializer-set; a settable author identity keeps the "
				+ "args record construction honest",
				propertyName
			);
			// init-only is a metadata modreq on the setter's return, not an attribute.
			setMethod!.ReturnParameter!
				.GetRequiredCustomModifiers()
				.Any(modifier => modifier.Name == "IsExternalInit")
				.Should()
				.BeTrue(
					"{0} must be init-only — the author is fixed at construction and "
					+ "cannot be rewritten afterwards",
					propertyName
				);

			// The C# compiler emits [RequiredMember] once on the DECLARING type for any
			// type carrying `required` members (members themselves carry
			// [CompilerFeatureRequired]); pinning the type-level attribute still forces
			// every caller through the required-members constructor path (#866).
			argsType
				.GetCustomAttributes()
				.Any(a => a.GetType().Name == "RequiredMemberAttribute")
				.Should()
				.BeTrue(
					"ApplyProviderEvidenceEmailLogArgs must carry `required` members so "
					+ "the compiler forces every caller of the evidence transition to "
					+ "name its author (#866)"
				);

			var nullabilityContext = new NullabilityInfoContext();
			nullabilityContext.Create(property).WriteState.Should().Be(
				NullabilityState.NotNull,
				"{0} must be non-nullable — never a null author",
				propertyName
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
