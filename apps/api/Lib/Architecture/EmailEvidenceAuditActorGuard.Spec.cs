using System.Reflection;
using System.Reflection.Emit;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Architecture guard for issue #866 (jobs design §4.4/K-6): every
/// <c>email_log</c> evidence transition NAMES its author as an
/// <see cref="Modules.Messaging.Entities.EmailLogActor"/> value — never two free
/// strings, never null, never "", never a fabricated users.id — and every append
/// of an <see cref="Modules.Messaging.Entities.EmailLogEvidenceEvent"/> row flows
/// through the single marked seam.
///
/// Round-2 sharpening: the guarded INVARIANT is the write surface, not the marker.
/// Round 1 enumerated only <see cref="Modules.Messaging.Services.IEmailLogTransition"/>
/// implementors, so a transition class that skipped the marker and appended
/// evidence rows directly stayed invisible to this guard (round-2 review finding).
/// The guard now scans EVERY method body in the API assembly (a reflection IL walk)
/// for references to the evidence surface — the
/// <see cref="Modules.Messaging.Entities.EmailLogEvidenceEvent"/> type token, any
/// member declared on it, the AppDbContext <c>get_EmailLogEvidenceEvent</c> DbSet
/// accessor, and any string literal carrying the
/// <c>email_log_evidence_events</c> table/constraint name — and requires every
/// referencing type to sit inside the declared seam: either a marked transition
/// contract, or one of exactly three allowlisted infrastructure members pinned by
/// <see cref="ItShouldPinTheEvidenceSeamAllowlistToExactlyThreeJustifiedMembers"/>
/// (the DbContext that declares the set, the single §4.4 writer, the EF mapping).
/// A bypass class turns the guard red naming the class; an unusable scan (too few
/// discovered types, a missing surface anchor, zero referencing types) fails loud
/// instead of passing vacuously. Paired RED proof recorded in the lane log: a
/// scratch test-only class appending evidence without the marker turned
/// <see cref="ItShouldRefuseAnyTypeWritingEmailLogEvidenceWithoutTheTransitionMarker"/>
/// red naming it, and green again once reverted.
///
/// Still pinned from round 1: every marker implementor carries a required,
/// init-only, non-nullable Actor member (its own paired RED proof); the evidence
/// entity stays tenant-free and user-attribution-free; the value type's factory
/// invariants hold. Types are resolved via <see cref="ArchitectureDiscovery"/> so
/// this spec compiles before the contracts exist and fails with named assertions
/// instead of build breaks.
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

	// Round-2 core property: the INVARIANT, not the marker. Every API type whose
	// method bodies touch the email_log evidence write surface must be part of the
	// declared seam — a marked transition contract, or the pinned infrastructure
	// allowlist. A class that bypasses IEmailLogTransition and appends evidence
	// rows directly fails HERE, naming the class (#866 round 2).
	[Fact]
	public void ItShouldRefuseAnyTypeWritingEmailLogEvidenceWithoutTheTransitionMarker() {
		var scan = EvidenceWriteSurfaceScan();

		var failures = scan.ViolatorNames
			.Select(violator => $"{violator}: touches the email_log evidence write "
				+ "surface (the EmailLogEvidenceEvent row, its DbSet accessor, or the "
				+ "email_log_evidence_events table) without implementing "
				+ "IEmailLogTransition — every evidence write must flow through "
				+ "IEmailLogWriter.ApplyProviderEvidenceAsync with a named actor, or "
				+ "join the pinned seam allowlist deliberately with a justification "
				+ "(#866)")
			.ToList();

		_ = failures.Should().BeEmpty(
			"no type may write email_log evidence around the marked seam; "
			+ "violations:\n" + string.Join("\n", failures)
		);
	}

	// The allowlist is the ONLY escape hatch from the surface invariant, so it is
	// itself pinned: exactly the three infrastructure members of the seam, nothing
	// more. A new surface-referencing type must either carry the marker or be
	// deliberated into this assertion's expectation — never silently tolerated.
	[Fact]
	public void ItShouldPinTheEvidenceSeamAllowlistToExactlyThreeJustifiedMembers() {
		var scan = EvidenceWriteSurfaceScan();

		scan.AllowedNames.Should().Equal(SeamAllowlistFullNames,
			"the allowlist must stay minimal: EmailLogWriter is §4.4's single "
			+ "writer, EmailLogEvidenceEventConfiguration is the EF "
			+ "column/constraint mapping, and EmailLogEvidenceEvent is the "
			+ "guarded row type itself (its own accessors necessarily touch "
			+ "their own members) — anything else touching the surface is a "
			+ "bypass or a deliberate allowlist edit (#866 round 2)");
	}

	// An architecture guard that scans nothing proves nothing: an unparseable or
	// empty discovery run, a surface whose anchors vanished, or a scan finding no
	// referencing type at all must fail loud — never pass vacuously (#866 round 2).
	[Fact]
	public void ItShouldFailLoudInsteadOfPassingVacuouslyOnAnUnusableSurfaceScan() {
		var scan = EvidenceWriteSurfaceScan();

		scan.ScannedTypeCount.Should().BeGreaterThan(
			MinimumPlausibleApiTypeCount,
			"a scan that sees almost no types means discovery broke — the guard "
			+ "must never pass vacuously"
		);

		scan.SurfaceKindsFound.Should().Contain(
			SurfaceAnchorKinds,
			"each anchor (entity type token, entity member, table-name "
			+ "literal) proves the scanner truly sees the write surface; a "
			+ "missing anchor means the surface moved — update this guard "
			+ "deliberately"
		);

		scan.AllowedNames.Should().NotBeEmpty(
			"the production seam itself must be visible to the scanner — a scan "
			+ "finding zero surface-referencing types is broken, not clean"
		);
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

	private const string EntityFullName =
		"PublyApp.Api.Modules.Messaging.Entities.EmailLogEvidenceEvent";

	private const string DbContextFullName = "PublyApp.Api.Data.DbContext.AppDbContext";

	private const string TableNameLiteral = "email_log_evidence_events";

	private const string DbSetAccessorName = "get_EmailLogEvidenceEvent";

	private const int MinimumPlausibleApiTypeCount = 100;

	private const byte TwoByteOpcodePrefix = 0xFE;

	// The seam's ONLY non-marker members, in discovery order. Each entry carries its
	// justification inline in the allowlist-pinning assertion above; adding a fourth
	// entry means a new surface-referencing type exists — deliberate edit required.
	private static readonly string[] SeamAllowlistFullNames = [
		"PublyApp.Api.Modules.Messaging.Entities.EmailLogEvidenceEvent",
		"PublyApp.Api.Modules.Messaging.Entities"
		+ ".EmailLogEvidenceEventConfiguration",
		"PublyApp.Api.Modules.Messaging.Services.EmailLogWriter",
	];

	private static readonly string[] SurfaceAnchorKinds = [
		"evidence_entity_type_token",
		"evidence_entity_member",
		"table_name_literal",
	];

	private sealed class EvidenceSurfaceScan {
		public int ScannedTypeCount { get; init; }

		public SortedSet<string> SurfaceKindsFound { get; } = new(StringComparer.Ordinal);

		public SortedSet<string> AllowedNames { get; } = new(StringComparer.Ordinal);

		public SortedSet<string> ViolatorNames { get; } = new(StringComparer.Ordinal);
	}

	private static EvidenceSurfaceScan? scanCache;

	private static EvidenceSurfaceScan EvidenceWriteSurfaceScan() {
		if (scanCache is not null) {
			return scanCache;
		}

		var apiTypes = ArchitectureDiscovery.EnumerateApiTypes();
		var scan = new EvidenceSurfaceScan { ScannedTypeCount = apiTypes.Count };
		var seen = new HashSet<Type>();

		foreach (var candidate in apiTypes) {
			if (!seen.Add(candidate)) {
				continue;
			}

			var touched = TouchesEvidenceSurfaceRecursive(candidate, seen, scan.SurfaceKindsFound);
			if (!touched) {
				continue;
			}

			if (IsWithinMarkedChain(candidate) || IsWithinAllowlist(candidate)) {
				scan.AllowedNames.Add(OutermostDeclaringTypeName(candidate));
			} else {
				scan.ViolatorNames.Add(OutermostDeclaringTypeName(candidate));
			}
		}

		scanCache = scan;
		return scan;
	}

	// Compiler-generated siblings (async state machines, lambda closures) live as
	// nested types of their source-declared owner and are excluded from plain
	// discovery — walk the nesting so their method bodies are scanned too and
	// attributed to the owning root type.
	private static bool TouchesEvidenceSurfaceRecursive(
		Type type,
		ISet<Type> seen,
		ISet<string> surfaceKindsFound
	) {
		var touched = TouchesEvidenceSurface(type, surfaceKindsFound);

		const BindingFlags AllVisibilities = BindingFlags.Public | BindingFlags.NonPublic;

		foreach (var nested in type.GetNestedTypes(AllVisibilities)) {
			if (seen.Add(nested)) {
				touched |= TouchesEvidenceSurfaceRecursive(nested, seen, surfaceKindsFound);
			}
		}

		return touched;
	}

	private static bool TouchesEvidenceSurface(Type type, ISet<string> surfaceKindsFound) {
		const BindingFlags AllDeclared = BindingFlags.Public | BindingFlags.NonPublic
			| BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;

		var touched = false;

		void Inspect(MethodBase method) {
			var body = method.GetMethodBody();
			if (body is null) {
				return;
			}

			if (WalkInstructions(body, method.Module, surfaceKindsFound)) {
				touched = true;
			}
		}

		foreach (var method in type.GetMethods(AllDeclared)) {
			Inspect(method);
		}

		foreach (var constructor in type.GetConstructors(AllDeclared)) {
			Inspect(constructor);
		}

		var initializer = type.TypeInitializer;
		if (initializer is not null) {
			Inspect(initializer);
		}

		return touched;
	}

	private static bool WalkInstructions(
		MethodBody body,
		Module module,
		ISet<string> surfaceKindsFound
	) {
		// GetILAsByteArray() is null only for abstract / P-Invoke bodies — they
		// carry no callable IL and cannot touch the surface.
		if (body.GetILAsByteArray() is not { } instructions) {
			return false;
		}

		var position = 0;
		var touched = false;

		while (position < instructions.Length) {
			if (!TryReadOpcode(instructions, ref position, out var opcode)) {
				return touched;
			}

			// An if-chain rather than a switch on the enum: the dispatch only
			// inspects the five operand shapes that can name the surface, and a
			// partial enum switch would trip IDE0010 forever (#866 round 2).
			if (opcode.OperandType == OperandType.InlineSwitch) {
				// Operand = N branch targets, each 4 bytes, after a 4-byte count.
				if (position + sizeof(int) > instructions.Length) {
					return touched;
				}

				var targetCount = BitConverter.ToInt32(instructions, position);
				position += sizeof(int)
					+ (Math.Max(targetCount, 0) * sizeof(int));
				continue;
			} else if (opcode.OperandType == OperandType.InlineString) {
				var literal = module.ResolveString(
					BitConverter.ToInt32(instructions, position));
				if (literal?.Contains(TableNameLiteral, StringComparison.Ordinal)
					is true) {
					surfaceKindsFound.Add("table_name_literal");
					touched = true;
				}
			} else if (opcode.OperandType
				is OperandType.InlineField or OperandType.InlineMethod) {
				MemberInfo? member = null;
				try {
					member = module.ResolveMember(
						BitConverter.ToInt32(instructions, position));
				} catch (ArgumentException) {
					// Generic-context tokens resolve only inside their own
					// instantiation; they name neither the entity nor the set.
				}

				if (member?.DeclaringType?.FullName == EntityFullName) {
					surfaceKindsFound.Add("evidence_entity_member");
					touched = true;
				}

				if (member is not null
					&& member.DeclaringType?.FullName == DbContextFullName
					&& member.Name == DbSetAccessorName) {
					surfaceKindsFound.Add("dbset_accessor");
					touched = true;
				}
			} else if (opcode.OperandType
				is OperandType.InlineType or OperandType.InlineTok) {
				Type? resolved = null;
				try {
					resolved = module.ResolveType(
						BitConverter.ToInt32(instructions, position));
				} catch (ArgumentException) {
					// Generic-context tokens resolve only inside their own
					// instantiation; they name neither the entity nor the set.
				}

				if (resolved?.FullName == EntityFullName) {
					surfaceKindsFound.Add("evidence_entity_type_token");
					touched = true;
				}
			}

			position += OperandAdvance(opcode.OperandType);
		}

		return touched;
	}

	private static bool TryReadOpcode(byte[] instructions, ref int position, out OpCode opcode) {
		opcode = OpCodes.Nop;
		if (position >= instructions.Length) {
			return false;
		}

		var first = instructions[position];
		if (first != TwoByteOpcodePrefix) {
			if (!SingleByteOpcodes.TryGetValue(first, out var single)) {
				return false;
			}

			position += 1;
			opcode = single;
			return true;
		}

		if (position + 1 >= instructions.Length) {
			return false;
		}

		var key = (ushort)((TwoByteOpcodePrefix << 8) | instructions[position + 1]);
		if (!TwoByteOpcodes.TryGetValue(key, out var paired)) {
			return false;
		}

		position += 2;
		opcode = paired;
		return true;
	}

	// Operand-size table, one entry per OperandType member: an enum value added by
	// the runtime fails LOUD here instead of silently mis-walking IL (#866 round 2).
	private static readonly IReadOnlyDictionary<OperandType, int> OperandAdvances =
		new Dictionary<OperandType, int> {
			[OperandType.InlineNone] = 0,
			[OperandType.ShortInlineBrTarget] = 1,
			[OperandType.ShortInlineI] = 1,
			[OperandType.ShortInlineVar] = 1,
			[OperandType.InlineVar] = 2,
			[OperandType.InlineSwitch] = -1,
			[OperandType.InlineBrTarget] = 4,
			[OperandType.InlineI] = 4,
			[OperandType.InlineField] = 4,
			[OperandType.InlineMethod] = 4,
			[OperandType.InlineSig] = 4,
			[OperandType.InlineString] = 4,
			[OperandType.InlineTok] = 4,
			[OperandType.InlineType] = 4,
			[OperandType.ShortInlineR] = 4,
			[OperandType.InlineI8] = 8,
			[OperandType.InlineR] = 8,
		};

	private static int OperandAdvance(OperandType operandType) {
		if (!OperandAdvances.TryGetValue(operandType, out var byteCount)) {
			throw new InvalidOperationException(
				$"unhandled IL operand type {operandType}");
		}

		return byteCount;
	}

	private static readonly IReadOnlyDictionary<byte, OpCode> SingleByteOpcodes =
		BuildOpcodeMaps().SingleByte;

	private static readonly IReadOnlyDictionary<ushort, OpCode> TwoByteOpcodes =
		BuildOpcodeMaps().TwoByte;

	private static (IReadOnlyDictionary<byte, OpCode> SingleByte,
		IReadOnlyDictionary<ushort, OpCode> TwoByte) BuildOpcodeMaps() {
		var emitted = typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
			.Select(field => field.GetValue(null))
			.OfType<OpCode>();

		var single = new Dictionary<byte, OpCode>();
		var paired = new Dictionary<ushort, OpCode>();

		foreach (var candidate in emitted) {
			if (candidate.Size == 1) {
				single[(byte)candidate.Value] = candidate;
			} else if (candidate.Size == 2) {
				paired[(ushort)candidate.Value] = candidate;
			}
		}

		return (single, paired);
	}

	private static bool IsWithinMarkedChain(Type type) {
		for (var current = type; current is not null; current = current.DeclaringType) {
			if (current.GetInterfaces()
				.Any(i => i.FullName == TransitionMarkerFullName)) {
				return true;
			}
		}

		return false;
	}

	private static bool IsWithinAllowlist(Type type) {
		for (var current = type; current is not null; current = current.DeclaringType) {
			if (current.FullName is { } fullName
				&& SeamAllowlistFullNames.Contains(fullName, StringComparer.Ordinal)) {
				return true;
			}
		}

		return false;
	}

	private static string OutermostDeclaringTypeName(Type type) {
		var current = type;
		while (current.DeclaringType is not null) {
			current = current.DeclaringType;
		}

		return current.FullName ?? current.Name;
	}

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
