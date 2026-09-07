# Utility boundary guard admission — issue #2106

Date: 2026-09-07
Scope: the frontend guard that keeps date/time formatting and clipboard writes
behind the canonical SSR-safe utilities.

## Decision

Keep the guard in the existing `apps/front/scripts/guards/` surface and use the
already-installed TypeScript checker through `ts-morph`. The boundary guard now
owns only source-origin access: it compares checker-resolved global/root and
protected-property symbols for `Intl.DateTimeFormat` and
`navigator.clipboard.writeText` (including their globalThis/window and static
prefix forms) and never chases downstream aliases. The existing
`check-guard-coverage` analyzer owns aggregate reachability through a closed,
parsed exact `test:ci-non-vitest` command chain. No dependency, shell parser,
baseline, allowlist, or guard-of-guard was added.

The existing `publy/no-direct-dayjs-in-components` lint rule is not a complete
replacement: it is scoped to direct package imports in component `.tsx` files,
while this invariant also covers route and utility source, browser-global
property aliases, and the aggregate reachability contract. The guard's AST work
is restricted to that missing surface.

## Admission evidence

1. **Current reproducible failure and critical invariant.** The prior resolver
   missed five source-origin forms: constructor `.bind`, constructor `.call`,
   assignment aliases, array-destructured clipboard access, and imported
   function wrappers. The prior aggregate admission accepted echo, suffixed,
   and dead-branch lookalikes. The protected invariant is runtime/public
   contract integrity: browser APIs must remain behind the SSR-safe utilities
   used by the shipped front.
2. **Why a simpler mechanism is insufficient.** Behavioral utility tests prove
   the canonical implementations, but cannot detect a second implementation
   added elsewhere. TypeScript typechecking accepts these accesses and does not
   enforce this repository policy. The existing lint rule does not cover route
   and utility source or aggregate reachability. The checker is used only for
   identity at the origin; downstream alias flow is deliberately unnecessary.
3. **Smallest mechanism and maintenance cost — proven by the reset.** The
   implementation is one recursive filesystem scanner, one checker program,
   static property-name extraction, and seven checker symbol identities. The
   previous 411-line resolver was deleted. Aggregate proof is one exact command
   string parsed into argv arrays with `&&`; no shell parser or second reachability
   mechanism exists. Maintenance is explicit: moving either canonical utility,
   changing the protected browser contract, or changing the aggregate chain
   requires updating the guard and its fixtures in the same change.
4. **Reproducible red/green proof — measured.** The pre-reset focused run
   passed 20/23 tests and failed the five source-origin escapes plus the
   aggregate-decoy test. The post-reset run passes 24/24 focused guard tests;
   the exact aggregate passes, while echo, suffixed, dead-branch, reordered,
   duplicated, and `pnpm run` indirection variants each produce a named finding.
   The parser self-test passes only after proving default-export shape, rejecting
   malformed input, and excluding comment/string caller false positives.
5. **Fail-closed behavior.** The scanner rejects a missing/non-`src` root,
   symlink or cycle, empty/unsupported source scans, and unparseable production
   source. The aggregate analyzer rejects malformed shell shape and any missing,
   reordered, duplicated, suffixed, echoed, dead, or indirect command in its
   exact chain, naming `test:ci-non-vitest`.
6. **Retirement or replacement condition.** Remove this guard when a supported
   standard lint/compiler mechanism resolves the same source-origin browser API
   boundary, validates the source tree, and guarantees that the canonical check
   is reachable from the required front aggregate. Replace it with that standard
   mechanism and delete the scanner plus its tests together; until all three
   guarantees are independently present, removing the guard recreates the
   demonstrated bypass.

## Static-analysis ceiling

The guard proves source ownership, not arbitrary value flow. It detects static
property accesses whose checker symbols identify the real global protected
objects/properties, including direct, computed-string, parenthesized/cast,
globalThis/window, assignment, bind/call, destructuring, wrapper, re-export,
and import-origin forms because each retains an origin access in its own AST.
It intentionally does not claim to solve dynamic property names, `eval`, dynamic
module loading, reflection, or opaque runtime values. Those are outside this
source-ownership invariant and are not evidence that a competing source access is
safe.

The aggregate ceiling is equally explicit: only the current whitespace-tokenized
`&&` chain is admissible. Unsupported shell syntax is rejected, and no claim is
made about arbitrary shell execution semantics beyond that closed contract.
