# Utility boundary guard admission — issue #2106

Date: 2026-09-06
Scope: the frontend guard that keeps date/time formatting and clipboard writes
behind the canonical SSR-safe utilities.

## Decision

Keep the guard in the existing `apps/front/scripts/guards/` surface and use the
already-installed TypeScript compiler API through `ts-morph`. Extend the
existing `check-guard-coverage` analyzer only to pin the two invocations in the
real `test:ci-non-vitest` aggregate. No dependency, parser framework, baseline,
allowlist, or guard-of-guard was added.

The existing `publy/no-direct-dayjs-in-components` lint rule is not a complete
replacement: it is scoped to direct package imports in component `.tsx` files,
while this invariant also covers route and utility source, browser-global
property aliases, statically resolvable cross-file exports, parse diagnostics,
filesystem boundaries, and aggregate reachability. The guard's AST work is
therefore restricted to that missing surface.

## Admission evidence

1. **Current reproducible failure and critical invariant.** The candidate guard
   reported only exact source text. A temporary production mutation using a
   local formatter alias, computed/global roots, optional clipboard calls, and
   receiver-preserving `.bind` indirection passed the real scanner. An invalid
   production file and an empty source root also passed. The protected invariant
   is security and runtime integrity: spreadsheet formula content must be
   neutralized, and browser APIs must remain behind the SSR-safe utility
   boundary used by the shipped front.
2. **Why a simpler mechanism is insufficient.** Behavioral utility tests prove
   the canonical implementations, but cannot detect a second implementation
   added elsewhere. TypeScript typechecking accepts all of the aliases and does
   not enforce this repository policy. The existing lint rule does not walk
   route/source utility files, resolve cross-file aliases, reject malformed
   source scans, or prove CI aggregate reachability. A text grep is both less
   precise and easier to bypass.
3. **Smallest mechanism and maintenance cost.** The guard keeps one recursive
   scanner, one TypeScript program, and one symbol resolver. It uses `ts-morph`
   already present in `packages/lint-ts`; no new package or abstraction was
   introduced. The maintenance cost is bounded to the two canonical utility
   paths, the static alias forms covered by the focused fixtures, and the
   `test:ci-non-vitest` command names. A future utility relocation, source
   extension, or supported compiler/module-resolution change must update the
   scanner and its fixtures in the same change.
4. **Red/green proof.** Before the correction, the focused utility command
   passed 3 tests and failed 4 new adversarial tests; the aggregate coverage
   command passed 12 tests and failed the new mutation case. The C0 utility and
   live-export command initially failed 2 tests and passed 4. After the
   correction, the same focused suites pass with the canonical source tree and
   restored package scripts. Any temporary filesystem mutation is created and
   removed by the focused test process.
5. **Fail-closed behavior.** The scanner rejects a missing/non-`src` root,
   symlink or cycle, empty/unsupported source scans, and unparseable production
   source. The aggregate analyzer rejects a missing aggregate when its strict
   mode is used and reports each missing utility invocation by script name.
6. **Retirement or replacement condition.** Remove this guard when a supported
   standard lint/compiler mechanism resolves the same static cross-file browser
   API boundary, validates the source tree, and guarantees that the canonical
   check is reachable from the required front aggregate. Replace it with that
   standard mechanism and delete the scanner plus its tests together; until all
   three guarantees are independently present, removing the guard recreates the
   demonstrated bypass.

## Static-analysis ceiling

The guard follows only statically resolvable TypeScript syntax: transparent
wrappers, local bindings, destructuring, static property names, global/window
roots, bound clipboard methods, and resolvable imports/exports. Arbitrary runtime
property names, `eval`, dynamic module loading, reflection, and values returned
by opaque functions are undecidable without executing the application and are
outside the guard's contract. They must not be treated as evidence that the
canonical boundary is safe; a future statically equivalent form belongs in the
resolver and its adversarial fixture matrix.
