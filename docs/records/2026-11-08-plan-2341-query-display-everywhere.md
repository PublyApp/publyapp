# QueryDisplay everywhere (#2341) Implementation Plan

> **For agentic workers:** execute task by task. One task = one dispatch, one commit, one fresh review.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every TanStack Query render in `apps/front/src` goes through `QueryDisplay`, enforced by
`publy/prefer-query-display` at `error`, with the repo green.

**Spec:** `docs/records/2026-11-08-spec-query-display-and-preload.md` (§4.1 and §7.6–7.9). This plan
covers PR 1 (#2341) only.

**Architecture:** `QueryDisplay` gains a `variant` prop with two presets (`inline`, `discreet`) built on
its existing slots. `ListPage` and `HistoryPage` render their states through `QueryDisplay`
internally. Every offending file is migrated. The lint rule is extended last, so the repo is green
when the rule turns on.

**Tech stack:** React 19, TanStack Query 5, Vitest + Testing Library, oxlint JS plugins
(`packages/lint-ts`).

## Global Constraints

- No visible change on any page, except a widget that had **no** loading or error state at all,
  which gets a preset.
- No `Array.reduce`, no IIFE, arrow components, design tokens only, i18n FR+EN for any new string.
- React Doctor clean on every changed file (`just react-doctor`).
- TypeScript only. No dependency change, no `pnpm install` by agents.
- Bespoke guard admission (`docs/guides/test-conventions.md`): the rule extension (Task 5) carries a
  red fixture and a green fixture, plus the admission evidence in the PR body. Owner mandate:
  « tout ça doit être mécanique » (2026-11-07).
- Gates per task (from `apps/front` unless stated):
  - `pnpm exec vitest run <changed test files>`;
  - `pnpm --filter front typecheck`;
  - `pnpm exec oxlint <changed files>`;
  - `pnpm exec oxfmt --check <changed files>`.

---

### Task 1: `QueryDisplay` presets `inline` and `discreet`

**Files:**
- Modify: `apps/front/src/components/query-display.tsx`
- Test: `apps/front/src/components/query-display.test.tsx` (create it if absent; otherwise add cases)

**Interfaces:**
- Produces: `variant?: 'page' | 'inline' | 'discreet'` on `QueryDisplay` props (default `'page'`).
  An explicit `LoadingSlot` / `ErrorSlot` always wins over the preset.

- [ ] **Step 1: Write the failing tests**

```tsx
import type { UseQueryResult } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import QueryDisplay from './query-display';

const pending = { isPending: true, isLoading: true, isError: false, isFetching: true, data: undefined, error: null, refetch: vi.fn() } as unknown as UseQueryResult<string>;
const failed = { isPending: false, isLoading: false, isError: true, isFetching: false, data: undefined, error: new Error('boom'), refetch: vi.fn() } as unknown as UseQueryResult<string>;

describe('QueryDisplay variants', () => {
	test('discreet renders nothing while loading', () => {
		const { container } = render(<QueryDisplay query={pending} variant="discreet">{() => 'data'}</QueryDisplay>);
		expect(container).toBeEmptyDOMElement();
	});
	test('discreet renders nothing on error', () => {
		const { container } = render(<QueryDisplay query={failed} variant="discreet">{() => 'data'}</QueryDisplay>);
		expect(container).toBeEmptyDOMElement();
	});
	test('inline shows a visible loading label next to the spinner', () => {
		render(<QueryDisplay query={pending} variant="inline">{() => 'data'}</QueryDisplay>);
		expect(screen.getByRole('status')).toBeInTheDocument();
		expect(screen.getByTestId('query-display-inline-loading')).toHaveTextContent(/.+/);
	});
	test('an explicit LoadingSlot wins over the preset', () => {
		render(<QueryDisplay query={pending} variant="discreet" LoadingSlot={<span>mine</span>}>{() => 'data'}</QueryDisplay>);
		expect(screen.getByText('mine')).toBeInTheDocument();
	});
});
```

Wrap renders in the repo's i18n test provider if `useTranslation` needs one: copy the setup that the
nearest existing component test uses (`grep -l "QueryDisplay" apps/front/src/**/*.test.tsx`).

- [ ] **Step 2: Run, expect FAIL** — `pnpm exec vitest run src/components/query-display.test.tsx`:
  `variant` is unknown and the discreet cases render a spinner.

- [ ] **Step 3: Implement**

In `Props` add:

```ts
	/** `page` (default): spinner + full inline error state. `inline`: spinner plus a visible
	 * « Chargement… » label, for menus and selects. `discreet`: nothing while loading and nothing on
	 * error, for banners and badges that only matter when data exists. Explicit slots win. */
	variant?: 'page' | 'inline' | 'discreet';
```

Change `renderLoading` to take the variant:

```tsx
const renderLoading = (
	LoadingSlot: Props['LoadingSlot'],
	loadingLabel: string,
	variant: NonNullable<Props['variant']>,
) => {
	if (typeof LoadingSlot === 'function') {
		const Slot = LoadingSlot;
		return <Slot />;
	}
	if (isValidElement(LoadingSlot) || LoadingSlot !== undefined) {
		return LoadingSlot;
	}
	if (variant === 'discreet') {
		return null;
	}
	if (variant === 'inline') {
		return (
			<span
				data-testid="query-display-inline-loading"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground"
			>
				<LoadingSpinner {...defaultLoadingProps} label={loadingLabel} />
				<span aria-hidden="true">{loadingLabel}</span>
			</span>
		);
	}
	return <LoadingSpinner {...defaultLoadingProps} label={loadingLabel} />;
};
```

In `renderError`, after the two slot branches, add `if (variant === 'discreet') { return null; }`
before `renderDefaultError(...)` (thread `variant` as a parameter). In the component, destructure
`variant = 'page'` and pass it to every `renderLoading` / `renderError` call (the `forceRender`
branches included).

- [ ] **Step 4: Run, expect PASS** — same command, plus the existing QueryDisplay consumers:
  `pnpm exec vitest run src/components`.
- [ ] **Step 5: Gates + commit** — `feat(front): QueryDisplay inline and discreet presets (#2341)`.

---

### Task 2: `ListPage` and `HistoryPage` render their states through `QueryDisplay`

**Files:**
- Modify: `apps/front/src/components/list/list-page.tsx` (prop `queryState`, l.110, and its state
  branch around l.148–160)
- Modify: `apps/front/src/components/history/history-page.tsx` (prop `queryState`, l.60, l.121,
  l.266) and `apps/front/src/components/history/history-body.tsx` (state ladder l.61–95)
- Modify: the 9 callers (`git grep -l -E "<(ListPage|HistoryPage)\b" -- apps/front/src ':!*.test.tsx'`)
- Tests: the existing `list-page` / `history-page` / `history-body` tests and every caller's test.

**Interfaces:**
- Consumes: Task 1 `variant` (not needed here; default `page`).
- Produces: `ListPage` and `HistoryPage` take `query: UseQueryResult<…> | UseInfiniteQueryResult<…>`
  instead of `queryState`. Internally the loading / error / empty branch is
  `<QueryDisplay query={…} LoadingSlot={<existing skeleton/>} ErrorSlot={…existing error…}
  EmptySlot={<existing empty/>}>`. Exactly the same DOM as today in each state.

- [ ] **Step 1:** in each component test, add one assertion per state (pending, error, empty, data)
  that the rendered DOM matches today's. Snapshot the state region with
  `expect(region).toMatchInlineSnapshot()` **before** changing code, so the snapshot is today's DOM.
- [ ] **Step 2:** replace the hand-written branch with `QueryDisplay` and the existing pieces as
  slots. Widen `QueryDisplay`'s `query` prop type to accept an infinite-query result if TypeScript
  requires it: `UseQueryResult<TData, TError> | UseInfiniteQueryResult<TData, TError>`. It only reads
  `isPending`, `isLoading`, `isFetching`, `isError`, `error`, `data` and `refetch`, all present on
  both.
- [ ] **Step 3:** update the 9 callers: `queryState={{ isPending: q.isPending, … }}` becomes
  `query={q}`. Where a caller merged two queries into one `queryState`, keep the primary list query
  and say so in the report.
- [ ] **Step 4:** snapshots unchanged, then the gates.
- [ ] **Step 5:** commit `refactor(front): ListPage and HistoryPage render states through QueryDisplay (#2341)`.

---

### Task 3: Migrate page-content files

**Files (each one, with its colocated test):**
- `apps/front/src/routes/accept-invitation.tsx`
- `apps/front/src/routes/authed/staff/invitations/new.tsx`
- `apps/front/src/routes/authed/staff/roles-new.tsx`
- `apps/front/src/routes/authed/staff/roles/$roleId.tsx`
- `apps/front/src/routes/authed/staff/roles/$roleId/users.tsx`
- `apps/front/src/routes/authed/staff/tenant-users/$userId-general.tsx`
- `apps/front/src/routes/authed/staff/tenant-users/$userId-organizations.tsx`
- `apps/front/src/routes/authed/staff/tenant-users/_details-shell.tsx`
- `apps/front/src/routes/authed/staff/tenants/$tenantId/_tenant-users-preview-card.tsx`
- `apps/front/src/routes/authed/staff/tenants/$tenantId/roles/_role-members-tab.tsx`
- `apps/front/src/routes/authed/tenant/settings/integrations.tsx`
- `apps/front/src/routes/authed/staff/dashboard/index.tsx`, and `_overview-list-card.tsx` if it
  still hand-rolls states. **Skip this pair if #2339 is not merged** when the task starts: #2339
  rewrites the dashboard through `QueryDisplay` already.

Re-list before starting:

```
for f in $(git grep -l -E "\buse[A-Z][A-Za-z]*Query\(" -- 'apps/front/src/**/*.tsx' ':!*.test.tsx'); do grep -q -E "QueryDisplay|ListPage|HistoryPage" "$f" || echo "$f"; done
```

**Pattern (apply to each file):**

```tsx
// before
const query = useStaffRoleQuery({ roleId });
if (query.isPending) return <RoleDetailsLoading />;
if (query.isError) return <RoleRouteError error={query.error} />;
return <RoleDetails role={query.data} />;

// after
const query = useStaffRoleQuery({ roleId });
return (
	<QueryDisplay query={query} LoadingSlot={RoleDetailsLoading} ErrorSlot={RoleRouteErrorSlot}>
		{({ data }) => <RoleDetails role={data} />}
	</QueryDisplay>
);
```

Each file keeps its existing loading / error / empty components as slots, so nothing visible
changes. Where `ErrorSlot` needs the `{ error, query }` props shape, add a 3-line adapter in the same
file. A file whose data feeds a form (`new.tsx`, `roles-new.tsx`): the form renders inside the
`QueryDisplay` children, never before the data exists.

- [ ] **Step 1:** for each file, run its existing test. Add a pending case and an error case if they
  are missing, asserting today's loading and error UI.
- [ ] **Step 2:** migrate with the pattern.
- [ ] **Step 3:** run the tests and gates. Commit per 3–4 files:
  `refactor(front): render <area> queries through QueryDisplay (#2341)`.

---

### Task 4: Migrate the small widgets

**Files and target shape:**

| File | Shape |
|---|---|
| `apps/front/src/components/ui/code-select.tsx` | `variant="inline"` around the options list |
| `apps/front/src/components/list/filter-menu.tsx` | `variant="inline"` inside the menu popup |
| `apps/front/src/components/list/sort-menu.tsx` | `variant="inline"` inside the menu popup |
| `apps/front/src/components/app-shell/user-menu.tsx` | keep today's placeholder via `LoadingSlot`; `variant="discreet"` if it has none |
| `apps/front/src/components/app-shell/app-shell.tsx` | `variant="discreet"` |
| `apps/front/src/components/app-shell/_needs-reconnect-banner.tsx` | `variant="discreet"` |
| `apps/front/src/routes/authed/staff/tenants/$tenantId/_invite-role-select.tsx` | `variant="inline"` |
| `apps/front/src/routes/authed/tenant/settings/_attach-projects-field.tsx` | `variant="inline"` |
| `apps/front/src/routes/authed/staff/tenants/$tenantId/roles/_role-form-drawer.tsx` | default `page`, inside the drawer body |
| `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx` | default `page`, inside the drawer body |
| `apps/front/src/routes/authed/staff/tenant-users/$userId-organizations-drawer.tsx` | default `page`, inside the drawer body |
| `apps/front/src/lib/navigation/entity-crumb.tsx` | `LoadingSlot` = today's `Skeleton` bar, `EmptySlot` = today's « — » (no visible change) |

`routes/authed/staff/_staff-list-team.tsx` binds queries only inside the hook
`useStaffCounterSection`, which returns data. It is not a render, so leave it. Its consuming
component is covered by the rule in Task 5.

- [ ] **Step 1:** per file, add or extend a test for its pending and error state. A `discreet` widget
  renders nothing; an `inline` widget shows the inline label.
- [ ] **Step 2:** migrate, then run the tests and gates.
- [ ] **Step 3:** commit `refactor(front): widgets render queries through QueryDisplay presets (#2341)`.

---

### Task 5: Extend `publy/prefer-query-display`, then docs

**Files:**
- Modify: `packages/lint-ts/src/publy/prefer-query-display.ts` (new message id; detection added next
  to the existing ladder check, `create()` at l.671)
- Test: `packages/lint-ts/src/publy/prefer-query-display.test.ts` (+ the `.exemption.test.ts`)
- Modify: `docs/guides/lint-rules.md`, `docs/guides/front/conventions.md` (l.445 says "dormant")

**Rule addition.** In a JSX-returning function (component or render prop), a variable bound to a
`use*Query(` call (whole binding or destructuring) must reach a `query` JSX attribute of
`QueryDisplay`, `ListPage` or `HistoryPage` in the same file, directly or through one alias.
Otherwise report `queryNotRenderedThroughQueryDisplay`: « Render this query through QueryDisplay
(variant="inline" or "discreet" for small widgets). »
- A function that returns no JSX (a custom hook) is not checked.
- `useMutation` stays ignored, and the existing path exclusions stay.
- A destructured binding (`const { data } = useX()`) read in render is a violation: keep the whole
  result and pass it to `QueryDisplay`.
- Escape: `// oxlint-disable-next-line publy/prefer-query-display -- <reason>`
  (`check-oxlint-disables.ts` already requires the reason).

- [ ] **Step 1: failing fixtures** in `prefer-query-display.test.ts`:
  - **red**: a component that binds `useFooQuery()` and renders `{q.data?.name}`;
  - **red**: `const { data } = useFooQuery(); return <p>{data}</p>`;
  - **green**: `<QueryDisplay query={q}>`;
  - **green**: `<ListPage query={q} …>`;
  - **green**: a hook `useBar = () => { const q = useFooQuery(); return q.data; }`;
  - **green**: a disable comment with a reason.
- [ ] **Step 2:** run `pnpm --filter @org/lint-ts exec vitest run src/publy/prefer-query-display`,
  expect the two red fixtures to FAIL (no report yet).
- [ ] **Step 3:** implement the detection and reuse the existing binding tracker (`QUERY_FLAG_FIELDS`
  data flow, l.31–55).
- [ ] **Step 4:** the fixtures pass, then `just lint` on the whole repo: **zero**
  `prefer-query-display` reports. Every disable comment is listed in the report, and the expected
  count is 0.
- [ ] **Step 5:** docs. `conventions.md`: the rule is enforced, covers every query render, and
  documents the three variants. `lint-rules.md`: the new message and the escape syntax.
- [ ] **Step 6:** commit `feat(lint): every query render goes through QueryDisplay (#2341)`.

---

## Final gate (captain, before the PR leaves draft)

`just lint`, `pnpm --filter front typecheck`, `pnpm --filter front test`, `just react-doctor`,
`just knip`, then annotated captures of 3 migrated pages and 3 widgets in each state (loading,
error, data) proving no visible change, posted on the PR.

## Self-review

- Spec §4.1.1–4.1.5 → Tasks 1, 3, 4, 5. §7.6 → Task 5 (hooks skipped). §7.7 → Task 4
  (`entity-crumb`). §7.8 → Task 2. §7.9 → Task 3 (dashboard skip rule).
- Accepted deviation: Tasks 3 and 4 give one canonical pattern and a per-file target instead of the
  full code of 25 files. The files differ, and the implementer reads each one.
