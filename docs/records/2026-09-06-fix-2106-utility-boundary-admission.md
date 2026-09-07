# Utility boundary guard admission — issue #2106

Date: 2026-09-07

Scope: the frontend guard that keeps date/time formatting and clipboard writes
behind the canonical SSR-safe utilities.

## Decision

Keep the guard in `apps/front/scripts/guards/` and use the installed TypeScript
checker through `ts-morph`. It owns only exact source access to the real global
`Intl.DateTimeFormat` and `navigator.clipboard.writeText`, including static
computed members, `globalThis`/`window` prefixes, statically initialized `const`
root aliases, and recursively nested object-binding paths. It distinguishes
those roots by checker-resolved declarations plus the static expression path;
structural `typeof Intl`/`typeof navigator` lookalikes are not global identity.
It never bans the broader `Intl` or `navigator.clipboard` objects and does not
chase opaque runtime values or arbitrary runtime alias flow.

Guard-family wiring remains the responsibility of the reviewed package scripts
and required CI chain. `check-guard-coverage` only checks its two wrapper rules;
it contains no aggregate reachability assertion or guard-of-guard.

## Admission evidence

1. Behavioral utility tests prove the canonical implementations, but cannot
   detect a second implementation elsewhere. TypeScript typechecking does not
   enforce this source-ownership policy, and the existing dayjs rule has a
   narrower component-import scope.
2. The smallest mechanism is one recursive source scanner, one checker program,
   declaration-identity/static-path resolution, and binding-element checks for
   the admitted object-binding forms. No dependency, shell parser, baseline, or
   allowlist was added. Maintenance cost is explicit and bounded: each newly
   admitted syntax/root form requires one resolver branch plus a positive and
   negative fixture; TypeScript checker API changes can require updating that
   resolver. The focused guard suite is the maintenance surface and has no
   aggregate meta-guard.
3. The focused RED/GREEN proof includes the original thirteen protected forms,
   the five newer source-origin forms, the six exact second-reset probes
   (typed lookalikes, nested real-global bindings, and statically initialized
   root aliases), unrelated NumberFormat/readText controls, legitimate shadowed
   locals, and fail-closed source-tree/parse cases.
4. The admitted static scope is direct, computed-static, parenthesized/cast,
   `globalThis`/`window`-prefixed, statically initialized `const` alias,
   recursively nested object-binding, assignment-origin, bind/call-origin,
   source-wrapper, re-export, and import-origin forms where the protected
   source expression is statically present. The guard does not claim arbitrary
   function return flow, dynamic property names, `eval`, dynamic module loading,
   reflection, or opaque runtime values.
5. The audit parser uses the installed TypeScript checker graph for direct,
   aliased, namespace, default, `export *`, and `export type *` semantics.
   Parse diagnostics remain fatal. Same-name raw occurrences are retained only
   as `sameNameOccurrences`; no such row is caller evidence.
6. Classification decisions derive from immutable old-front/current analysis
   plus explicit reviewed overrides in this source. The previous classification
   artifact is not an input. The parser self-test mutates a prior-artifact
   fixture and proves regenerated decisions are unchanged.

## Exact guard reproduction

Pre-fix, pinned to the reviewed baseline (the six second-reset probes are
expected to expose the remaining false positives/negatives):

```bash
git worktree add --detach /tmp/publyapp-2106-pre 0ca6f07ce4aadd407f35471065ded4a33daf5d13
pnpm --dir /tmp/publyapp-2106-pre --filter front test:utility-boundaries
git worktree remove /tmp/publyapp-2106-pre
```

Post-fix, from the corrected worktree:

```bash
pnpm --filter front test:utility-boundaries
pnpm --filter front check:utility-boundaries
```

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
