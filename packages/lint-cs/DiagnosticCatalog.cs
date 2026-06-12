using Microsoft.CodeAnalysis;

namespace PublyApp.Analyzers;

/// <summary>
/// Central registry for all <see cref="DiagnosticDescriptor"/> instances in this analyzer package.
/// One static field per rule keeps descriptor allocation at module-init time and makes it easy to
/// scan all rules at a glance.
/// </summary>
public static class DiagnosticCatalog {
	/// <summary>
	/// PUBLY0001 — disallow the null-forgiving operator (<c>x!</c>) in production C#. Per the repo
	/// C# standards, the null state must be handled explicitly (guard clauses or safe accessors like
	/// <c>GetRequiredId()</c>) instead of suppressing the nullable warning. <c>isEnabledByDefault:
	/// false</c> means Roslyn loads the analyzer and registers the action but never surfaces the
	/// diagnostic until it is turned on via <c>.editorconfig</c> — deferred until production code is
	/// clean.
	/// </summary>
	public static readonly DiagnosticDescriptor NullForgivingOperator = new(
		DiagnosticIds.PUBLY0001,
		"Avoid the null-forgiving operator",
		"Do not use the null-forgiving operator '!'; handle null explicitly with a guard clause or "
			+ "a safe accessor",
		"PublyApp.Nullability",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false,
		description: "The null-forgiving operator '!' suppresses nullable warnings without handling "
			+ "the null state. Use guard clauses or safe accessors (e.g. GetRequiredId()) instead.");

	/// <summary>
	/// PUBLY0002 — disallow null-coalescing throw expressions (<c>x ?? throw ...</c>) in
	/// production C#. Per the repo C# standards, null-then-throw paths must use explicit guard
	/// clauses instead of embedding a throw expression in a coalesce expression.
	/// <c>isEnabledByDefault: false</c> means Roslyn loads the analyzer and registers the action
	/// but never surfaces the diagnostic until it is turned on via <c>.editorconfig</c> — deferred
	/// until production code is clean.
	/// </summary>
	public static readonly DiagnosticDescriptor CoalesceThrow = new(
		DiagnosticIds.PUBLY0002,
		"Avoid null-coalescing throw expressions",
		"Do not use '?? throw'; use an explicit if guard clause for null-then-throw patterns",
		"PublyApp.Nullability",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false,
		description: "The '?? throw' pattern hides null handling inside an expression. Use "
			+ "explicit guard clauses for null-then-throw patterns instead.");

	/// <summary>
	/// PUBLY0003 - disallow ToLower()/ToLowerInvariant() in comparison or dispatch contexts. Per
	/// the repo C# standards, case-insensitive comparison should use StringComparison overloads or
	/// case-insensitive comparers instead of allocating a normalized string first. Disabled by
	/// default so the analyzer can ship dormant before enforcement is enabled in .editorconfig.
	/// </summary>
	public static readonly DiagnosticDescriptor ToLowerForComparison = new(
		DiagnosticIds.PUBLY0003,
		"Avoid ToLower() for comparison or dispatch",
		"Do not use ToLower()/ToLowerInvariant() for comparison or dispatch; use "
			+ "StringComparison overloads or case-insensitive comparers",
		"PublyApp.Comparison",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false,
		description: "Calling ToLower()/ToLowerInvariant() before comparison or dispatch can be "
			+ "culture-sensitive, allocate unnecessarily, and hide the intended comparison "
			+ "semantics. Use StringComparison overloads or case-insensitive comparers instead.");

	/// <summary>
	/// PUBLY0006 — flags request DTO getter calls in handler entrypoints that are repeated without
	/// local caching, or that return parsing-sensitive values (for ship phase, <c>PatchField&lt;T&gt;</c>).
	/// <c>isEnabledByDefault: false</c> keeps this rule opt-in until phase-4 enforcement.
	/// </summary>
	public static readonly DiagnosticDescriptor UncachedBodyGetter = new(
		DiagnosticIds.PUBLY0006,
		"Cache request DTO getter results",
		"Cache '{0}' to a local variable before reusing it",
		"PublyApp.Correctness",
		DiagnosticSeverity.Hidden,
		isEnabledByDefault: false,
		description: "In handler entrypoints, request DTO getters should be assigned to a local "
			+ "variable once and reused rather than repeatedly invoked, especially for parsing-sensitive "
			+ "returns such as PatchField<T>.");
	/// <summary>
	/// PUBLY0004 - disallow Dto-suffixed type declarations in handler contracts. Handler wire
	/// contracts should use suffixes like Body/Query/Result/Response/Item instead.
	/// </summary>
	public static readonly DiagnosticDescriptor DtoSuffixHandlerContract = new(
		DiagnosticIds.PUBLY0004,
		"Avoid Dto suffix on handler contract types",
		"Do not use the Dto suffix for handler contract types; use named contracts like "
			+ "Body, Query, Result, Response, or Item",
		"PublyApp.Naming",
		DiagnosticSeverity.Hidden,
		isEnabledByDefault: false,
		description: "Handler contract file types should use semantic suffixes such as "
			+ "Body, Query, Result, Response, or Item. A Dto suffix does not align with handler "
			+ "contract naming conventions.");
	/// <summary>
	/// PUBLY0005 — discourage inline FluentValidation chains against JsonElement getters in
	/// validator types and prefer shared <c>JsonElementRules</c> helpers. Disabled by default
	/// because this ship rule requires rollout across existing validators.
	/// </summary>
	public static readonly DiagnosticDescriptor InlineFluentValidationChain = new(
		DiagnosticIds.PUBLY0005,
		"Use shared JsonElementRules helpers",
		"Replace inline FluentValidation chains on JsonElement getters with JsonElementRules "
			+ "helpers",
		"PublyApp.Validation",
		DiagnosticSeverity.Hidden,
		isEnabledByDefault: false,
		description: "Inline FluentValidation rule chains that call built-in validation "
			+ "operators directly on JsonElement getters duplicate shared logic and should "
			+ "use JsonElementRules extension methods instead.");
	/// <summary>
	/// PUBLY0007 — enforce staff-handler authorization invariants by requiring service calls in staff
	/// handlers to use *ForStaff service variants when available. Staff variants are defined as
	/// sibling methods suffixed with <c>ForStaff</c>, usually by inserting it before <c>Async</c>.
	/// <c>isEnabledByDefault: false</c> keeps this rule dormant until enabled in configuration.
	/// </summary>
	public static readonly DiagnosticDescriptor StaffHandlerServiceVariant = new(
		DiagnosticIds.PUBLY0007,
		"Use the staff service variant in staff handlers",
		"Call the staff service variant when available in staff handlers",
		"PublyApp.Authorization",
		DiagnosticSeverity.Hidden,
		isEnabledByDefault: false,
		description: "Staff handler code paths should call service methods suffixed with "
			+ "ForStaff when present (for example, GetTenantByIdForStaffAsync) so tenant-scoped "
			+ "filtering in the base variant is not reused in staff contexts.");
	/// <summary>
	/// PUBLY0008 — disallow direct null equality checks and require pattern matching null checks
	/// (<c>x == null</c>/<c>x != null</c> -> <c>x is null</c>/<c>x is not null</c>) to enforce
	/// explicit nullability semantics.
	/// </summary>
	public static readonly DiagnosticDescriptor EqualityNullCheck = new(
		DiagnosticIds.PUBLY0008,
		"Use pattern matching for null checks",
		"Use 'is null' / 'is not null' pattern matching instead of direct null equality checks",
		"PublyApp.Nullability",
		DiagnosticSeverity.Hidden,
		isEnabledByDefault: false,
		description: "Prefer pattern-matching null checks to direct equality checks so null checks are "
			+ "explicit and aligned with the project's nullability conventions."
	);

	/// <summary>
	/// PUBLY0009 — disallow <c>TypedResults.Forbid()</c> in error paths. Per the repo RFC 7807
	/// conventions, all errors must be returned via <c>TypedProblems.*</c> (RFC 7807
	/// <c>application/problem+json</c>) rather than the framework <c>Forbid</c> result.
	/// <c>isEnabledByDefault: false</c> keeps this rule dormant until enabled in configuration.
	/// </summary>
	public static readonly DiagnosticDescriptor TypedResultsForbid = new(
		DiagnosticIds.PUBLY0009,
		"Avoid TypedResults.Forbid()",
		"Do not use 'TypedResults.Forbid()'; use 'TypedProblems.*' (RFC 7807) instead",
		"PublyApp.ErrorHandling",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false,
		description: "Error responses must be RFC 7807 'application/problem+json' returned via "
			+ "TypedProblems.* helpers. TypedResults.Forbid() bypasses the RFC 7807 contract and the "
			+ "frontend logout semantics tied to 401/403 handling.");

	/// <summary>
	/// PUBLY0010 — security regression guard: never pass a session-token value to a logger in any log
	/// level. Per the AGENTS.md "Do Not Regress" invariant, the <c>X-Session-Token</c> value (and any
	/// session-token value) must never be logged. Matching is deliberately conservative: it fires only
	/// on a logging call (<c>Log*</c>/<c>BeginScope</c> on an <c>*logger*</c>-shaped receiver) whose
	/// arguments reference the <c>SessionToken</c> identifier/member vocabulary or the literal
	/// <c>X-Session-Token</c> header name. It does NOT fire on generic terms like "token",
	/// "Authorization", or "csrf". <c>isEnabledByDefault: false</c> ships the analyzer dormant; the
	/// repo-root <c>.editorconfig</c> flips it to <c>warning</c> for enforcement.
	/// </summary>
	public static readonly DiagnosticDescriptor SessionTokenLogging = new(
		DiagnosticIds.PUBLY0010,
		"Do not log session-token values",
		"Do not pass a session-token value ('{0}') to a logger; session tokens must never be logged "
			+ "in any log level",
		"PublyApp.Security",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false,
		description: "Session tokens are secrets. Logging the X-Session-Token header value (or any "
			+ "value referenced via SessionToken identifiers/members) leaks credentials. Never pass a "
			+ "session-token value to a logger in any log level; log a non-sensitive identifier "
			+ "instead."
	);
}
