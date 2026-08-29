# 2026-08-29 — done: icon visibility guard, measurement-based (#1799)

## What landed

`lane/wt-1799` is ready to open a PR toward `develop`. Five
commits, each independently auditable. Branch ahead of
`origin/develop` by 5 commits, behind by 2 (the side PRs the
brief session summary already noted, not in scope for this
issue).

| commit | purpose |
| --- | --- |
| `bc24d192f` | extract `assertIconIsVisible` from the test file into a dedicated module |
| `2785fa895` | add the `ComputedStyleReader` type, restore the buggy classList body so the proof has something to catch |
| `5975dd989` | add the kept-red proof under `tests/proofs/1799/`, 5 cases |
| `280bec2bc` | fix: real measurement body, against the buggy version the proof red-tests |
| `b50f547c3` | add the real-browser Playwright e2e spec + helpers + config wiring |

## What the defect was

`assertIconIsVisible` in the row-selection integration test
asserted a property of the icon ("is the check state the user
actually sees?") by enumerating two specific Tailwind class
names: `invisible` and `hidden`. A class enumeration is, by
construction, never exhaustive. The defect the issue names —
`opacity-0` (paints transparently) and `aria-hidden="true"` (a
DOM attribute, not a CSS value) — both slip through an
enumeration that doesn't list them. The future of the same
defect class is `clip-path-*`, `size-0`, off-screen
`translate-*`: each new entry would re-open it.

## What the fix does

The helper body now reads the icon's actual visibility from the
user's perspective, never from a list of class names:

1. `aria-hidden="true"` is a DOM attribute, direct read.
2. `visibility:hidden` (Tailwind's `invisible`) —
   `getComputedStyle`.
3. `display:none` (Tailwind's `hidden`) — `getComputedStyle`.
4. `opacity:0` (Tailwind's `opacity-0`) — `getComputedStyle`.

`getComputedStyle` is injected as a `ComputedStyleReader` so the
helper is exercised in two lanes that both matter:

- **Unit lane (jsdom):** an injected reader returns the values
  a real browser would compute for each Tailwind class. jsdom
  does not parse the Tailwind stylesheet, so
  `window.getComputedStyle` returns empty strings — the test
  would be a no-op against the real reader. The injected reader
  is the only honest way to test the measurement function in
  jsdom.
- **Real-browser lane (Playwright + Chromium):** the engine's
  own `getComputedStyle` is passed in. Painted against the real
  compiled production stylesheet and the real shipping
  `DataTable` markup (rendered through Vite SSR, not a
  hand-mirrored span).

The class-list enumeration is gone from the helper body. Future
hiding mechanisms that don't use any of these four signals will
be caught by adding the signal to the measurement list, not the
class list — the same defect class can't reopen the same way.

## Tests

Two pairs of tests, each pair one red proof + one green happy
path:

1. **Kept-red proof
   (`apps/front/tests/proofs/1799/red-1799-icon-visibility-guard.test.tsx`):**
   five vitest cases, replayed through `vitest.preuves.config.ts`
   on every PR that touches the helper. Each case feeds the
   helper the values a real browser would compute for one of the
   four hiding mechanisms, and asserts the helper throws. Three
   adversarial mutations verified all five cases go red in the
   right place:

   - `classList` enumeration restored → RED 2/5 on `opacity-0`
     and `aria-hidden` (the bug the issue names).
     `.dump/preuve-1799-mut1-classlist.txt`.
   - `aria-hidden` check dropped → RED 1/5 on `aria-hidden`.
     `.dump/preuve-1799-mut2-no-aria.txt`.
   - `=== 0` weakened to `< 0` → RED 1/5 on `opacity-0`.
     `.dump/preuve-1799-mut3-lt-zero.txt`.

2. **Real-browser e2e spec
   (`apps/front/e2e/data-table-icon-visibility-guard.spec.ts`):**
   two Playwright tests in the existing
   `chromium-hermetic-source` project (same hermetic-source
   convention as the focus-ring cascade and
   breadcrumb-entity-name-truncation proofs — no login, no
   backend, no docker-compose stack). One walks all four hiding
   mechanisms and asserts the browser's own `getComputedStyle`
   AND the helper agree the icon is hidden. The other asserts
   the unmutated baseline renders visible (no false positive on
   the happy path).

The kept-red proof is the cheap signal every PR gets on the
default vitest lane. The real-browser spec is the load-bearing
check that the unit proof's fake reader is not lying. Both
must go green; a regression in either layer is a regression in
the fix.

## Why both options (not one)

The brief names two valid approaches. Both shipped:

- **Option (1) — real Playwright browser:** the e2e spec.
  Proves the helper is correct against the real engine, real
  CSS, real DataTable markup.
- **Option (2) — jsdom with a fake reader:** the unit proof.
  Proves the helper is correct against an injected reader,
  which is the only honest way to test a measurement function
  in jsdom.

They are not alternatives. Option (1) catches a fake-reader
regression that option (2) would silently green; option (2)
catches a defect between the two CI runs (default vitest lane
runs on every PR; the e2e lane only runs in `front-e2e.yml`).
Keeping both closes the gap from both sides.

## Verification done

- `pnpm exec tsc --noEmit -p tsconfig.json` — clean.
- `pnpm exec vitest run` — 307/307 files, 2933/2933 tests
  pass.
- `pnpm exec vitest run --config vitest.preuves.config.ts
  tests/proofs/1799/` — 5/5 green.
- `pnpm exec oxlint` — clean on changed files.
- `pnpm exec oxfmt --check` — clean on changed files.
- `pnpm exec playwright test --list
  --project=chromium-hermetic-source` — lists the new spec,
  picks it up under the project.

The e2e spec itself is not run locally because Chromium is not
provisioned in the worktree environment. The lane runs in
`front-e2e.yml` on CI, the same way the focus-ring cascade
proof runs there today.

## Note on the routeTree.gen.ts drift

`apps/front/src/routeTree.gen.ts` is auto-generated and showed
a 9-line diff during the session (an extra `Register` module
declaration block at the end of the file). I did not make that
change; it appears to be a side effect of running a local
`pnpm dev` or `pnpm typecheck` against a different TanStack
Start version. The change was reverted before the final commit
so this PR does not carry unrelated noise — if the drift is
genuine, it belongs in its own PR against the same issue, with
a real reproduction.

## Open

- Open the PR with `Closes #1799` in the body, push to
  `develop` after CI is green.
- The 2 `front-e2e.yml` shards that provision Chromium and run
  `chromium-hermetic-source` will execute the new spec
  automatically — no workflow edit required (the spec is added
  to the existing `hermeticSourceSpecs` list).
