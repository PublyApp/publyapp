# React Doctor False Positives

## `react-doctor/no-adjust-state-on-prop-change` — `use-active-toc-section.ts`

**File:** `src/hooks/use-active-toc-section.ts`
**Line:** ~65 (`observer.observe(el)`)

The rule fires here because `useEffect` has `ids` in its deps and a `setActiveId` call exists
inside the body. However, `setActiveId` is only called from inside the async
`IntersectionObserver` callback — never synchronously in the effect body itself.
Per the rule's own validation: "False positive: the effect actually kicks off async work
(fetch, debounce, subscription) whose later callback sets the state — the rule already
requires the setter call to be synchronous."

Suppress this occurrence. The IntersectionObserver re-fires on `observe` very quickly, so
the stale-activeId window is at most one animation frame.

## `react-doctor/exhaustive-deps` — `settings-tab-sync-bridge.tsx`

**File:** `src/lib/mui/theme/settings-tab-sync-bridge.tsx`
**Line:** 81 (empty deps array `[]`)

The `useEffect` intentionally uses `[]` because the bridge must initialize exactly once per
mount. `setMode` from MUI's `useColorScheme()` is a stable dispatch function (analogous to
`setState`) that does not change between renders. The `applySnapshot` callback reads live
Zustand state via `useMainStore.getState()` — a stable imperative accessor — rather than
closing over any reactive slice.

This suppression is already documented with `oxlint-disable-next-line react/exhaustive-deps`
inline. React Doctor does not honor `oxlint-disable` comments, so this will continue to
appear in scans; treat it as a known/intentional suppression.
