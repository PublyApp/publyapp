# Explicit C# Member Access Analyzer Design

**Date:** 2026-09-09
**Issue:** #2111
**Status:** Ratified/approved on 2026-09-10; Phase 1 implementation and verification are in scope

## Decision summary

Add one semantic Roslyn analyzer rule and one Roslyn code-fix provider to
packages/lint-cs. The rule requires every eligible unqualified reference to an
instance member to use this.Member, and every eligible unqualified reference
to a static member to use the current containing type, ContainingType.Member.
The rule applies to handwritten C# in application, tooling, and test projects,
including *.Spec.cs; Roslyn-recognized generated code and the repository's
generated EF migration output remain excluded.

The rule is PUBLY0012, follows the existing dormant-by-descriptor /
enabled-by-root-.editorconfig convention, and is enforced as a warning
(therefore a build error under TreatWarningsAsErrors). The code-fix provider
offers the same transformation for one diagnostic and uses the standard batch
fixer for document, project, and solution Fix All.

This is a style/readability rule only. It must not change overload resolution,
accessibility, runtime behavior, public API shape, or the meaning of a
nameof expression.

The access rule is paired with a native .editorconfig naming contract. An
underscore denotes private visibility, not a field category: every handwritten
private field, property, event, and ordinary method uses underscore + PascalCase,
including static and const fields. Parameters and locals remain camelCase.
Public, protected, and internal members in those same four categories remain
PascalCase without an underscore. Naming and access qualification are orthogonal;
for example, the resulting forms are this._CurrentUser,
this._ValidateRequest(), and ContainingType._SharedCache.

### Bespoke-guard admission exception

On 2026-09-10, the owner granted an explicit bespoke-guard admission exception
for PUBLY0012 (`PublyApp.Style`) under the hard rule in
`docs/guides/test-conventions.md`. The exception covers this semantic analyzer,
its code fix, and the required regression/contract tests. PUBLY0012 remains
dormant (`isEnabledByDefault: false`, with no root `.editorconfig` entry) until
the Phase 2 migration is complete. Retire or roll back the exception if the
Phase 2 migration is abandoned, or if PUBLY0012 is withdrawn or materially
re-scoped.

## Native naming contract

The implementation must add this exact native naming configuration to the C#
section of the root .editorconfig after the migration is clean. The names are
deliberately limited to the four owner-approved member categories:

~~~ini
# Symbol groups: only fields, properties, events, and ordinary methods.
dotnet_naming_symbols.private_member_symbols.applicable_kinds = field,property,event,method
dotnet_naming_symbols.private_member_symbols.applicable_accessibilities = private

# Explicit intersection: private const fields must win over broader const/static rules.
dotnet_naming_symbols.private_constant_fields.applicable_kinds = field
dotnet_naming_symbols.private_constant_fields.applicable_accessibilities = private
dotnet_naming_symbols.private_constant_fields.required_modifiers = const

dotnet_naming_symbols.non_private_member_symbols.applicable_kinds = field,property,event,method
dotnet_naming_symbols.non_private_member_symbols.applicable_accessibilities = public,protected,internal,protected_internal,private_protected

dotnet_naming_style.private_pascal_underscore.capitalization = pascal_case
dotnet_naming_style.private_pascal_underscore.required_prefix = _
dotnet_naming_style.non_private_pascal.capitalization = pascal_case

dotnet_naming_rule.private_members_must_be_underscored_pascal_case.symbols = private_member_symbols
dotnet_naming_rule.private_members_must_be_underscored_pascal_case.style = private_pascal_underscore
dotnet_naming_rule.private_members_must_be_underscored_pascal_case.severity = warning

dotnet_naming_rule.private_constants_must_be_underscored_pascal_case.symbols = private_constant_fields
dotnet_naming_rule.private_constants_must_be_underscored_pascal_case.style = private_pascal_underscore
dotnet_naming_rule.private_constants_must_be_underscored_pascal_case.severity = warning

dotnet_naming_rule.non_private_members_must_be_pascal_case.symbols = non_private_member_symbols
dotnet_naming_rule.non_private_members_must_be_pascal_case.style = non_private_pascal
dotnet_naming_rule.non_private_members_must_be_pascal_case.severity = warning

# IDE1006 is the native naming-rule diagnostic; this entry makes warning
# severity effective during command-line builds under TreatWarningsAsErrors.
dotnet_diagnostic.IDE1006.severity = warning
~~~

The private group has no `required_modifiers`, so it includes instance fields,
static fields, readonly fields, and const fields. The separate
`private_constant_fields` group is required even though it repeats the desired
style: native naming precedence gives a more-specific accessibility + modifier
intersection precedence over an existing general constant rule or a static-field
rule. A private const therefore remains `_MaximumRetries`, regardless of a
broader rule's style. The same shared style applies to private properties,
events, and ordinary methods, such as `_SelectedUser`, `_StateChanged`,
`_ValidateRequest()`, and `_CreateClient()`.

The non-private group explicitly includes all non-private C# accessibilities
(`public`, `protected`, `internal`, `protected_internal`, and
`private_protected`). Its PascalCase style has no required prefix, so names such
as `CurrentUser`, `ValidateRequest()`, and `SharedCache` remain unprefixed. The
existing `CA1707 = none` setting remains unchanged: the native IDE1006 naming
contract, rather than CA1707, owns the intentional private underscore.

This naming contract excludes constructors and destructors, operators and
conversions, indexers, explicit interface implementations, local functions,
parameters, locals, and all nested types. In particular, private nested classes,
structs, interfaces, enums, and delegates are explicitly out of scope: no
`class`, `struct`, `interface`, `enum`, or `delegate` symbol group is added just
because native naming supports those kinds. Extending the contract to private
nested types requires a separately approved design change; it must not be
inferred from the private accessibility alone. The `method` group is intended
for ordinary methods only, and the TDD matrix must prove that language-
constrained method forms do not enter this contract.

Native naming diagnostics are `IDE1006` and use warning severity in the final
root configuration. The naming-rule `severity = warning` controls the IDE, and
the explicit `dotnet_diagnostic.IDE1006.severity = warning` entry makes the same
severity effective for builds; with the repository's warnings-as-errors policy,
nonconforming handwritten members fail the applicable build. This is separate
from PUBLY0012, whose default descriptor remains hidden and whose repository
severity remains warning.

Renaming is symbol-aware and opt-in. The IDE's Rename/code-style action may
preview and update declarations and all references, including references already
written as `this._CurrentUser` or `ContainingType._SharedCache`; there is no
automatic rename on save, format, or build. The design does not require a
native IDE1006 Fix All, and it must not add a custom naming fixer to supply one.
If a host provides a safe symbol-aware IDE1006 Fix All, it may be used only when
filtered to IDE1006 and scoped to a reviewed document, project, or solution. It
must preserve references and respect generated exclusions. Otherwise, use
individual symbol-aware renames in narrow slices, never textual search/replace.
PUBLY0012 Fix All remains the separate
`WellKnownFixAllProviders.BatchFixer` behavior described below.

### Naming generated exclusions

Roslyn-recognized generated files and symbols remain outside IDE1006, including
`[GeneratedCode]`, `*.g.cs`, `*.designer.cs`, `*.generated.cs`, and the
`// <auto-generated />` header convention. The repository-specific EF migration
boundary must be expressed with these path overrides after the global IDE1006
warning is introduced:

~~~ini
[**/Migrations/*.cs]
dotnet_diagnostic.IDE1006.severity = none

[**/Migrations/*.Spec.cs]
dotnet_diagnostic.IDE1006.severity = warning
~~~

The second section deliberately restores enforcement for handwritten migration
specifications. No blanket generated exclusion applies to ordinary handwritten
C# elsewhere. The custom PUBLY0012 analyzer still needs its own shared generated
file predicate and migration-path exception as specified in the existing
generated-code section below.

## Repository constraints and existing seams

The implementation belongs in the existing analyzer package rather than in a
new lint system:

- packages/lint-cs/DiagnosticIds.cs owns PUBLY* constants.
- packages/lint-cs/DiagnosticCatalog.cs owns descriptors.
- Existing analyzers such as CoalesceThrowAnalyzer.cs register syntax actions,
  enable concurrent execution, and opt out of generated code.
- Co-located *.Spec.cs files are compiled by
  packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj, not by the analyzer
  assembly.
- AnalyzerReleases.Unshipped.md is the release-tracking record. The repository
  intentionally keeps all PUBLY* rows unshipped and enables them through
  .editorconfig.
- Directory.Build.props supplies net10.0, nullable, warnings-as-errors, and
  code-style enforcement; the analyzer project overrides its target to
  netstandard2.0 so compiler hosts can load it.
- apps/api/PublyApp.Api.csproj already demonstrates the analyzer-only project
  reference: OutputItemType="Analyzer" plus ReferenceOutputAssembly="false".
- There is no existing code-fix provider. The standard Workspaces
  CodeFixProvider / WellKnownFixAllProviders.BatchFixer shape is therefore the
  compatible extension point, not a competing framework.
- justfile's format recipe runs pnpm/oxfmt and does not format C#. This rule
  must be tested through compiler builds and dotnet format's analyzer command,
  with direct project paths where the solution intentionally omits a project.

apps/api/Program.cs:112 already uses Program.IsOpenApiGenerationProcess. It is a
representative compliant static access, not an implementation target or a
reason to edit Program.cs in this design-only change.

## Rule contract

### Semantic invariant

For each candidate name, the analyzer obtains semantic information at the name
node and reports only when all of the following are true:

1. The name is a reference, not a declaration, and binds successfully to a
   field, property, method, or event symbol.
2. The name is not already under an explicit receiver such as this., base.,
   SomeObject., SomeType., or an explicit interface qualification.
3. The binding is an implicit member lookup rooted at the nearest lexical
   containing named type. The nearest type is the type containing the method,
   accessor, initializer, lambda, local function, or attribute argument in
   which the name occurs; an outer enclosing type is not substituted.
4. The member is accessible at the use site and the successful binding is
   unambiguous. An unresolved name, an ambiguous candidate set, or a candidate
   that cannot be classified as one of the supported member kinds is ignored.
5. The member is not an extension-method lookup, local function, constructor,
   operator, conversion, indexer-only access, nested type, namespace, alias,
   local, parameter, range variable, or type identifier.

Inherited members are included. An accessible member declared on a base class
or inherited interface is part of the current type's implicit lookup set when
the source uses it without a receiver. This is the least surprising reading
of “explicit member access”: this.InheritedValue preserves the same instance
lookup, and DerivedType.InheritedConstant preserves the same static lookup.
Excluding inherited members would leave visually identical implicit references
with an arbitrary declaration-depth exception. The current containing type is
still the qualification used for static fixes, not the base type that happens
to declare the member.

Members reached through an outer containing type are not included. A nested
type does not have an implicit this for its outer instance, and an outer
static member is not a member of the nested type merely because C# permits
access to it. Such access must already be explicit or is outside this rule.

### Supported member kinds and required form

| Resolved symbol | Required replacement | Notes |
| --- | --- | --- |
| Instance IFieldSymbol, IPropertySymbol, IMethodSymbol, or IEventSymbol | this.Member | Includes inherited accessible members, ordinary methods, method groups, delegates, events, fields, properties, and references in field/property/event initializer values. |
| Static IFieldSymbol, IPropertySymbol, IMethodSymbol, or IEventSymbol | ContainingType.Member | Includes constants, static fields, static properties, static methods, and static events. The containing type is the nearest source containing type, closed over its type parameters. |

The member-name syntax can be an IdentifierNameSyntax or a GenericNameSyntax;
the latter is required for generic method references such as
Build<Result>(). The analyzer may use a small shared semantic helper to
classify both forms, but there remains one diagnostic ID, one analyzer, and
one code-fix provider.

### Syntax and edge-case policy

- **Conditional access:** Member?.Run() and Member?[index] are eligible when
  Member is the implicit current-type member. The fix is this.Member?.Run()
  or this.Member?[index]. The MemberBindingExpression after ?. is a member
  of the conditional receiver and is not current-type lookup. this?.Member is
  already explicit and is not reported.
- **Method groups and delegates:** Action action = Run, new Action(Run), and
  method-group arguments are eligible when Run binds to the current type's
  method. Overloaded method groups are reported only when all viable candidates
  agree on the same current-type/staticness classification; an ambiguous or
  mixed candidate set is left untouched. The fix is this.Run or
  ContainingType.Run.
- **nameof:** nameof(Member) is eligible and becomes nameof(this.Member) or
  nameof(ContainingType.Member). The resulting name string is unchanged.
  nameof(other.Member), nameof(base.Member), and nameof(ContainingType.Member)
  are already explicit. nameof must be in the TDD matrix because binding and
  legal qualification in this context differ from an invocation.
- **Object initializers:** The left side of an object initializer is an
  implicit receiver on the object being initialized, not an implicit receiver
  on lexical this. Therefore new Widget { Name = value } does not report Name,
  even when Widget is the current type. Member references in initializer
  values, such as new Widget { Name = DefaultName }, are still analyzed. The
  same distinction applies to with { Name = value }.
- **Collection initializers:** Collection-element syntax and its implicit Add
  target are excluded. Names inside element arguments are still analyzed. This
  prevents the rule from mistaking the collection object's member lookup for a
  lexical current-type lookup.
- **Constructors and initializers:** Member references in constructor bodies,
  instance/static field initializers, property initializers, event initializers,
  and constructor-initializer arguments are analyzed normally. this(...),
  base(...), and constructor declarations themselves are already explicit
  constructor syntax and are not diagnostics. An instance member in a context
  where this is illegal cannot bind successfully and is skipped; static members
  use the type qualification.
- **Attributes and default values:** Static members that C# permits in
  attribute arguments and optional parameter default expressions (normally
  constant fields and enum values) are analyzed and type-qualified. Attribute
  names, named-argument labels, parameter names, and other declaration names
  are not member references. Instance members cannot legally occur in these
  constant/static contexts and therefore do not produce a diagnostic.
- **Static local functions:** A static local function has no this, but it may
  refer to static members of its containing type. Those references use
  ContainingType.Member. A non-static local function uses this.Member for
  instance members. The local function symbol itself is not a supported method
  member and is never reported.
- **Lambdas and anonymous methods:** A non-static lambda/anonymous method uses
  this.Member for an instance member and a type qualification for a static
  member. A static lambda can only use static current-type members and receives
  the type qualification. The nearest lexical named type, not the lambda
  symbol, determines ContainingType.
- **Nested types:** In a nested type, the nearest nested type is the current
  containing type. Its own members and accessible inherited members are in
  scope; outer-type members are not. Generic outer and inner type arguments
  must be retained in a static qualification.
- **Derived types:** A derived type receives diagnostics for accessible
  inherited members under the inherited-member rule above. base.Member is
  already explicit. A private base member that does not bind at the use site is
  not reported.
- **Explicit interface members:** An explicit implementation such as
  void IContract.Run() is already interface-qualified and is not reported.
  References in its body are analyzed against the implementing class in the
  usual way. Calls that require an interface cast remain explicit and are not
  rewritten.
- **Extension methods:** A reduced extension-method invocation is not a
  member of the current containing type and is excluded, even when written as
  an unqualified call. An ordinary method declared on the current type is
  included. A call already written through an extension class is explicit and
  is not reported.
- **Identifiers that are not members:** Locals, parameters, value accessor
  parameters, range variables, labels, pattern variables, type names,
  namespaces, aliases, generic type parameters, and local functions are never
  diagnostics. Property-pattern names and object/with initializer designator
  names are also excluded because their implicit receiver is the matched or
  initialized object, not this.
- **Generic containing types:** The static form must be legal in the current
  generic context. For Container<T>, the intended form is
  Container<T>.Member; for nested generic types the full containing chain and
  all in-scope type arguments are retained. A raw open type such as Container
  must not be emitted when it would require type arguments.
- **Aliases and ambiguity:** An alias or type identifier that shadows a type
  name is not itself a diagnostic. Before offering a static fix, the provider
  must verify that its minimally qualified containing-type syntax binds to the
  same current type at the diagnostic position. If the short form is shadowed
  or ambiguous, it must fall back to a global:: fully qualified type name with
  the correct type arguments. If semantic binding cannot be proven, no code
  action is offered and the analyzer must not report a diagnostic that cannot
  be fixed.

## Diagnostic and configuration

Add the next unused identifier, PUBLY0012, to DiagnosticIds and the unshipped
release table.

- **ID:** PUBLY0012
- **Title:** Use explicit member access
- **Message:** Qualify member access '{0}' with 'this.' or its containing type
- **Category:** PublyApp.Style
- **Default severity:** Hidden
- **Enabled by default:** false
- **Repository severity:** add
  dotnet_diagnostic.PUBLY0012.severity = warning beside the other enforced
  PUBLY* rules in the root .editorconfig.
- **Location:** the identifier or generic-name token being qualified, not the
  whole enclosing expression and not the receiver/member after conditional
  access. This gives one stable squiggle per reference and matches the
  location style of existing analyzer rules.
- **Arguments:** {0} is the source member name, preserving the existing
  descriptor/message assertion pattern. The code-fix provider must not infer
  static versus instance from message text; it re-resolves the symbol.

The descriptor remains dormant outside this repository's explicit
.editorconfig opt-in, matching AnalyzerReleases.Unshipped.md. Within this
repository, warning plus TreatWarningsAsErrors makes violations fail builds.
No new severity switch, baseline file, suppression convention, or custom
configuration key is introduced.

### Generated code

The analyzer must call
ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None) and enable
concurrent execution, matching existing packages/lint-cs analyzers. This
excludes Roslyn-recognized generated files and generated symbols, including
[GeneratedCode], *.g.cs, *.designer.cs, *.generated.cs, and the
// <auto-generated /> header convention.

The repository also treats apps/api/Migrations/*.cs as EF-generated output in
its .editorconfig. Because EF migration operation files and the model snapshot
are not all marked with a recognized generated header, the shared generated-file
predicate must additionally exclude the Migrations source directory for this
rule, while explicitly allowing *.Spec.cs files in that directory. This
preserves handwritten migration specifications in the test project and avoids
silently linting generated migration output. No blanket exclusion applies to
ordinary handwritten C# elsewhere.

The generated-code test matrix must cover both Roslyn recognition and this
repository-specific migration boundary. The generated exclusion is analyzer
behavior, not an .editorconfig severity override.

## Analyzer and code-fix shape

### One analyzer

Implement one sealed DiagnosticAnalyzer in packages/lint-cs, for example
ExplicitMemberAccessAnalyzer, with one supported descriptor. Register syntax
actions for IdentifierName and GenericName and immediately reject nodes that
are declaration names or excluded syntax positions. Resolve the symbol through
the semantic model, find the nearest containing named type, classify the symbol
and receiver context, and report the one descriptor at the name's location.

The analyzer must not rely on identifier casing, source text, or a list of known
class names. It must use ISymbol identity (SymbolEqualityComparer) and actual
binding at the use site. A shared helper may return the member, current type,
and desired qualification kind so the code fix and analyzer cannot drift.

### One code-fix provider

Implement one CodeFixProvider in packages/lint-cs, for example
ExplicitMemberAccessCodeFixProvider, exporting only PUBLY0012. It creates one
code action per diagnostic:

- instance member: replace the name node with this. plus the original name;
- static member: replace the name node with the verified minimally sufficient
  current containing type plus . plus the original name.

The provider uses the same semantic helper as the analyzer and revalidates the
diagnostic before offering the action. It must not offer a speculative fix for
an ambiguous binding, excluded syntax position, or a qualification that would
bind to a different type/member. Add the Workspaces package dependency needed
by CodeFixProvider/DocumentEditor and the standard code-fix testing package
through central package management, keeping analyzer/tooling dependencies
private to analyzer/test projects.

Use WellKnownFixAllProviders.BatchFixer for document, project, and solution Fix
All. Fix All must process each diagnostic once, preserve the same semantic
classification, and leave newly qualified nodes diagnostic-free. It must not
run an unrestricted formatter or rewrite unrelated diagnostics.

### Qualification, trivia, and formatting

The replacement node must preserve the original name's leading and trailing
trivia, including comments, whitespace, directives, and newlines. Child trivia
inside a generic name must also survive. Inserted this. or type syntax must be
attached without normalizing neighboring source.

For static members, select the shortest containing-type syntax that binds to the
current type at the use site, retaining generic arguments. Prefer the normal
source spelling (ContainingType.Member) when it is unique; use qualified
namespace syntax only when required by an alias, shadowing, or ambiguity. Use
the fully qualified global::Namespace.ContainingType<...>.Member form as the
safe fallback. The provider must verify the replacement's symbol before
returning the document. It must never qualify with the base declaration type
when the requested current containing type is a derived type.

The code fix is a syntax replacement, not a formatting pass. Existing
.editorconfig formatting remains authoritative and can be run separately after
the targeted fix. Code-fix tests must assert exact fixed text for comments and
unusual whitespace.

## Project wiring and enforcement coverage

The applicable first-party C# projects are:

| Project | Enforcement plan | Coverage path |
| --- | --- | --- |
| apps/api/PublyApp.Api.csproj | Keep the existing analyzer-only ProjectReference. | Included in PublyApp.slnx, quality-gate build, just build-api, and API builds. |
| apps/api/Tests/PublyApp.Api.Tests.csproj | Add an explicit analyzer-only reference; do not rely on analyzer transitivity from the API project. | Compiles linked API *.Spec.cs, Lib/Testing, and test sources, so API specs and test infrastructure are checked. |
| apps/apphost/PublyApp.AppHost.csproj | Add an explicit analyzer-only reference. | AppHost is deliberately omitted from PublyApp.slnx but is compiled by AppHostOrchestrationGuardSpec and covered by the apps/apphost/** API-test path filter. |
| packages/scripts-cs/PublyApp.Scripts.csproj | Add an explicit analyzer-only reference. | Included in PublyApp.slnx and built both as a solution project and by API translation-key generation. |
| packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj | Use one ProjectReference that retains the normal compile-time reference and also sets OutputItemType="Analyzer"; keep ReferenceOutputAssembly="true". | just test-analyzers and the quality gate run this project; its linked co-located specs are therefore checked by the rule. |
| packages/lint-cs/PublyApp.Analyzers.csproj | Deliberately do not reference itself as an analyzer. | Its implementation source is the one self-analysis exclusion; behavior is tested through the dedicated runner. |

For the analyzer test project, one ProjectReference must both compile the
AnalyzerUnderTest aliases/test helpers and add the project output to Roslyn's
analyzer inputs: set OutputItemType="Analyzer" while leaving
ReferenceOutputAssembly="true". Consumer projects use the existing
analyzer-only form with ReferenceOutputAssembly="false". This avoids duplicate
project-reference items, preserves the test runner's compile-time API, and does
not compile analyzer source into the test runner.

Do not add the analyzer project to PublyApp.slnx: omission of AppHost and
analyzer projects is deliberate. Direct project commands and existing
API-test/quality-gate entrypoints are the enforcement surface. Do not
centralize this through a broad Directory.Build.* auto-reference that could
reintroduce self-reference or change solution topology.

The analyzer test project must add the standard C# code-fix testing package and
cover both analyzer diagnostics and exact code-fix output. No production or
runtime project receives a code-fix dependency; only the analyzer assembly
needs Workspaces APIs, and Roslyn package references remain private.

## Migration sequencing

The naming and access migrations must avoid mixed logic/style diffs and keep
intermediate builds under control. The native naming contract is staged before
its root warning is enabled:

1. Add the exact native naming symbols, styles, rules, and focused naming
   fixtures in a temporary/test configuration. Do not enable root IDE1006
   warning yet. Confirm private static and const fields, private properties,
   events, and ordinary methods all use underscore + PascalCase; confirm
   parameters and locals remain camelCase and private nested types remain out
   of scope.
2. Measure IDE1006 violations over each applicable handwritten project,
   separately recording generated files, EF migration output, and migration
   specs. Record counts and categories outside the source diff; do not add a
   baseline file.
3. Apply only symbol-aware IDE1006 renames in narrow project or directory
   slices. Do not depend on a native IDE1006 Fix All; if the host provides one,
   it may be used only after review confirms that declarations and references
   are updated safely. Do not run a broad formatter or textual replacement.
   Preserve comments, directives, test fixture data, and references that are
   already explicitly qualified.
4. Re-scan until every applicable handwritten file is clean. Add the final root
   naming block, including `dotnet_diagnostic.IDE1006.severity = warning` and
   the Migrations/`*.Spec.cs` path override, only after the rename migration is
   clean. The enforcement flip must be a small configuration change rather than
   a large mixed refactor/build failure.
5. Add descriptor/ID/release row, analyzer, code fix, and focused specs in
   dormant mode. Focused tests explicitly add a minimal .editorconfig enabling
   PUBLY0012, as existing analyzer specs do.
6. Wire the five consuming projects while the root PUBLY0012 rule remains
   absent from .editorconfig. Build each consumer to prove assembly loading and
   no runtime dependency. This phase changes wiring only.
7. Measure the existing PUBLY0012 violation set with a diagnostic-filtered
   analyzer scan over each applicable project. Record count and categories
   outside the source diff; do not add a baseline file.
8. Apply only the new PUBLY0012 code fix, filtered to PUBLY0012, in narrow
   project or directory slices. Do not run a broad dotnet format pass that also
   applies IDE/CA rules. Keep each migration commit mechanically style-only and
   review it with word-level diff and compile checks. Preserve comments,
   directives, and test fixture data.
9. Re-scan until every applicable handwritten file is clean. Add the root
   PUBLY0012 warning only after the code-fix migration is clean, so its
   enforcement flip is also a small configuration change.
10. Run focused analyzer/code-fix tests, native naming checks, all direct
    consumer builds, solution quality build, and repository analyzer/API gates.
    The final migration diff should contain only the naming contract, rule,
    tests/wiring, configuration, and explicit member-access edits.

The current Program.cs:112 form must remain unchanged. Any future change to that
site should be recognized as already compliant.

## TDD matrix

The new co-located ExplicitMemberAccessAnalyzer.Spec.cs must use the existing
XUnit Roslyn testing style: explicit enable config, marked locations, exact
message assertions, raw-compilation coverage for default-off behavior, and
generated-file-name tests. Add native IDE1006 naming fixtures using the same
exact .editorconfig symbols/styles/rules; those fixtures test Roslyn's native
naming engine and must not introduce a second custom naming analyzer. Add a
code-fix spec using the standard C# code-fix test harness.

| Area | Representative source | Expected result |
| --- | --- | --- |
| Instance fields/properties/events | Field, Property, Event used in a method/accessor | Diagnostic at each name; fix to this.Field, etc. |
| Instance methods | Run() and Run as a method group | Diagnostic/fix to this.Run() and this.Run. |
| Static fields/properties/methods/events | Default, Setting, Build(), Changed | Diagnostic/fix to Example.Default, etc. |
| Private naming contract | `private User _CurrentUser`, `private string _SelectedUser`, `private event EventHandler? _StateChanged`, `private void _ValidateRequest()` | No IDE1006 diagnostic; `CurrentUser`, `SelectedUser`, `StateChanged`, and `ValidateRequest` are IDE1006 diagnostics with symbol-aware rename to the underscored PascalCase form. |
| Private static and const naming | `private static Cache _SharedCache`, `private const int _MaximumRetries = 3` | Both are compliant; a private const follows the explicit const intersection rather than a broader constant/static rule. |
| Non-private naming | `public User CurrentUser`, `protected void ValidateRequest()`, `internal event EventHandler StateChanged` | PascalCase without an underscore; underscored variants are IDE1006 diagnostics. |
| Parameters and locals | `void _ValidateRequest(string request) { var selectedUser = request; }` | `request` and `selectedUser` remain camelCase and are not covered by the private-member rule. |
| Naming exclusions | private constructor/destructor, operator/conversion, indexer, explicit interface member, and private nested type | No diagnostic from this contract; no symbol group broadens the four member categories. |
| Naming qualification interaction | `this._CurrentUser`, `this._ValidateRequest()`, `ContainingType._SharedCache` | Already-qualified references remain unchanged; renames update these references symbolically. |
| Naming generated boundaries | generated attribute/header/file names, EF migration output, and `Migrations/*.Spec.cs` | Generated output and migration output are clean; migration specs remain subject to IDE1006. |
| Naming rename/Fix All | multiple private declarations and qualified references | Individual IDE1006 Rename updates declarations and all references; any host-provided Fix All is optional, explicitly scoped, and symbol-aware, never on save/build or by text replacement. |
| Generic method names | Build<Result>(), delegate to Build<Result> | Diagnostic at GenericNameSyntax; preserve type arguments. |
| Conditional access | Member?.Call() and Member?[index] | Qualify only receiver name; do not touch conditional member binding. |
| nameof | nameof(Instance) and nameof(Default) | Qualify syntax; resulting runtime name text is unchanged. |
| Object/with initializers | new Example { Property = Value }, example with { Property = Value } | No diagnostic for designators; diagnostic for current-type Value in the value expression. |
| Collection initializers | new List<Example> { Value }, custom Add target | No diagnostic for target/element binding; analyze current-type names in arguments. |
| Constructors | constructor body, field/property initializer, : base(Default), : this(Default) | Body/initializer references qualify; constructor syntax untouched. |
| Attributes/defaults | attribute static argument and optional parameter = Default | Static type qualification; labels and type names unchanged. |
| Static local function | static local reads Default | ContainingType.Default; no this is introduced. |
| Lambda/anonymous method | instance/static lambdas and anonymous methods | Correct this or type qualification. |
| Nested type | nested member and outer static/instance reference | Nearest nested type used; outer instance members not reported. |
| Derived/inherited | accessible base instance/static member | this.BaseMember or Derived.BaseMember; base.Member is clean. |
| Explicit interface | void IContract.Run() and member use inside body | Explicit declaration/call clean; body follows implementing type. |
| Extension methods | reduced extension call and ordinary current-type method | Extension call clean; ordinary current member diagnosed. |
| Non-members | local, parameter, value, range/pattern variable, type, alias, namespace, local function | No diagnostics. |
| Ambiguous/incomplete code | unresolved identifier, ambiguous candidate | No diagnostic and no unsafe code action. |
| Generic containing type | Container<T>.Default, nested Outer<T>.Inner<U>.Default | Correct closed qualification, never an illegal raw open type. |
| Alias/shadowing | short containing name made ambiguous | Semantic analysis; minimally sufficient or global:: fallback. |
| Generated attribute | [GeneratedCode] around violating code | No diagnostic. |
| Generated file names | Generated.g.cs, Designer.designer.cs, Generated.generated.cs, auto-generated header | No diagnostic. |
| EF migration output | non-spec file under apps/api/Migrations | No diagnostic. |
| Migration spec | violating reference in Migrations/Example.Spec.cs | Diagnostic; proves exception is not blanket directory exclusion. |
| Default-off descriptor | raw compilation without editorconfig enablement | No PUBLY0012; enabled harness reports it. |
| Trivia | comments before/after name, generic-argument comments, directives/newlines | Exact fixed output preserves trivia and line structure. |
| Fix All | multiple instance/static diagnostics in document/project/solution | All and only PUBLY0012 sites fixed; second analysis clean. |

### Non-vacuity mutations

The tests must demonstrate that both paths are live, not merely assert clean
output or rely on a self-mocked analyzer:

1. Start with an enabled instance fixture containing return Member; and an
   expected PUBLY0012. Temporarily mutate only that use to return this.Member;
   without changing the expected diagnostic. The analyzer test must fail with
   the expected diagnostic missing. Restore the violating fixture.
2. Start with an enabled static fixture containing return Default; and an
   expected PUBLY0012. Temporarily mutate only that use to
   return Example.Default;. The test must fail for the missing diagnostic.
   Restore the violating fixture.
3. Temporarily disable analyzer registration or make the code-fix provider
   return the original node in a local, uncommitted mutation. The code-fix test
   must fail its exact fixed-source assertion.
4. For wiring, temporarily remove the analyzer-only reference from one
   consumer, inject a temporary instance offender and a temporary static
   offender into that project's source set, and run its focused build. Both
   must fail under warnings-as-errors. Remove temporary source and restore the
   reference. This is evidence for both paths at the project boundary, not a
   committed guard or baseline.
5. For native naming, temporarily mutate compliant `_CurrentUser` to
   `CurrentUser`, `_SharedCache` to `SharedCache`, and `CurrentUser` on a
   public member to `_CurrentUser`. IDE1006 must report each wrong form while
   leaving `request` and `selectedUser` unchanged. Restore the compliant names
   before any root warning is enabled.

Record mutation commands/transcripts in implementation handoff or review
evidence, never in production source and never as a committed always-red test.

## Verification commands

These are the intended verification surface after implementation. This
design-only turn does not run heavy builds or test suites.

### Focused analyzer/code-fix checks

~~~bash
dotnet restore packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj
dotnet test packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj \
  -c Release --no-restore --nologo
dotnet test packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj \
  -c Release --no-restore --nologo \
  --filter 'FullyQualifiedName~ExplicitMemberAccess'
dotnet build packages/lint-cs/PublyApp.Analyzers.csproj \
  -c Release --no-restore --nologo
~~~

The repository shortcut must remain green and is the CI entrypoint:

~~~bash
just test-analyzers
~~~

### dotnet format applicability

just format is only the existing pnpm/oxfmt check and does not exercise this
C# rule. dotnet format is applicable because the consumer project loads the
analyzer and root .editorconfig enables PUBLY0012. Use the analyzer command,
diagnostic filter, warning severity, and direct project paths:

~~~bash
dotnet format apps/api/PublyApp.Api.csproj analyzers \
  --diagnostics PUBLY0012 --severity warn --no-restore --verify-no-changes
dotnet format apps/api/Tests/PublyApp.Api.Tests.csproj analyzers \
  --diagnostics PUBLY0012 --severity warn --no-restore --verify-no-changes
dotnet format apps/apphost/PublyApp.AppHost.csproj analyzers \
  --diagnostics PUBLY0012 --severity warn --no-restore --verify-no-changes
dotnet format packages/scripts-cs/PublyApp.Scripts.csproj analyzers \
  --diagnostics PUBLY0012 --severity warn --no-restore --verify-no-changes
dotnet format packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj analyzers \
  --diagnostics PUBLY0012 --severity warn --no-restore --verify-no-changes
~~~

During migration, remove --verify-no-changes only for the explicitly filtered,
narrow project slice being fixed. Do not run root-level dotnet format and assume
it includes AppHost or analyzer tests: the solution intentionally omits those
projects. Keep `--diagnostics PUBLY0012` as an explicit filter; omitting it may
apply unrelated IDE/CA fixes and create a mixed diff. Native naming is audited
with IDE1006 diagnostics and symbol-aware Rename; do not assume dotnet format
can perform a naming Fix All. Any host-specific naming Fix All must be reviewed
and previewed before use.

### Consumer and repository checks

Use the pinned environment when a build runs API OpenAPI generation:

~~~bash
dotnet build apps/api/PublyApp.Api.csproj -c Test --no-restore \
  -p:OpenApiGenerateDocuments=false --nologo
dotnet build apps/api/Tests/PublyApp.Api.Tests.csproj -c Test --no-restore --nologo
dotnet build apps/apphost/PublyApp.AppHost.csproj -c Debug --no-restore \
  -p:OpenApiGenerateDocuments=false --nologo
dotnet build packages/scripts-cs/PublyApp.Scripts.csproj -c Debug --no-restore --nologo
APP_ROLE=api TRUSTED_PROXY_CIDRS='127.0.0.1/32' \
  SOCIAL_ACCOUNTS_MASTER_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' \
  dotnet restore PublyApp.slnx
APP_ROLE=api TRUSTED_PROXY_CIDRS='127.0.0.1/32' \
  SOCIAL_ACCOUNTS_MASTER_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' \
  dotnet build PublyApp.slnx --no-restore --nologo
~~~

The implementation PR must also run the repository gates appropriate to scope:

~~~bash
just ci-quality-dotnet
just test-analyzers
just test-api
~~~

just ci is the final pre-push gate when migration is complete. Docker, database
integration, OpenAPI generation, and full repository gate are deliberately not
run for this design-only turn.

## Risks and exclusions

### Risks and mitigations

- **Roslyn binding subtleties:** nameof, method groups, conditional access,
  attributes, and initializer designators do not all expose the same syntax
  shape. The semantic helper and matrix must gate reporting; no text-only
  fallback is allowed.
- **Qualification changes binding:** aliases, generic type parameters, nested
  generic types, and derived static members can make a short type name bind
  elsewhere. Rebind replacement and use the global:: fallback; otherwise offer
  no fix and do not report.
- **Inherited static member expectations:** the design deliberately qualifies
  through the current derived type, matching the “current containing type” rule.
  A future request to qualify through declaration/base types is a separate
  semantic change with new tests.
- **Generated output drift:** standard Roslyn generated recognition does not
  cover every EF migration file here. The explicit migration boundary and its
  *.Spec.cs exception must stay tested.
- **Naming generated output drift:** native IDE1006 and PUBLY0012 have separate
  generated-code mechanisms. Test both Roslyn-generated recognition and the
  repository's Migrations/`*.Spec.cs` path exception for each mechanism.
- **Large migration diff:** enabling the rule across tests may touch many files.
  Filtered, staged sequence and per-project Fix All prevent unrelated formatting
  or logic edits from hiding in the migration.
- **Analyzer load dependencies:** Workspaces APIs must remain private and the
  analyzer must remain loadable as netstandard2.0. Build analyzer and a real
  consumer before enabling root severity.
- **Native naming overlap:** IDE1006 is shared by all native naming rules. Keep
  the four-category symbol groups exact, add the private-const intersection,
  and do not introduce a wildcard naming group or unrelated naming rule. The
  final IDE1006 build severity must match the naming-rule warning severity.
- **Native naming fixer scope:** Rename/Fix All can update declarations and
  references, so it must remain an explicit symbol-aware operation with review
  preview. It must never become an automatic save/build rewrite or a textual
  replacement pass.

### Explicit exclusions

The rule does not cover type names, locals, parameters, aliases, namespaces,
range/pattern variables, local function declarations, constructors, operators,
conversions, indexers, extension methods, explicit receivers, private nested
types, or non-ordinary method forms, object/collection initializer targets,
property-pattern targets, generated code, or ambiguous/incomplete bindings. It
does not modify runtime code, public contracts, project topology, solution
membership, or the existing C# format recipe. The native naming contract has
the same four-category boundary; it does not silently add naming rules for
nested types or other symbol kinds.

## Rollback

Rollback is additive and reversible:

1. Remove the root native naming block and its IDE1006/Migrations path
   overrides to stop naming enforcement while retaining the focused fixtures.
2. Revert the isolated symbol-aware naming migration separately; do not undo
   unrelated member-access or logic changes.
3. Remove root .editorconfig PUBLY0012 warning entry to stop enforcement while
   retaining dormant analyzer and tests.
4. If project wiring causes load/build issues, remove only new analyzer-only
   project references; retain normal analyzer test compile references as needed
   for tests.
5. Revert the isolated member-access migration commit separately from analyzer
   implementation. Do not revert unrelated logic or formatting.
6. If the rule itself is unsafe, remove its unshipped release/catalog/ID,
   code-fix, and focused tests in one reviewed revert. No runtime rollback or
   data migration is required.

## Acceptance criteria

The implementation is acceptable only when all of the following are true:

- Exactly one PUBLY0012 analyzer and one PUBLY0012 code-fix provider exist in
  packages/lint-cs; no second lint framework or bespoke baseline exists.
- The root .editorconfig contains exactly the documented native naming groups,
  styles, rules, private-const precedence intersection, IDE1006 warning
  severity, and Migrations/`*.Spec.cs` generated overrides. No naming group
  broadens the contract to private nested types or other symbol categories.
- Handwritten private fields, properties, events, and ordinary methods use
  underscore + PascalCase, including static and const fields; non-private
  members in those categories use PascalCase without an underscore; parameters
  and locals remain camelCase.
- The semantic invariant and inherited-member policy are implemented exactly as
  documented, with no false positives for excluded syntax/symbol classes.
- Every supported diagnostic has a safe single fix and participates in
  document/project/solution Fix All; fixed output preserves trivia and remains
  free of PUBLY0012.
- Analyzer tests cover the complete matrix, default-off/configured behavior,
  generated boundaries, trivia, generic/alias cases, and non-vacuity mutations
  for both instance and static paths.
- Native IDE1006 fixtures cover private/static/const and non-private members,
  parameters/locals, language-constrained forms, private nested types,
  generated boundaries, const-rule precedence, exact rename/reference behavior,
  and the host-specific optional Fix All fallback without requiring a custom
  naming fixer.
- apps/api, API tests/specs, AppHost, scripts-cs, and analyzer tests receive
  enforcement; analyzer implementation project does not self-reference.
- Unshipped catalog/release record and root .editorconfig agree with descriptor,
  and warnings-as-errors catches a temporary offender in each instance/static
  path at each consumer boundary.
- Focused tests, direct consumer builds, filtered dotnet format checks,
  just test-analyzers, solution quality build, and required API gate pass at
  implementation tip.
- Migration diff contains only explicit member-access style edits plus the
  analyzer/code-fix/tests/wiring/configuration required by this design; no
  unrelated production behavior or generated output is changed.
