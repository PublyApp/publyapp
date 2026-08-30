/**
 * @vitest-environment jsdom
 *
 * Brief #1720 ronde 2: the dead-letter drawer must show the failure cause
 * through the SAME shared decision as the column — not a local `??` that
 * diverges. Before the fix, the drawer used `??` and rendered a blank cell
 * for an empty-string cause while the column correctly showed the marker.
 *
 * Brief #1815 ronde 3: the reviewer observed that two of the previous tests
 * gave `detail.lastError` and `inspected.lastError` the same value, so the
 * expression `detail?.lastError ?? inspected.lastError` could be replaced
 * by `inspected.lastError` without any test failing. This file splits the
 * two paths:
 *  - the "they differ" test seeds the row and the detail query with
 *    *different* causes and asserts the drawer shows the detail's cause
 *    (the `??` falls through to the row's only when detail is falsy);
 *  - the "row cause is empty" tests still confirm the marker path.
 *
 * Brief #1858 ronde 3: reviewer of #1827 swapped the drawer's `??` for `||`
 * and none of the suite reddened — no dataset carried a *falsy but non-null*
 * detail cause. The "empty-string detail cause" test below is the
 * discriminator: an empty detail cause is not an absent cause, the drawer
 * must keep the empty string and show the empty-cause marker, never the
 * row's cause. Proven: it turns red under `||` (and under dropping the
 * detail read entirely), green under `??`.
 *
 * The drawer is the real one (~/components/ui/drawer is a thin wrapper over
 * @base-ui/react/dialog). The dropdown menu is mocked inline (no portal) to
 * keep the inspect click deterministic; the real drawer is the artefact
 * under test — opening it is verified via `role="dialog"`.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

/** Pilote la vraie couture (`useQuery`) en plus du mock de module, qui est inerte
 * pour le hook local. Sans cela un test « le tiroir montre la cause du detail »
 * passerait a tort en lisant la cause de la ligne. */
const NO_DETAIL = { data: null, isPending: false, isError: false } as const;

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useStaffDeadLettersQuery: vi.fn(),
	useStaffDeadLetterDetailQuery: vi.fn(),
	// `useStaffDeadLetterDetailQuery` est defini LOCALEMENT dans dead-letter.tsx :
	// le mock de module ci-dessus ne l'atteint pas. La seule couture reelle est le
	// `useQuery` qu'il enveloppe, et c'est le seul appel a useQuery du fichier.
	useQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn<(error: unknown) => boolean>(() => false),
}));

const setDetailQuery = (value: Record<string, unknown>): void => {
	mocks.useStaffDeadLetterDetailQuery.mockReturnValue(value);
	mocks.useQuery.mockReturnValue({ isError: false, ...value });
};

vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>();
	return {
		...actual,
		useQueryClient: () => ({
			invalidateQueries: vi.fn(),
		}),
		useQuery: (...args: unknown[]) => mocks.useQuery(...args),
	};
});

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => mocks.navigate,
		useSearch: () => ({}) satisfies Record<string, unknown>,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: TestLabelMap = {
				'dl-page-title': 'Dead-letter jobs',
				'dl-page-description': 'Failed jobs',
				'detail-last-error': 'Last error',
				'common:no-cause': 'No cause recorded',
				'common:no-value': '—',
				'common:column-attempts': 'Attempts',
				'common:column-failed-at': 'Failed at',
				'common:action-inspect': 'Inspect',
				'common:action-requeue': 'Requeue',
				'common:cancel': 'Cancel',
				'requeue-confirm-title': 'Requeue',
				'requeue-confirm-description': 'Requeue {{jobType}}?',
				'requeue-confirm-description-generic': 'Requeue this job?',
				'requeue-note-label': 'Note',
				'dl-drawer-title': 'Details',
				'no-rows-match-title': 'No matches',
				'no-rows-match-description': 'No dead letters match.',
				'action-permission-checking': 'Checking your permissions…',
				'action-permission-denied':
					"You don't have permission for this action.",
				'common:no-audit-logs-yet': 'No audit logs yet',
				'common:no-audit-logs-description': 'There are no audit logs to show.',
			};

			let text = labels[key] ?? key;
			if (!options) {
				return text;
			}

			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}

			return text;
		},
		i18n: { language: 'en' },
	}),
}));

vi.mock('~/lib/query/staff-jobs', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-jobs')>();
	return {
		...actual,
		invalidateStaffJobsQueries: vi.fn(),
		toStaffDeadLetterRows: vi.fn((items) => items ?? []),
		useStaffDeadLettersQuery: mocks.useStaffDeadLettersQuery,
		useStaffRequeueDeadLetterMutation: vi.fn(() => ({
			mutateAsync: vi.fn(),
			isPending: false,
		})),
		useStaffDeadLetterDetailQuery: mocks.useStaffDeadLetterDetailQuery,
		staffDeadLetterDetailsQueryOptions: {
			queryKey: (_vars: { deadLetterId: string }) => [
				'staff',
				'staff-jobs',
				'dead-letter',
				'detail',
				_vars.deadLetterId,
			],
		},
	};
});

vi.mock('@org/shared-ts/lib/api-failure/to-api-failure', () => ({
	getFailureMessage: vi.fn(
		(_failure, options?: { fallback?: string }) =>
			options?.fallback ?? 'An error occurred',
	),
	toApiFailure: vi.fn((error: unknown) => ({
		status: (error as { status?: number })?.status ?? 500,
	})),
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/components/ui/button', () => ({
	Button: ({
		children,
		type,
		onClick,
		disabled,
		variant,
		...props
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		onClick?: () => void;
		disabled?: boolean;
		variant?: string;
	}) =>
		createElement(
			'button',
			{
				type: type ?? 'button',
				onClick,
				disabled,
				'data-variant': variant,
				...props,
			},
			children,
		),
	buttonVariants: () => '',
}));

vi.mock('~/components/ui/confirm-dialog', () => ({
	ConfirmDialog: () => null,
}));

vi.mock('~/components/ui/dropdown-menu', () => {
	const React = require('react');
	return {
		DropdownMenu: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', { 'data-testid': 'dropdown-menu' }, children),
		DropdownMenuPortal: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', {}, children),
		DropdownMenuTrigger: ({
			children,
			'aria-label': ariaLabel,
		}: {
			children: React.ReactNode;
			'aria-label'?: string;
		}) =>
			React.createElement(
				'button',
				{
					'data-testid': 'dropdown-trigger',
					'aria-label': ariaLabel,
				},
				children,
			),
		DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
			React.createElement(
				'div',
				{ 'data-testid': 'dropdown-content' },
				children,
			),
		DropdownMenuItem: ({
			children,
			onClick,
			disabled,
			title,
			'data-testid': testId,
		}: {
			children: React.ReactNode;
			onClick?: () => void;
			disabled?: boolean;
			title?: string;
			'data-testid'?: string;
		}) =>
			React.createElement(
				'button',
				{
					'data-testid': testId,
					onClick,
					disabled,
					title,
				},
				children,
			),
		DropdownMenuSeparator: () => React.createElement('hr'),
		DropdownMenuLabel: () => React.createElement('span'),
		DropdownMenuGroup: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', {}, children),
		DropdownMenuCheckboxItem: () => React.createElement('button'),
		DropdownMenuRadioGroup: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', {}, children),
		DropdownMenuRadioItem: () => React.createElement('button'),
		DropdownMenuSub: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', {}, children),
		DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) =>
			React.createElement('button', {}, children),
		DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', {}, children),
	};
});

// Note: the real Drawer (~/components/ui/drawer) is used here on purpose.
// It is a thin wrapper over @base-ui/react/dialog and renders as
// `role="dialog"` with `data-slot="drawer"`. The default portal target is
// `document.body` which jsdom supports. Tests find the drawer via
// `findByTestId('staff-jobs-dead-letter-drawer')` (the data-testid is
// spread onto the Base UI dialog popup element) and assert the role is
// `dialog`. If the inspected row never opens the drawer, the findByTestId rejects and
// the test fails — that is the "le tiroir s'ouvre" guarantee.

vi.mock('~/components/table/data-table', () => ({
	DataTable: ({
		testId,
		columns,
		rows,
	}: {
		testId?: string;
		columns: Array<{ id: string; cell: (ctx: unknown) => ReactNode }>;
		rows: Array<{ id: string } & Record<string, unknown>>;
	}) =>
		createElement('div', { 'data-testid': testId }, [
			rows.map((row) =>
				createElement(
					'div',
					{ key: row.id, 'data-testid': `row-${row.id}` },
					columns.map((col) =>
						createElement(
							'span',
							{ key: col.id, 'data-testid': `cell-${col.id}-${row.id}` },
							col.cell({ row: { original: row } }),
						),
					),
				),
			),
		]),
}));

vi.mock('./_permissions', () => ({
	useStaffJobPermissions: () => ({
		isPending: false,
		loadError: false,
		canView: true,
		canRequeue: true,
		canUpdateSystemJob: true,
		canTriggerSystemJob: true,
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () =>
		createElement('div', { 'data-testid': 'logout-redirect' }, 'logout'),
}));

vi.mock('@tabler/icons-react', () => ({
	IconActivity: () => createElement('span', {}, 'icon-activity'),
	IconRotateClockwise: () => createElement('span', {}, 'icon-rotate'),
	IconDots: () => createElement('span', {}, 'icon-dots'),
	IconX: () => createElement('span', { 'aria-hidden': 'true' }, '×'),
}));

import { Route } from './dead-letter';

const ROW_CAUSE = 'Cause from the row (list endpoint)';
const DETAIL_CAUSE = 'Cause from the detail (per-row endpoint)';
const PADDED_DETAIL_CAUSE = '  Cause from the detail (per-row endpoint)  ';
const TRIMMED_DETAIL_CAUSE = 'Cause from the detail (per-row endpoint)';

const DEAD_LETTER_ROWS: StaffDeadLetterRow[] = [
	{
		id: 'dl-1',
		originalJobId: null,
		jobType: 'email.send',
		attempts: 3,
		lastError: ROW_CAUSE,
		externalStateStatus: null,
		triagedAt: null,
		failedAt: null,
		requeuedAsJobId: null,
		requeuedAt: null,
		tenantId: null,
	},
];

const renderPage = () => {
	const PageComponent = Route.options.component as () => JSX.Element;
	return render(<PageComponent />);
};

const openDrawer = async (): Promise<HTMLElement> => {
	const user = userEvent.setup();
	const actionTrigger = screen.getAllByTestId('dropdown-trigger')[0];
	await user.click(actionTrigger);
	const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
	await user.click(inspectItem);
	return screen.findByTestId('staff-jobs-dead-letter-drawer');
};

describe('dead-letter drawer: cause display parity with column (brief #1720 ronde 2, #1815 ronde 3)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useQuery.mockReturnValue(NO_DETAIL);
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffDeadLettersQuery.mockReturnValue({
			data: { data: DEAD_LETTER_ROWS, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
			error: null,
		});
		setDetailQuery({
			data: null,
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	// — the two paths must look different —
	// Round-3 reviewer note: previous tests fed the same string to
	// `inspected.lastError` and `detail.lastError`, so the `??` was
	// observationally equivalent to `inspected.lastError`. This test gives
	// the row and the detail two different, both-truthy values and asserts
	// the drawer shows the DETAIL's value — that is the only way the
	// `??` (or the `??` collapsing to the row's value when the detail is
	// nullish) can be observed.
	test('the drawer shows the detail cause, not the row cause, when they differ', async () => {
		setDetailQuery({
			data: {
				lastError: DETAIL_CAUSE,
				attempts: 3,
				failedAt: null,
				payload: null,
			},
			isPending: false,
		});

		renderPage();

		const drawer = await openDrawer();
		expect(drawer.getAttribute('role')).toBe('dialog');

		// The row's cause must NOT appear in the drawer
		expect(within(drawer).queryByText(ROW_CAUSE)).toBeNull();
		// The detail's cause IS what the drawer shows
		const detailValue = within(drawer).getByText(DETAIL_CAUSE);
		expect(detailValue).toBeTruthy();
		expect(detailValue.textContent).toBe(DETAIL_CAUSE);
	});

	// Brief #1878: the suite never covered a cause with leading/trailing
	// whitespace in the drawer. If `formatFailureCause` returned the untrimmed
	// value, the drawer would render the raw padded string verbatim. This test
	// seeds a padded detail cause and asserts the rendered textContent is trimmed
	// — any future regression to `return cause` (instead of `return trimmed`)
	// turns this red.
	test('the drawer trims leading and trailing whitespace from the detail cause', async () => {
		setDetailQuery({
			data: {
				lastError: PADDED_DETAIL_CAUSE,
				attempts: 3,
				failedAt: null,
				payload: null,
			},
			isPending: false,
		});

		renderPage();

		const drawer = await openDrawer();
		expect(drawer.getAttribute('role')).toBe('dialog');

		// The drawer must show the trimmed value, not the padded original
		const detailValue = within(drawer).getByText(TRIMMED_DETAIL_CAUSE);
		expect(detailValue).toBeTruthy();
		expect(detailValue.textContent).toBe(TRIMMED_DETAIL_CAUSE);
		// The padded original must NOT appear anywhere
		expect(within(drawer).queryByText(PADDED_DETAIL_CAUSE)).toBeNull();
	});

	// Brief #1858: this is the ONE case that tells `??` from `||` apart — the
	// detail carries a *falsy but non-null* cause. An empty-string detail cause
	// is not an absent cause: the product shows the explicit empty-cause marker
	// (transparent-failure rule). `||` would silently discard the empty detail
	// cause and surface the ROW's cause, which is not the cause of the item
	// being inspected. Under `??` the empty string is retained and the marker
	// is shown. Any future swap of this `??` for `||` must turn this test red.
	test('the drawer retains an empty-string detail cause and shows the marker, not the row cause', async () => {
		setDetailQuery({
			data: {
				lastError: '',
				attempts: 3,
				failedAt: null,
				payload: null,
			},
			isPending: false,
		});

		renderPage();

		const drawer = await openDrawer();
		expect(drawer.getAttribute('role')).toBe('dialog');

		// The empty string survives the nullish coalescing: the marker is shown
		const marker = within(drawer).getByText('No cause recorded');
		expect(marker).toBeTruthy();
		// The row's (non-empty) cause must NOT leak into the drawer: it is not
		// the cause of the item being inspected
		expect(within(drawer).queryByText(ROW_CAUSE)).toBeNull();
	});

	// Round-3: the row can carry a real cause while the per-row detail
	// endpoint is silent on `lastError` (it returns null or omits the
	// field). The drawer must still surface the row's cause. The mirror
	// of the previous test: now the detail is nullish and the row is
	// the only source of truth.
	test('the drawer falls back to the row cause when the detail is silent on lastError', async () => {
		// Row carries a real cause
		// Detail's lastError is null (the per-row endpoint didn't return it)
		setDetailQuery({
			data: {
				lastError: null,
				attempts: 3,
				failedAt: null,
				payload: null,
			},
			isPending: false,
		});

		renderPage();

		const drawer = await openDrawer();
		expect(drawer.getAttribute('role')).toBe('dialog');

		// The row's cause IS what the drawer shows
		const rowValue = within(drawer).getByText(ROW_CAUSE);
		expect(rowValue).toBeTruthy();
		expect(rowValue.textContent).toBe(ROW_CAUSE);
		// The detail's value is null — must NOT show the marker
		expect(within(drawer).queryByText('No cause recorded')).toBeNull();
	});

	// Round-2 surface: the column shows the marker for an empty/whitespace/null
	// cause, the drawer must show the SAME marker. With the detail's lastError
	// also empty the drawer's text must still be the marker, not a blank cell.
	test('the drawer shows the same marker as the column for an empty-string cause', async () => {
		const rowsWithEmptyCause: StaffDeadLetterRow[] = [
			{ ...DEAD_LETTER_ROWS[0], lastError: '' },
		];
		mocks.useStaffDeadLettersQuery.mockReturnValue({
			data: { data: rowsWithEmptyCause, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
			error: null,
		});
		setDetailQuery({
			data: { lastError: '', attempts: 3, failedAt: null, payload: null },
			isPending: false,
		});

		renderPage();

		// The column cell shows the marker
		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.textContent).toBe('No cause recorded');

		const drawer = await openDrawer();
		expect(drawer.getAttribute('role')).toBe('dialog');

		// The drawer also shows the marker — not a blank cell
		const marker = within(drawer).getByText('No cause recorded');
		expect(marker).toBeTruthy();
	});

	test('the drawer shows the same marker as the column for a whitespace-only cause', async () => {
		const rowsWithWhitespaceCause: StaffDeadLetterRow[] = [
			{ ...DEAD_LETTER_ROWS[0], lastError: '   ' },
		];
		mocks.useStaffDeadLettersQuery.mockReturnValue({
			data: { data: rowsWithWhitespaceCause, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
			error: null,
		});
		setDetailQuery({
			data: { lastError: '   ', attempts: 3, failedAt: null, payload: null },
			isPending: false,
		});

		renderPage();

		// The column cell shows the marker
		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.textContent).toBe('No cause recorded');

		const drawer = await openDrawer();
		expect(drawer.getAttribute('role')).toBe('dialog');

		// The drawer also shows the marker — not a blank cell
		const marker = within(drawer).getByText('No cause recorded');
		expect(marker).toBeTruthy();
	});

	test('the drawer shows the same marker as the column for a null cause', async () => {
		const rowsWithNullCause: StaffDeadLetterRow[] = [
			{ ...DEAD_LETTER_ROWS[0], lastError: null },
		];
		mocks.useStaffDeadLettersQuery.mockReturnValue({
			data: { data: rowsWithNullCause, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
			error: null,
		});
		setDetailQuery({
			data: { lastError: null, attempts: 3, failedAt: null, payload: null },
			isPending: false,
		});

		renderPage();

		// The column cell shows the marker
		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.textContent).toBe('No cause recorded');

		const drawer = await openDrawer();
		expect(drawer.getAttribute('role')).toBe('dialog');

		// The drawer also shows the marker — not a blank cell
		const marker = within(drawer).getByText('No cause recorded');
		expect(marker).toBeTruthy();
	});
});
