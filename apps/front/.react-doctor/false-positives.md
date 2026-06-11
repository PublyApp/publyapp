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
