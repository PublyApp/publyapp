# Proof R4 — tag guard fails on any unsupported describe shape

## Setup

Added throwaway to `apps/front/e2e/smoke.spec.ts`:

```ts
const cb = () => {};
test.describe('proof-r4-throwaway-unsupported-shape @untracked', cb);
```

This is a describe whose callback is a variable — the scanner cannot parse it
and records `error` on the record.

## Before fix (no error check in e2e-tag-guard.test.ts)

```
 Test Files  1 passed (1)
      Tests  42 passed (42)
```

**GREEN** — the unsupported shape was silently accepted. The `error` field was
produced by `analyzeFile` but never asserted. This is the false negative the
fix exists to close.

## After fix (error check added)

```
 FAIL  e2e tag coverage > smoke.spec.ts: every top-level describe has @domain and @ticket tags
AssertionError: smoke.spec.ts: scanner could not parse 1 describe(s):
  "proof-r4-throwaway-unsupported-shape @untracked" (pos 515):
  unsupported describe shape in "proof-r4-throwaway-unsupported-shape @untracked":
  expected 1 to be +0

 Test Files  1 failed (1)
      Tests  1 failed | 41 passed (42)
```

**RED** — the guard now fails with an explicit message naming the file, the
describe title, the position, and the shape error.

## Cleanup

Throwaway removed from `smoke.spec.ts` after proof capture.
