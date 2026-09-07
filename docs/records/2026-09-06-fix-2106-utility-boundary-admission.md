# Utility boundary guard admission — issue #2106

Date: 2026-09-07

Scope: the frontend guard that keeps date/time formatting and clipboard writes
behind the canonical SSR-safe utilities.

## Decision

Keep the guard in `apps/front/scripts/guards/` and use the installed TypeScript
checker through `ts-morph`. It owns only exact source access to the real global
`Intl.DateTimeFormat` and `navigator.clipboard.writeText`, including static
computed members, globalThis/window prefixes, exact aliases, and object-binding
forms. It never bans the broader `Intl` or `navigator.clipboard` objects and
does not chase opaque runtime values.

Guard-family wiring remains the responsibility of the reviewed package scripts
and required CI chain. `check-guard-coverage` only checks its two wrapper rules;
it contains no aggregate reachability assertion or guard-of-guard.

## Admission evidence

1. Behavioral utility tests prove the canonical implementations, but cannot
   detect a second implementation elsewhere. TypeScript typechecking does not
   enforce this source-ownership policy, and the existing dayjs rule has a
   narrower component-import scope.
2. The smallest mechanism is one recursive source scanner, one checker program,
   exact protected-member symbols, and binding-element checks for the two
   destructuring forms. No dependency, shell parser, baseline, or allowlist was
   added.
3. The focused RED/GREEN proof includes the original thirteen protected forms,
   the five newer source-origin forms, unrelated NumberFormat/readText controls,
   legitimate shadowed locals, and fail-closed source-tree/parse cases.
4. The audit parser uses the installed TypeScript checker graph for direct,
   aliased, namespace, default, `export *`, and `export type *` semantics.
   Parse diagnostics remain fatal. Same-name raw occurrences are retained only
   as `sameNameOccurrences`; no such row is caller evidence.
5. Classification decisions derive from immutable old-front/current analysis
   plus explicit reviewed overrides in this source. The previous classification
   artifact is not an input. The parser self-test mutates a prior-artifact
   fixture and proves regenerated decisions are unchanged.

## Static-analysis ceiling

The guard proves source ownership, not arbitrary value flow. It detects exact
checker-identified protected members and bindings in direct, computed,
parenthesized/cast, globalThis/window, assignment, bind/call, destructuring,
wrapper, re-export, and import-origin source forms. It does not claim to solve
dynamic property names, `eval`, dynamic module loading, reflection, or opaque
runtime values.

Reachability is outside this guard's claim: reviewed package wiring and required
CI own whether the utility tests run.

## Replacement condition

Replace this guard only when a supported standard lint/compiler mechanism
resolves the same exact source-origin boundary and validates the source tree;
delete the scanner and its tests together at that point.
