# Utility boundary guard admission — issue #2106

Date: 2026-09-07

Scope: the frontend guard that keeps date/time formatting and clipboard writes
behind the canonical SSR-safe utilities.

## Decision

Keep the guard in `apps/front/scripts/guards/` and use the installed TypeScript
checker through `ts-morph`. It owns only exact source access to the real global
`Intl.DateTimeFormat` and `navigator.clipboard.writeText`, including static
computed members, `globalThis`/`window` prefixes, statically initialized `const`
root aliases, ordinary intermediate `BindingElement` aliases, and recursively
nested object-binding paths. Object-rest aliases are explicitly outside the
admitted ceiling because a rest binding does not identify a named protected
property path. It distinguishes those roots by checker-resolved declarations
plus the static expression path; structural `typeof Intl`/`typeof navigator`
lookalikes are not global identity. It never bans the broader `Intl` or
`navigator.clipboard` objects and does not chase opaque runtime values or
arbitrary runtime alias flow.

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
   negative fixture; ordinary intermediate `BindingElement` aliases reuse the
   existing binding-path resolver, while object-rest remains an explicit
   negative ceiling fixture. TypeScript checker API changes can require updating
   that resolver. The focused guard suite is the maintenance surface and has no
   aggregate meta-guard.
3. The focused RED/GREEN proof includes the original thirteen protected forms,
   the five newer source-origin forms, the six exact second-reset probes
   (typed lookalikes, nested real-global bindings, and statically initialized
   root aliases), the three intermediate `BindingElement` alias positives, two
   object-rest out-of-scope negatives, the six exact statically computed binding
   probes (including the four Sol probes), reassigned `let`/`var` destructured
   alias negatives, unrelated NumberFormat/readText controls, legitimate
   shadowed locals, computed identifier keys resolving to unrelated members,
   and fail-closed source-tree/parse cases.
4. The admitted static scope is direct, statically literal computed binding
   names, parenthesized/cast,
   `globalThis`/`window`-prefixed, statically initialized `const` alias,
   ordinary intermediate `BindingElement` alias, recursively nested
   object-binding, assignment-origin, bind/call-origin, source-wrapper,
   re-export, and import-origin forms where the protected source expression is
   statically present. Statically literal computed binding names and stable
   `const` destructuring are supported. Mutable `let`/`var` destructured aliases
   and object-rest aliases are outside source-ownership scope; the guard does not
   implement write-aware flow. It also does not claim arbitrary function return
   flow, dynamic property names, `eval`, dynamic module loading, reflection, or
   opaque runtime values.
5. The audit parser uses the installed TypeScript checker graph for direct,
   aliased, namespace, default, `export *`, and `export type *` semantics.
   Parse diagnostics remain fatal. Same-name raw occurrences are retained only
   as `sameNameOccurrences`; no such row is caller evidence. This audit-parser
   evidence is separate from the scanner's source-ownership ceiling: stable
   `const` destructuring and statically literal computed binding names are
   supported by the scanner proof, while mutable `let`/`var` destructured aliases
   and object-rest aliases remain outside source-ownership scope.
6. Classification decisions derive from immutable old-front/current analysis
   plus explicit reviewed overrides in this source. The previous classification
   artifact is not an input. The parser self-test mutates a prior-artifact
   fixture and proves regenerated decisions are unchanged.

## Exact guard reproduction

Pre-fix, pinned to committed parent `d479da8df780472f13005d09b1b3fe6ad7578fe2`.
This disposable command overlays the current probe file—including the six
computed-binding positives, the four exact Sol probes, the reassigned `let`/`var`
negatives, and the computed-identifier negative—onto the parent scanner, so it
reports **15 passed / 1 failed**. The single failure contains the two false
positives produced by the parent scanner:

```bash
repo="$PWD"
tmp="$(mktemp -d /tmp/publyapp-2106-pre.XXXXXX)"
pre="$tmp/repo"
cleanup() {
  git worktree remove --force "$pre" >/dev/null 2>&1 || true
  rmdir "$tmp" 2>/dev/null || true
}
trap cleanup EXIT
git worktree add --detach "$pre" d479da8df780472f13005d09b1b3fe6ad7578fe2 >/dev/null
mkdir -p "$pre/apps/front"
ln -s "$repo/apps/front/node_modules" "$pre/apps/front/node_modules"
cp "$repo/apps/front/scripts/guards/check-utility-boundaries.test.mts" \
  "$pre/apps/front/scripts/guards/check-utility-boundaries.test.mts"
set +e
pnpm --dir "$pre" --filter front test:utility-boundaries
status=$?
set -e
test "$status" -ne 0
```

Post-fix, from the corrected worktree:

```bash
pnpm --filter front test:utility-boundaries
pnpm --filter front check:utility-boundaries
python3 /home/radan/.hermes/orchestration/runs/publyapp-2026-09-06-captain/audit-old-front-utilities.py --parser-self-test
python3 /home/radan/.hermes/orchestration/runs/publyapp-2026-09-06-captain/audit-old-front-utilities.py --self-check
```

The final GREEN scanner run reports **16/16 tests passed** and the live source
check passes. The exact computed-binding probes and reassigned mutable-alias
negatives are part of that same final test file; the computed-identifier
negative pins the literal-only boundary, and object-rest remains covered by its
explicit out-of-scope negatives. A scanner-disabled mutation of the same
focused suite reports **6 passed / 10 failed** and exits 1, proving the suite is
non-vacuous.

## Static-analysis ceiling

The guard proves source ownership, not arbitrary value flow. It detects exact
checker-identified protected members and bindings in direct, computed,
parenthesized/cast, globalThis/window, assignment, bind/call, ordinary
intermediate and nested object-binding forms, wrapper, re-export, and
import-origin source forms. Object-rest aliases are outside this ceiling. It
does not claim to solve dynamic property names, `eval`, dynamic module loading,
reflection, or opaque runtime values.

Reachability is outside this guard's claim: reviewed package wiring and required
CI own whether the utility tests run.

## Replacement condition

Replace this guard only when a supported standard lint/compiler mechanism
resolves the same exact source-origin boundary and validates the source tree;
delete the scanner and its tests together at that point.
