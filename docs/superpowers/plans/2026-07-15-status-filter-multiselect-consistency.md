# Status Filter Multi-Select Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every front-2 status-filter popover follow the persistent square-checkbox multi-select contract, including true multi-status filtering on `/staff/tenants`.

**Architecture:** Keep tenant status ordering and wire normalization in `tenants-list-helpers.ts`, expose a canonical typed array to the route, and serialize it to the API's existing lowercase CSV parameter at the router/query boundary. Update only the two noncompliant menus, then enforce the contract across all TSX status menus with a fail-closed TypeScript AST rule in the existing design-system guard.

**Tech Stack:** React 19, TypeScript 6, TanStack Router/Query/Table, Base UI dropdown primitives, Vitest + Testing Library, Node test runner, TypeScript compiler API, Playwright.

---

## File Map

- Modify `apps/front-2/src/routes/authed/staff/tenants-list-helpers.ts`: canonical typed-array parsing and CSV serialization.
- Modify `apps/front-2/src/routes/authed/staff/tenants-list-helpers.test.ts`: parser, serializer, and round-trip matrix.
- Modify `apps/front-2/src/routes/authed/staff/tenants.tsx`: persistent multi-select status UI and canonical request state.
- Modify `apps/front-2/src/routes/authed/staff/tenants.test.tsx`: component interaction, race, selection-lock, and cursor-reset coverage.
- Modify `apps/front-2/src/routes/authed/staff/deep-link-canonicalization.test.tsx`: real router-boundary canonicalization coverage.
- Modify `apps/front-2/src/lib/query/staff-tenants.test.ts`: CSV request and query-key boundary coverage.
- Modify `apps/front-2/src/lib/navigation/route-metadata.test.tsx`: multi-status URLs match no exclusive shortcut.
- Modify `apps/front-2/src/routes/authed/staff/invitations/index.tsx`: standard `All statuses` reset row.
- Modify `apps/front-2/scripts/check-design-system.mjs`: TypeScript AST status-menu invariant.
- Modify `apps/front-2/scripts/check-design-system.test.mjs`: positive fixtures and planted defect proofs.
- Modify `apps/front-2/e2e/staff-tenants.spec.ts`: union-status API mock and multi-select browser flow.
- Modify `apps/front-2/e2e/staff-invitations.spec.ts`: invitation reset-row browser flow.

Do not edit the API, generated client, route metadata source, dropdown primitive, translations, manifests, or lockfiles. A need outside this surface is a scope-review point.

### Task 1: Canonical Tenant Status Array And CSV Wire Helpers

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/tenants-list-helpers.test.ts`
- Modify: `apps/front-2/src/routes/authed/staff/tenants-list-helpers.ts`

- [ ] **Step 1: Replace singular helper assertions with the failing canonical-array matrix**

Update the imports and status-focused tests to use both parser and serializer:

```ts
import {
	parseTenantListSearchParams,
	parseTenantStatusFilter,
	serializeTenantListSearchParams,
	serializeTenantStatusFilter,
} from './tenants-list-helpers';

describe('parseTenantStatusFilter', () => {
	test.each([
		['Pending', ['pending']],
		['active', ['active']],
		['Suspended', ['suspended']],
		['suspended, active', ['active', 'suspended']],
		['Suspended,pending,active,pending', ['pending', 'active', 'suspended']],
		['active,bogus,suspended', ['active', 'suspended']],
	])('canonicalizes %s', (input, expected) => {
		expect(parseTenantStatusFilter(input)).toEqual(expected);
	});

	test.each([undefined, '', '   ', 'bogus', 42])(
		'collapses %j to an empty selection',
		(input) => {
			expect(parseTenantStatusFilter(input)).toEqual([]);
		},
	);
});

describe('serializeTenantStatusFilter', () => {
	test.each([
		[[], undefined],
		[['active'], 'active'],
		[['suspended', 'active'], 'active,suspended'],
		[['suspended', 'pending', 'active', 'pending'], 'pending,active,suspended'],
	])('serializes %j to %j', (input, expected) => {
		expect(serializeTenantStatusFilter(input)).toBe(expected);
	});
});

describe('parseTenantListSearchParams / serializeTenantListSearchParams', () => {
	test('round-trips canonical statuses alongside generic table params', () => {
		const parsed = parseTenantListSearchParams({
			status: 'Suspended, active,active',
			q: ' acme ',
			sort_id: 'name',
			sort_order: 'asc',
		});

		expect(parsed).toMatchObject({
			status: ['active', 'suspended'],
			q: 'acme',
		});
		expect(serializeTenantListSearchParams(parsed)).toEqual({
			status: 'active,suspended',
			q: 'acme',
			sort_id: 'name',
			sort_order: 'asc',
		});
	});

	test('invalid-only input never reaches the request shape', () => {
		const parsed = parseTenantListSearchParams({ status: 'bogus,unknown' });
		expect(parsed.status).toEqual([]);
		expect(serializeTenantListSearchParams(parsed)).toEqual({
			status: undefined,
		});
	});
});
```

- [ ] **Step 2: Run the helper tests and prove the singular implementation fails**

Run:

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/staff/tenants-list-helpers.test.ts
```

Expected: FAIL because `parseTenantStatusFilter` returns a scalar/`undefined`, `serializeTenantStatusFilter` is not exported, and `TenantListSearchParams.status` is singular.

- [ ] **Step 3: Implement canonical parsing and serialization**

Replace the singular status definitions and status-specific helper bodies with:

```ts
export type TenantListSearchParams = TableSearchParams & {
	status: TenantStatusFilter[];
};

export type TenantListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
};

export const parseTenantStatusFilter = (
	value: unknown,
): TenantStatusFilter[] => {
	if (typeof value !== 'string') {
		return [];
	}

	const selected = new Set(
		value
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter((token) => TENANT_STATUS_FILTER_SET.has(token)),
	);

	return TENANT_STATUS_FILTERS.filter((status) => selected.has(status));
};

export const serializeTenantStatusFilter = (
	statuses: readonly TenantStatusFilter[],
): string | undefined => {
	const selected = new Set(statuses);
	const canonical = TENANT_STATUS_FILTERS.filter((status) =>
		selected.has(status),
	);
	return canonical.length > 0 ? canonical.join(',') : undefined;
};

export const parseTenantListSearchParams = (
	search: TenantListSearchParamInput,
): TenantListSearchParams => ({
	...parseTableSearchParams(search),
	status: parseTenantStatusFilter(search.status),
});

export const serializeTenantListSearchParams = (
	params: TenantListSearchParams,
): Record<string, string | undefined> => ({
	...serializeTableSearchParams(params),
	status: serializeTenantStatusFilter(params.status),
});
```

Keep `validateTenantListSearchParams` unchanged: it must still return the snake-case wire shape from parse then serialize.

- [ ] **Step 4: Run helper tests and typecheck the helper contract**

Run:

```bash
pnpm --filter front-2 exec vitest run src/routes/authed/staff/tenants-list-helpers.test.ts
pnpm --filter front-2 typecheck
```

Expected: helper tests PASS. Typecheck FAILS only at known singular status consumers in `tenants.tsx` and their tests, proving the new boundary is active before Task 2.

- [ ] **Step 5: Commit the helper boundary**

```bash
git add apps/front-2/src/routes/authed/staff/tenants-list-helpers.ts apps/front-2/src/routes/authed/staff/tenants-list-helpers.test.ts
git commit -m "feat(front-2): canonicalize tenant status sets"
```

### Task 2: Tenant Route Multi-Select Behavior And Boundaries

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/tenants.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/deep-link-canonicalization.test.tsx`
- Modify: `apps/front-2/src/lib/query/staff-tenants.test.ts`
- Modify: `apps/front-2/src/lib/navigation/route-metadata.test.tsx`
- Modify: `apps/front-2/src/routes/authed/staff/tenants.tsx`

- [ ] **Step 1: Write failing route interaction assertions for persistent square checkboxes**

Replace the singular status tests with assertions that use canonical CSV route input and inspect the actual menu semantics:

```tsx
test('renders persistent square checkbox rows and a distinct All statuses reset', async () => {
	mocks.search = { status: 'active,suspended' };
	renderPage();

	const trigger = screen.getByTestId(
		'staff-tenants-table-status-filter-trigger',
	);
	expect(trigger.textContent).toContain('Active, Suspended');
	fireEvent.click(trigger);

	const all = await screen.findByTestId(
		'staff-tenants-table-status-filter-all',
	);
	const pending = screen.getByTestId(
		'staff-tenants-table-status-filter-pending',
	);
	const active = screen.getByTestId(
		'staff-tenants-table-status-filter-active',
	);
	const suspended = screen.getByTestId(
		'staff-tenants-table-status-filter-suspended',
	);

	expect(
		all.querySelector('[data-slot="dropdown-menu-checkbox-item-box"]'),
	).toBeNull();
	for (const item of [pending, active, suspended]) {
		expect(item.getAttribute('role')).toBe('menuitemcheckbox');
		expect(
			item.querySelector('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).not.toBeNull();
	}
	expect(active.getAttribute('aria-checked')).toBe('true');
	expect(suspended.getAttribute('aria-checked')).toBe('true');
});

test('toggles multiple statuses without closing and clears the cursor', async () => {
	const view = renderPage();
	const trigger = screen.getByTestId(
		'staff-tenants-table-status-filter-trigger',
	);
	fireEvent.click(trigger);
	fireEvent.click(
		await screen.findByTestId('staff-tenants-table-status-filter-active'),
	);

	expect(screen.getByTestId('staff-tenants-table-status-filter-suspended')).toBeTruthy();
	mocks.search = { status: 'active' };
	view.rerender(<RouteComponent />);
	fireEvent.click(
		await screen.findByTestId('staff-tenants-table-status-filter-suspended'),
	);

	expect(mocks.navigate).toHaveBeenLastCalledWith({
		search: expect.objectContaining({
			status: 'active,suspended',
			cursor: undefined,
		}),
		replace: true,
	});
});

test('deselects a selected status and All statuses resets the set', async () => {
	mocks.search = { status: 'active,suspended', cursor: 'cursor-2' };
	const view = renderPage();
	fireEvent.click(
		screen.getByTestId('staff-tenants-table-status-filter-trigger'),
	);
	fireEvent.click(
		await screen.findByTestId('staff-tenants-table-status-filter-active'),
	);
	expect(mocks.navigate).toHaveBeenLastCalledWith({
		search: expect.objectContaining({
			status: 'suspended',
			cursor: undefined,
		}),
		replace: true,
	});

	mocks.search = { status: 'suspended' };
	view.rerender(<RouteComponent />);
	fireEvent.click(
		screen.getByTestId('staff-tenants-table-status-filter-trigger'),
	);
	fireEvent.click(
		await screen.findByTestId('staff-tenants-table-status-filter-all'),
	);
	expect(mocks.navigate).toHaveBeenLastCalledWith({
		search: expect.objectContaining({ status: undefined, cursor: undefined }),
		replace: true,
	});
});
```

Keep assertions on menu persistence, visible checkbox boxes, `aria-checked`, canonical CSV, and cursor reset.

- [ ] **Step 2: Adapt the existing race, selection-lock, page-generation, and active-search tests**

Use CSV strings in `mocks.search`, and retain the existing timing assertions. The key replacements are:

```tsx
mocks.search = { status: 'active,suspended' };
renderResult.rerender(<RouteComponent />);

const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
	search?: Record<string, unknown>;
};
expect(lastCall?.search).toMatchObject({
	status: 'active,suspended',
	q: 'an',
});
```

For cursor reset, move from `active` to `active,suspended` and assert the page returns from 2 to 1. For the no-match state, add `mocks.search = { status: 'active,suspended' }` in one case to prove a non-empty array activates filtered-empty copy. Keep the row-selection test that cancels a pending debounce and the disabled trigger assertion unchanged.

- [ ] **Step 3: Add failing deep-link, query, and exclusive-navigation boundary tests**

Add two tenant router-boundary cases:

```tsx
test('tenants: mixed, duplicate, and partly invalid statuses rewrite canonically', async () => {
	const { router, history } = buildHarness(
		'/staff/tenants',
		asValidateSearch(TenantsRoute),
		(search) => ({
			status: parseTenantListSearchParams(search).status.join(','),
		}),
		'/staff/tenants?status=Suspended%2Cactive%2Cbogus%2Cactive',
	);
	render(<RouterProvider router={router} />);
	await waitFor(() => screen.getByTestId('resolved-search'));
	expect(screen.getByTestId('field-status').textContent).toBe(
		'active,suspended',
	);
	expect(new URL(history.location.href, 'http://localhost').searchParams.get('status')).toBe(
		'active,suspended',
	);
});

test('tenants: wholly invalid statuses are omitted', async () => {
	const { router, history } = buildHarness(
		'/staff/tenants',
		asValidateSearch(TenantsRoute),
		(search) => ({
			status: parseTenantListSearchParams(search).status.join(',') || 'all',
		}),
		'/staff/tenants?status=bogus%2Cunknown',
	);
	render(<RouterProvider router={router} />);
	await waitFor(() => screen.getByTestId('resolved-search'));
	expect(screen.getByTestId('field-status').textContent).toBe('all');
	expect(new URL(history.location.href, 'http://localhost').searchParams.has('status')).toBe(false);
});
```

Extend the staff-tenants query tests:

```ts
test('passes a canonical multi-status value through unchanged', () => {
	expect(
		buildFindStaffTenantsQueryParameters({ status: 'active,suspended' }),
	).toEqual({ status: 'active,suspended' });
});

test('keys combined statuses independently', () => {
	expect(
		staffTenantsQueryOptions.queryKey({ status: 'active,suspended' }),
	).toEqual([
		'staff',
		...STAFF_TENANTS_QUERY_KEY,
		{ status: 'active,suspended' },
	]);
});
```

Extend the tenant secondary-panel test:

```tsx
expect(
	isSecondaryPanelItemActive(pending, '/staff/tenants', {
		status: 'active,suspended',
	}),
).toBe(false);
expect(
	isSecondaryPanelItemActive(active, '/staff/tenants', {
		status: 'active,suspended',
	}),
).toBe(false);
expect(
	isSecondaryPanelItemActive(suspended, '/staff/tenants', {
		status: 'active,suspended',
	}),
).toBe(false);
expect(
	isSecondaryPanelItemActive(allTenants, '/staff/tenants', {
		status: 'active,suspended',
	}),
).toBe(false);
```

- [ ] **Step 4: Run focused tests and prove the route is still singular**

Run:

```bash
pnpm --filter front-2 exec vitest run \
  src/routes/authed/staff/tenants.test.tsx \
  src/routes/authed/staff/deep-link-canonicalization.test.tsx \
  src/lib/query/staff-tenants.test.ts \
  src/lib/navigation/route-metadata.test.tsx
```

Expected: FAIL on multi-status label/toggle/menu persistence and the new route-boundary expectations. Query pass-through tests may already pass; they are regression locks on the existing API seam.

- [ ] **Step 5: Implement the route with a canonical selected-status array**

Import `serializeTenantStatusFilter`, remove the unused separator/item imports, and replace the label/menu contract with:

```tsx
const formatTenantStatusFilterLabel = (
	statuses: readonly TenantStatusFilter[],
	t: (key: string) => string,
): string => {
	if (statuses.length === 0) {
		return t('all-statuses');
	}
	return statuses
		.map((status) => {
			if (status === 'pending') return t('status-pending');
			if (status === 'active') return t('status-active');
			return t('status-suspended');
		})
		.join(', ');
};

const TenantStatusFilterMenu = ({
	value,
	onChange,
	disabled,
}: {
	value: readonly TenantStatusFilter[];
	onChange: (next: TenantStatusFilter[]) => void;
	disabled?: boolean;
}) => {
	const { t } = useTranslation('common');
	const label = formatTenantStatusFilterLabel(value, t);
	const selected = new Set(value);

	const toggleStatus = (status: TenantStatusFilter): void => {
		onChange(
			selected.has(status)
				? value.filter((item) => item !== status)
				: TENANT_STATUS_FILTERS.filter(
						(item) => selected.has(item) || item === status,
					),
		);
	};

	return (
		<DropdownMenu>
			{/* Keep the existing trigger markup, ids, disabled state, title, and classes. */}
			<DropdownMenuContent align="end" sideOffset={6}>
				<DropdownMenuCheckboxItem
					checked={value.length === 0}
					closeOnClick
					data-testid="staff-tenants-table-status-filter-all"
					onCheckedChange={() => onChange([])}
				>
					{t('all-statuses')}
				</DropdownMenuCheckboxItem>
				{TENANT_STATUS_FILTERS.map((status) => (
					<DropdownMenuCheckboxItem
						key={status}
						checked={selected.has(status)}
						closeOnClick={false}
						showCheckbox
						data-testid={`staff-tenants-table-status-filter-${status}`}
						onCheckedChange={() => toggleStatus(status)}
					>
						{formatTenantStatusFilterLabel([status], t)}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
```

Do not retain the trailing `Clear` item or separator.

- [ ] **Step 6: Serialize only at controller/query/navigation boundaries**

Replace the singular setter and consumers with:

```tsx
const setStatusFilter = (next: TenantStatusFilter[]): void => {
	void navigate({
		search: serializeTenantListSearchParams({
			...search,
			status: next,
			cursor: undefined,
		}),
		replace: true,
	});
};

const serializedStatus = serializeTenantStatusFilter(search.status);
const controller = useTableController({
	search,
	onSearchChange,
	defaultSort: DEFAULT_SORT,
	defaultSize: DEFAULT_SIZE,
	cursorResetKey: serializedStatus ?? '',
});
const query = useStaffTenantsQuery({
	...controller.apiVariables,
	status: serializedStatus,
});
```

Set `hasActiveSearch={Boolean(controller.search.committed || search.status.length > 0)}`. Pass `value={search.status}` to the menu. This keeps arrays inside route/UI logic and strings at the existing query/client contract.

- [ ] **Step 7: Run all focused unit/boundary tests and typecheck**

Run:

```bash
pnpm --filter front-2 exec vitest run \
  src/routes/authed/staff/tenants-list-helpers.test.ts \
  src/routes/authed/staff/tenants.test.tsx \
  src/routes/authed/staff/deep-link-canonicalization.test.tsx \
  src/lib/query/staff-tenants.test.ts \
  src/lib/navigation/route-metadata.test.tsx
pnpm --filter front-2 typecheck
```

Expected: all focused Vitest files PASS and typecheck exits 0. Specifically retain green coverage for pending debounce cancellation, latest-route-search merging, selection lock, cursor generation reset, invalid deep links, combined query keys, and exclusive secondary shortcuts.

- [ ] **Step 8: Commit the route and boundary behavior**

```bash
git add \
  apps/front-2/src/routes/authed/staff/tenants.tsx \
  apps/front-2/src/routes/authed/staff/tenants.test.tsx \
  apps/front-2/src/routes/authed/staff/deep-link-canonicalization.test.tsx \
  apps/front-2/src/lib/query/staff-tenants.test.ts \
  apps/front-2/src/lib/navigation/route-metadata.test.tsx
git commit -m "feat(front-2): enable multi-status tenant filters"
```

### Task 3: Standardize Staff Invitation Reset Semantics

**Files:**
- Modify: `apps/front-2/src/routes/authed/staff/invitations/index.tsx`

- [ ] **Step 1: Add the compliant reset row before actual invitation statuses**

Replace the status menu contents with the reset-first contract:

```tsx
<DropdownMenuContent align="end" sideOffset={6}>
	<DropdownMenuCheckboxItem
		checked={selectedStatuses.length === 0}
		closeOnClick
		onCheckedChange={() => setStatuses([])}
	>
		{t('all-statuses')}
	</DropdownMenuCheckboxItem>
	{KNOWN_INVITATION_STATUSES.map((status) => (
		<DropdownMenuCheckboxItem
			key={status}
			checked={selectedStatuses.includes(status)}
			closeOnClick={false}
			showCheckbox
			onCheckedChange={() => toggleStatus(status)}
		>
			{t(getInvitationStatusLabelKey(status))}
		</DropdownMenuCheckboxItem>
	))}
</DropdownMenuContent>
```

Remove `DropdownMenuItem` and `DropdownMenuSeparator` from this file's imports if they become unused. Do not change the existing actual-value rows, status state, query behavior, or selection lock.

- [ ] **Step 2: Run typecheck as the source-level proof before the guard exists**

Run:

```bash
pnpm --filter front-2 typecheck
```

Expected: PASS with no unused imports or JSX typing errors.

- [ ] **Step 3: Commit the audited outlier correction**

```bash
git add apps/front-2/src/routes/authed/staff/invitations/index.tsx
git commit -m "fix(front-2): standardize status filter reset row"
```

### Task 4: Fail-Closed Repo-Wide Status Menu Guard

**Files:**
- Modify: `apps/front-2/scripts/check-design-system.test.mjs`
- Modify: `apps/front-2/scripts/check-design-system.mjs`

- [ ] **Step 1: Add positive fixtures for all supported status-menu shapes**

Import no new test libraries. Add a helper local to the test file:

```js
const scanStatusFixture = async (source) => {
	const root = await makeFixture({
		'src/routes/authed/staff/status-fixture.tsx': source,
	});
	return scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
};
```

Add positive tests covering a reset-key-discovered menu, a `STATUS_VALUES.map`-discovered menu, and a non-status persistent checkbox filter:

```js
test('status menu guard accepts persistent value checkboxes and an exclusive reset', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem checked={statuses.length === 0} closeOnClick>
				{t('all-statuses')}
			</DropdownMenuCheckboxItem>
			{STATUS_VALUES.map((status) => (
				<DropdownMenuCheckboxItem checked={statuses.includes(status)} closeOnClick={false} showCheckbox>
					{status}
				</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.equal(
		violations.some((item) => item.ruleId === 'status-filter-checkbox-contract'),
		false,
	);
});

test('status menu guard ignores persistent non-status filters', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			{LEVEL_VALUES.map((level) => (
				<DropdownMenuCheckboxItem closeOnClick={false}>{level}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.equal(
		violations.some((item) => item.ruleId === 'status-filter-checkbox-contract'),
		false,
	);
});
```

The live repository run in Step 6 is the positive fixture for all four real menus.

- [ ] **Step 2: Plant each required defect and assert the precise guard failure**

Add a table-driven negative suite. Each source is an intentional planted defect; it must fail for its named semantic, not merely produce any violation:

```js
for (const fixture of [
	{
		name: 'missing showCheckbox',
		item: '<DropdownMenuCheckboxItem closeOnClick={false}>{status}</DropdownMenuCheckboxItem>',
		message: /showCheckbox/,
	},
	{
		name: 'closing status value',
		item: '<DropdownMenuCheckboxItem closeOnClick>{status}</DropdownMenuCheckboxItem>',
		message: /closeOnClick=\{false\}/,
	},
]) {
	test(`status menu guard rejects ${fixture.name}`, async () => {
		const violations = await scanStatusFixture(`
			<DropdownMenuContent>
				<DropdownMenuCheckboxItem closeOnClick>{t('all-statuses')}</DropdownMenuCheckboxItem>
				{STATUSES.map((status) => (${fixture.item}))}
			</DropdownMenuContent>
		`);
		const violation = violations.find(
			(entry) => entry.ruleId === 'status-filter-checkbox-contract',
		);
		assert.ok(violation);
		assert.match(violation.message, fixture.message);
	});
}

test('status menu guard rejects a persistent status menu without All statuses', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			{STATUSES.map((status) => (
				<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox>{status}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.ok(violations.some(
		(entry) => entry.ruleId === 'status-filter-checkbox-contract' && /All statuses/.test(entry.message),
	));
});

for (const [name, attributes] of [
	['shows a checkbox', 'closeOnClick showCheckbox'],
	['does not explicitly close', 'closeOnClick={false}'],
]) {
	test(`status menu guard rejects an All statuses reset that ${name}`, async () => {
		const violations = await scanStatusFixture(`
			<DropdownMenuContent>
				<DropdownMenuCheckboxItem ${attributes}>{t('all-statuses')}</DropdownMenuCheckboxItem>
				{STATUSES.map((status) => (
					<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox>{status}</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		`);
		assert.ok(violations.some(
			(entry) => entry.ruleId === 'status-filter-checkbox-contract' && /reset/.test(entry.message),
		));
	});
}

test('status menu guard fails closed on spread-obscured item attributes', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem closeOnClick>{t('all-statuses')}</DropdownMenuCheckboxItem>
			{STATUSES.map((status) => (
				<DropdownMenuCheckboxItem {...statusItemProps}>{status}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.ok(violations.some(
		(entry) => entry.ruleId === 'status-filter-checkbox-contract' && /cannot classify/.test(entry.message),
	));
});
```

- [ ] **Step 3: Run the planted defects before implementing the rule**

Run:

```bash
node --test apps/front-2/scripts/check-design-system.test.mjs
```

Expected: FAIL because every new defect fixture receives no `status-filter-checkbox-contract` violation. Preserve this output as the explicit guard defect-planting/failure proof in the implementation packet report.

- [ ] **Step 4: Implement the TypeScript AST status-menu detector**

Add `import ts from 'typescript';` with the existing imports and implement these helpers before `scanFront2DesignSystem`:

```js
const STATUS_FILTER_RULE_ID = 'status-filter-checkbox-contract';

const jsxTagName = (node) => {
	const tagName = ts.isJsxElement(node)
		? node.openingElement.tagName
		: node.tagName;
	return tagName.getText();
};

const visitDescendants = (node, visitor) => {
	visitor(node);
	node.forEachChild((child) => visitDescendants(child, visitor));
};

const attributeNamed = (opening, name) =>
	opening.attributes.properties.find(
		(attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === name,
	);

const hasSpreadAttribute = (opening) =>
	opening.attributes.properties.some(ts.isJsxSpreadAttribute);

const isExplicitFalse = (attribute) =>
	attribute?.initializer &&
	ts.isJsxExpression(attribute.initializer) &&
	attribute.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword;

const isExplicitClosing = (attribute) =>
	Boolean(attribute) && !isExplicitFalse(attribute);

const lineForNode = (sourceFile, node) =>
	sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

const containsStatusMap = (menu, sourceFile) => {
	let found = false;
	visitDescendants(menu, (node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'map' &&
			/status/i.test(node.getText(sourceFile))
		) {
			found = true;
		}
	});
	return found;
};

const statusMenuViolations = (relativePath, source) => {
	if (!relativePath.startsWith('src/') || !relativePath.endsWith('.tsx')) {
		return [];
	}

	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	if (sourceFile.parseDiagnostics.length > 0) {
		return sourceFile.parseDiagnostics.map((diagnostic) => ({
			ruleId: STATUS_FILTER_RULE_ID,
			message: `cannot parse TSX status-menu candidate safely: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
			file: relativePath,
			line: diagnostic.start == null
				? 1
				: sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
			source: diagnostic.start == null ? '' : sourceFile.text.slice(diagnostic.start, diagnostic.start + (diagnostic.length ?? 1)),
		}));
	}

	const violations = [];
	visitDescendants(sourceFile, (node) => {
		if (!ts.isJsxElement(node) || jsxTagName(node) !== 'DropdownMenuContent') return;
		const menuText = node.getText(sourceFile);
		const isStatusMenu =
			/all-statuses/i.test(menuText) || containsStatusMap(node, sourceFile);
		if (!isStatusMenu) return;

		const items = [];
		visitDescendants(node, (child) => {
			if (
				(ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) &&
				jsxTagName(child) === 'DropdownMenuCheckboxItem'
			) items.push(child);
		});
		const resetItems = items.filter((item) => /all-statuses/i.test(item.getText(sourceFile)));
		const valueItems = items.filter((item) => !resetItems.includes(item));

		if (valueItems.length > 0 && resetItems.length !== 1) {
			violations.push({
				ruleId: STATUS_FILTER_RULE_ID,
				message: 'persistent status menu must contain exactly one All statuses reset item',
				file: relativePath,
				line: lineForNode(sourceFile, node),
				source: node.openingElement.getText(sourceFile),
			});
		}

		for (const item of valueItems) {
			const opening = ts.isJsxElement(item) ? item.openingElement : item;
			if (hasSpreadAttribute(opening)) {
				violations.push({ ruleId: STATUS_FILTER_RULE_ID, message: 'cannot classify status item attributes hidden by a JSX spread', file: relativePath, line: lineForNode(sourceFile, opening), source: opening.getText(sourceFile) });
				continue;
			}
			if (!attributeNamed(opening, 'showCheckbox')) violations.push({ ruleId: STATUS_FILTER_RULE_ID, message: 'status value must explicitly use showCheckbox', file: relativePath, line: lineForNode(sourceFile, opening), source: opening.getText(sourceFile) });
			if (!isExplicitFalse(attributeNamed(opening, 'closeOnClick'))) violations.push({ ruleId: STATUS_FILTER_RULE_ID, message: 'status value must explicitly use closeOnClick={false}', file: relativePath, line: lineForNode(sourceFile, opening), source: opening.getText(sourceFile) });
		}

		for (const reset of resetItems) {
			const opening = ts.isJsxElement(reset) ? reset.openingElement : reset;
			if (hasSpreadAttribute(opening)) violations.push({ ruleId: STATUS_FILTER_RULE_ID, message: 'cannot classify reset attributes hidden by a JSX spread', file: relativePath, line: lineForNode(sourceFile, opening), source: opening.getText(sourceFile) });
			if (attributeNamed(opening, 'showCheckbox')) violations.push({ ruleId: STATUS_FILTER_RULE_ID, message: 'All statuses reset must not use showCheckbox', file: relativePath, line: lineForNode(sourceFile, opening), source: opening.getText(sourceFile) });
			if (!isExplicitClosing(attributeNamed(opening, 'closeOnClick'))) violations.push({ ruleId: STATUS_FILTER_RULE_ID, message: 'All statuses reset must explicitly close on click', file: relativePath, line: lineForNode(sourceFile, opening), source: opening.getText(sourceFile) });
		}
	});
	return violations;
};
```

- [ ] **Step 5: Integrate the AST violations into the existing scan loop**

Immediately after each source file is read and added to `fileContentsByRelativePath`, append:

```js
violations.push(...statusMenuViolations(relativePath, source));
```

Do not add a suppression/debt exception. The scanner must parse every `src/**/*.tsx` file it scans, report parser diagnostics under the rule id, and fail closed on spread-obscured status/reset items.

- [ ] **Step 6: Re-run defect fixtures and the live repository guard**

Run:

```bash
node --test apps/front-2/scripts/check-design-system.test.mjs
pnpm --filter front-2 check:design-system
```

Expected: Node guard suite PASS, including each planted defect's named diagnostic. Live guard PASS with zero `status-filter-checkbox-contract` violations across the four audited status menus.

- [ ] **Step 7: Commit the invariant and its proof**

```bash
git add apps/front-2/scripts/check-design-system.mjs apps/front-2/scripts/check-design-system.test.mjs
git commit -m "test(front-2): guard status filter semantics"
```

### Task 5: Browser Contract And Final Verification

**Files:**
- Modify: `apps/front-2/e2e/staff-tenants.spec.ts`
- Modify: `apps/front-2/e2e/staff-invitations.spec.ts`

- [ ] **Step 1: Make the staff-tenant API mock return the union of CSV statuses**

Replace singular branching in `mockStaffTenantsByStatus` with:

```ts
const selectedStatuses = new Set(
	new URL(url).searchParams
		.get('status')
		?.split(',')
		.map((status) => status.trim().toLowerCase()) ?? [],
);
const allRows = [activeRow, suspendedRow];
const rows =
	selectedStatuses.size === 0
		? allRows
		: allRows.filter((row) =>
				selectedStatuses.has(row.status.toLowerCase()),
			);
```

- [ ] **Step 2: Replace the singular toolbar flow with a true multi-select browser scenario**

Use `URLSearchParams` for assertions so encoded commas cannot make the test brittle:

```ts
test('combines, narrows, and resets status values in one persistent checkbox menu', async ({ page }) => {
	await loginAsStaffAdmin(page);
	await mockStaffTenantsByStatus(page);
	await page.goto('/staff/tenants');

	const trigger = page.getByTestId('staff-tenants-table-status-filter-trigger');
	await trigger.click();
	const active = page.getByTestId('staff-tenants-table-status-filter-active');
	const suspended = page.getByTestId('staff-tenants-table-status-filter-suspended');
	await expect(
		active.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
	).toBeVisible();
	await expect(
		suspended.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
	).toBeVisible();

	await active.click();
	await expect(suspended).toBeVisible();
	await suspended.click();
	await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe(
		'active,suspended',
	);
	await expect(page.getByText('Acme Corporation')).toBeVisible();
	await expect(page.getByText('Globex Suspended Co')).toBeVisible();

	await active.click();
	await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe(
		'suspended',
	);
	await expect(page.getByText('Acme Corporation')).toHaveCount(0);
	await expect(page.getByText('Globex Suspended Co')).toBeVisible();

	const all = page.getByTestId('staff-tenants-table-status-filter-all');
	await expect(
		all.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
	).toHaveCount(0);
	await all.click();
	await expect(page.getByRole('menu')).toBeHidden();
	await expect.poll(() => new URL(page.url()).searchParams.has('status')).toBe(false);
	await expect(page.getByText('Acme Corporation')).toBeVisible();
	await expect(page.getByText('Globex Suspended Co')).toBeVisible();
});
```

Also assert the actual rows retain `role="menuitemcheckbox"` and update `aria-checked`; the nested box is visual and deliberately `aria-hidden`.

- [ ] **Step 3: Add a staff-invitations browser reset-row scenario**

Reuse the existing invitation response; this case verifies URL/reset/menu semantics rather than server-side row filtering:

```ts
test('All statuses resets and closes without a persistent square checkbox', async ({ page }) => {
	await loginAsStaffAdmin(page);
	await mockStaffInvitations(page, seededInvitationsPayload);
	await page.goto('/staff/invitations?status=pending,accepted');

	const trigger = page.getByRole('button', { name: /Pending, Accepted/i });
	await trigger.click();
	const allStatuses = page.getByRole('menuitemcheckbox', {
		name: 'All statuses',
	});
	await expect(
		allStatuses.locator('[data-slot="dropdown-menu-checkbox-item-box"]'),
	).toHaveCount(0);
	await allStatuses.click();
	await expect(page.getByRole('menu')).toBeHidden();
	await expect.poll(() => new URL(page.url()).searchParams.has('status')).toBe(false);
});
```

- [ ] **Step 4: Do not run Playwright in the implementation executor**

The implementation executor must stop after writing and statically checking the e2e files. The serialized verification owner, which exclusively owns the repository's single Docker e2e stack, will later run:

```bash
pnpm --filter front-2 exec playwright test \
  e2e/staff-tenants.spec.ts \
  e2e/staff-invitations.spec.ts
```

Expected for the serialized verification owner: both focused specs PASS. The implementation executor records this as **NOT RUN: serialized Playwright verification owner required**, not as a failure.

- [ ] **Step 5: Run all non-Playwright implementation gates**

Run from the repository root:

```bash
pnpm --filter front-2 exec vitest run \
  src/routes/authed/staff/tenants-list-helpers.test.ts \
  src/routes/authed/staff/tenants.test.tsx \
  src/routes/authed/staff/deep-link-canonicalization.test.tsx \
  src/lib/query/staff-tenants.test.ts \
  src/lib/navigation/route-metadata.test.tsx \
  src/components/ui/dropdown-menu.test.tsx
node --test apps/front-2/scripts/check-design-system.test.mjs
pnpm --filter front-2 check:design-system
npx oxlint \
  apps/front-2/src/routes/authed/staff/tenants-list-helpers.ts \
  apps/front-2/src/routes/authed/staff/tenants-list-helpers.test.ts \
  apps/front-2/src/routes/authed/staff/tenants.tsx \
  apps/front-2/src/routes/authed/staff/tenants.test.tsx \
  apps/front-2/src/routes/authed/staff/deep-link-canonicalization.test.tsx \
  apps/front-2/src/lib/query/staff-tenants.test.ts \
  apps/front-2/src/lib/navigation/route-metadata.test.tsx \
  apps/front-2/src/routes/authed/staff/invitations/index.tsx \
  apps/front-2/e2e/staff-tenants.spec.ts \
  apps/front-2/e2e/staff-invitations.spec.ts \
  apps/front-2/scripts/check-design-system.mjs \
  apps/front-2/scripts/check-design-system.test.mjs
pnpm --filter front-2 typecheck
```

Expected: focused Vitest PASS, guard tests PASS, live design-system guard reports zero violations, oxlint exits 0, and typecheck exits 0.

- [ ] **Step 6: Commit browser coverage**

```bash
git add apps/front-2/e2e/staff-tenants.spec.ts apps/front-2/e2e/staff-invitations.spec.ts
git commit -m "test(front-2): cover multi-status filters"
```

- [ ] **Step 7: Hand off the full acceptance gate to the verification owner**

After the focused Playwright command passes, the serialized verification owner runs the front-2 acceptance command required by the repository adapter:

```bash
pnpm --filter front-2 test
```

Expected: full front-2 Vitest suite, request-counter tests, design-system guard tests, context-isolation guard tests, and both live guards PASS. If the adapter additionally requires the full Playwright project, the same serialized owner runs it after the focused specs, never concurrently with another worktree's e2e stack.

### Final Review Checklist

- [ ] Confirm `git diff --stat develop...HEAD` contains only the twelve expected implementation files plus this plan/spec documentation.
- [ ] Confirm no API, generated client, route metadata source, dropdown primitive, translation, manifest, or lockfile changed.
- [ ] Confirm the tenant UI holds `TenantStatusFilter[]`, while router/query/client boundaries receive canonical `string | undefined`.
- [ ] Confirm `All statuses` is first, closes, resets, and has no persistent square checkbox in both changed menus.
- [ ] Confirm every actual status row explicitly uses `closeOnClick={false}` and `showCheckbox`.
- [ ] Confirm each planted guard defect failed before the rule and passes as a rejection fixture after the rule.
- [ ] Confirm the implementation executor did not run Playwright and the serialized verification owner recorded its focused/full results.
