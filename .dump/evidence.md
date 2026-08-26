# Lane 936 — evidence: the rotating `shell.spec.ts` e2e flake

Issue #936 (filed 2026-07-22) reports a rotating shell failure set on `front e2e`:
`shell.spec.ts:563` (mobile shell menu keyboard/route-aware, recurs), `:298` (rail
navigation preserves collapsed sidebar preference) and `:406` (collapsed-panel
preference persists across navigation). Method: collect every available front-e2e
failure artifact, tabulate which shell tests failed where, map the cited line
numbers onto the current spec, and derive ONE hypothesis for the class.

## 1. The 10 most recent `front-e2e` runs on develop

`gh run list --workflow front-e2e.yml --branch develop --limit 10` (2026-08-26):

| run | date (UTC) | conclusion | notes |
|---|---|---|---|
| 32928784227 | 08-26 04:03 | success | |
| 32922861800 | 08-26 02:28 | success | |
| 32913486975 | 08-26 00:03 | success | |
| 32909179570 | 08-25 23:05 | success | |
| 32907068848 | 08-25 22:38 | success | |
| 32888499589 | 08-25 19:15 | success | |
| 32884531592 | 08-25 18:34 | success | |
| 32882504800 | 08-25 18:13 | success | |
| 32876212004 | 08-25 17:09 | success | |
| 32874409479 | 08-25 16:51 | success | |

Wider scan (250 runs since the issue was filed): the only develop push-run
failure is 32813020285 (08-25 05:29), which failed in **Build e2e images**
(infra), never reached the tests. Develop's shell suite is green across every
sampled completed run.

## 2. Every retrievable front-e2e failure artifact (any branch)

Playwright-report artifacts downloaded and parsed (`gh run download`, report
`data/*.md`):

| run | date | branch | failing shard(s) | failing tests | shell-class? |
|---|---|---|---|---|---|
| 32933776962 | 08-26 05:22 | lane/wt-646b | 4 | tenant-posts-schedule (drawer stayed visible) | no |
| 32932571908 | 08-26 05:03 | lane/wt-642b | 1–4 | `auth.setup.ts` login + ~20 authed tests, page snapshots all show "Your session expired. Please sign in again." | no (session-infra cascade) |
| 32922786801 | 08-26 02:27 | lane/wt-645b | 4 | tenant-posts-publish-now (history duplicate) | no |
| 32920625297 | 08-26 01:52 | lane/wt-642b | 1–4 | ENTIRE shard 2 (all 15 `shell.spec.ts` tests, all parity/ssr-auth/row-actions/profile specs) — every snapshot is the `/login` screen, several with the expired-session alert | no (whole-shard session collapse) |
| 32919611248 | 08-26 01:36 | lane/wt-645b | 4 | tenant-posts-publish-now (history duplicate) | no |
| 32899313043 | 08-25 21:07 | lane/wt-639 | 4 | tenant-post-image (drawer stayed visible) | no |
| 32897382251 | 08-25 20:47 | lane/wt-639 | 4 | tenant-post-image (drawer stayed visible) | no |
| 32895318918 | 08-25 20:26 | lane/wt-639 | 4 | tenant-post-image (drawer stayed visible) | no |
| 32874475526 | 08-25 16:51 | lane/wt-1386 | 2 | ssr-auth-shell (`waitForRequest` timeout) | no |

Key observation: the only run in which `shell.spec.ts` tests failed at all
(32920625297) took down **every authenticated test on the shard**, with page
snapshots showing the login screen and "Your session expired" — a stack/session
infrastructure event, not the rotating single-test shell flake of #936. No
current-artifact evidence of the isolated shell rotation remains in CI.

## 3. Mapping the issue's line numbers onto today's spec

The spec was rewritten after the issue was filed (f015307b4, 2026-08-22,
reordered + retagged; earlier cf8d56965 renamed front-2 → front):

| issue citation (July spec @ 8d6bb2991) | current test |
|---|---|
| `:563` "mobile shell menu is keyboard and route-aware" | removed in the August rewrite; its mobile/route-aware coverage lives on in "landing navigation is responsive and route-aware" and the drawer-based shell chrome tests |
| `:298` "rail navigation preserves collapsed sidebar preference" | present (shell.spec.ts:341), unchanged name |
| `:406` "the collapsed-panel preference persists across list and detail navigation" | present (shell.spec.ts:458), unchanged name |

## 4. Prior art inside this issue

- #938 resolved Cluster A (12 stale specs) and Cluster B deterministic items.
- #950/#951 (merged 2026-07-23) fixed one documented instance of the class:
  the collapse click could land on the server-rendered, not-yet-hydrated
  button; fixed by gating on `data-motion-ready` + `data-panel-open`
  (spec helpers `expectCollapsedSidebarPreferenceApplied`,
  `expectOpenSidebarReadyForInteraction`) — spec-side synchronization only.

## 5. Code facts (app side)

- `apps/front/src/lib/store/ui-store.ts`: the Zustand store initializes with
  hardcoded `DEFAULT_UI_STATE` (`sidebarOpen: true`) and only reads
  `localStorage` inside `hydrateFromStorage()`.
- `hydrateFromStorage()` is called exclusively from `ThemeHydrationListener`
  (`apps/front/src/routes/__root.tsx:407`) inside a `React.useEffect` — i.e.
  strictly AFTER the first committed render.
- The blocking head script (`buildThemeInitScript`, `__root.tsx:419`) applies
  the persisted scheme/sidebar flags to `<html>` before first paint, but that
  DOM state is never fed back into React; the store still wakes up default.
- Therefore, on any document load with `sidebarOpen=false` persisted, the
  REAL `AppShell` (which mounts once the session validation query resolves,
  `RoutedShell` → `AuthedLayout`) first renders the panel OPEN from the
  default store value, then flips to collapsed when the listener effect runs.
  On a loaded CI runner this window stretches; any assertion or interaction
  inside it observes the opposite of the persisted preference. This is
  precisely the July failure signature (click on inert/default markup,
  panel state observed mid-correction) and it is a real UI defect: users see
  a one-frame-plus open flash of a panel they collapsed.
- Spec-side hardening since July (poll `data-panel-open`, gate interactions
  on `data-motion-ready`) masks the window for the assertions that use those
  helpers, but the open-state assertions (`toBeVisible` right after
  navigation) still race the correction, and the underlying double-render
  remains.

## 6. Hypothesis (ONE, for the class)

**The UI preference store hydrates from `localStorage` too late: the store
initializes to hardcoded defaults and is corrected only in a post-commit
effect, so every document load renders the default shell state first and
flips to the persisted preference afterwards.** All members of the class
(collapse-click races, panel-open/collapsed misreads across navigations, the
July mobile-menu rotation) are observations of that same correction window.

Fix the ROOT CAUSE in the app: initialize `sidebarOpen` from `localStorage`
at store creation on the client (no waiting for an effect), and read it in
`AppShell` through `useSyncExternalStore` with an SSR-matching server snapshot
so hydration stays mismatch-free. The persisted preference then holds from the
first client render; the correction window disappears instead of being polled
around. No `retry`, no `waitForTimeout`, no skips — and no new test-only
readiness surface is needed because the state is simply never wrong.
