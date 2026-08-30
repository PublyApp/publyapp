/**
 * @vitest-environment jsdom
 *
 * Brief #1720 round 2 — edge case and parity validation:
 * 1. The column shows the truncated cause with the title for the full text
 * 2. The drawer uses the lastError from the detail request when available
 * 3. The formatFailureCause helper handles edge cases (spaces, special characters)
 * 4. The column and drawer display the same formatted value for the same cause
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

/** Drives the real seam (`useQuery`) on top of the module mock, which is inert
 * for the local hook. Without this, a test named "the drawer shows the detail's
 * cause" would pass for the wrong reason, by reading the row's cause instead. */
const NO_DETAIL = { data: null, isPending: false, isError: false } as const;

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useStaffDeadLettersQuery: vi.fn(),
	useStaffDeadLetterDetailQuery: vi.fn(),
	// `useStaffDeadLetterDetailQuery` is defined LOCALLY in dead-letter.tsx, so
	// the module mock above never reaches it. The only real seam is the
	// `useQuery` it wraps, and that is the file's only useQuery call.
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

// Mock the dropdown menu to render inline (no portal)
vi.mock('~/components/ui/dropdown-menu', () => {
	const React = require('react');
	return {
		DropdownMenu: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', { 'data-testid': 'dropdown-menu' }, children),
		DropdownMenuPortal: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', {}, children),
		DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
			React.createElement(
				'button',
				{ 'data-testid': 'dropdown-trigger' },
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

// Mock the drawer to render inline (no portal)
vi.mock('~/components/ui/drawer', () => {
	const React = require('react');
	return {
		Drawer: ({
			children,
			open,
		}: {
			children: React.ReactNode;
			open?: boolean;
		}) => (open ? React.createElement('div', {}, children) : null),
		DrawerBody: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', { 'data-testid': 'drawer-body' }, children),
		DrawerContent: ({
			children,
			'data-testid': testId,
		}: {
			children: React.ReactNode;
			'data-testid'?: string;
		}) => React.createElement('div', { 'data-testid': testId }, children),
		DrawerDescription: ({ children }: { children: React.ReactNode }) =>
			React.createElement('p', {}, children),
		DrawerHeader: ({ children }: { children: React.ReactNode }) =>
			React.createElement('div', { 'data-testid': 'drawer-header' }, children),
		DrawerTitle: ({ children }: { children: React.ReactNode }) =>
			React.createElement('h2', {}, children),
		DrawerTrigger: ({ children }: { children: React.ReactNode }) =>
			React.createElement('button', {}, children),
		DrawerClose: ({ children }: { children: React.ReactNode }) =>
			React.createElement(
				'button',
				{ 'data-testid': 'drawer-close' },
				children,
			),
		DrawerForm: ({ children }: { children: React.ReactNode }) =>
			React.createElement('form', {}, children),
	};
});

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
}));

import { formatFailureCause } from './_jobs-helpers';
import { Route } from './dead-letter';

const LONG_CAUSE =
	'System.Net.Http.HttpRequestException: The socket connection was reset. ---> System.Net.Sockets.SocketException (104): Connection reset by peer at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.ThrowException(SocketError error, CancellationToken cancellationToken, EndPoint endPoint) at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.GetStatusResult(Int16 token, Int32& bytesTransferred, EndPoint& endPoint, SocketFlags& flags) at PublyApp.Infrastructure.Email.SmtpEmailSender.SendAsync(EmailMessage message, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Email.SendEmailJob.HandleAsync(JobContext context, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessAsync(JobQueueItem item, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessWithPolicyAsync(JobQueueItem item, CancellationToken cancellationToken)';

const DEAD_LETTER_ROWS: StaffDeadLetterRow[] = [
	{
		id: 'dl-1',
		originalJobId: null,
		jobType: 'email.send',
		attempts: 3,
		lastError: LONG_CAUSE,
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

const t = (key: string): string =>
	key === 'common:no-cause' ? 'No cause recorded' : key;

describe('formatFailureCause helper: edge cases', () => {
	test('null returns marker', () => {
		expect(formatFailureCause(null, t)).toBe('No cause recorded');
	});

	test('undefined returns marker', () => {
		expect(formatFailureCause(undefined, t)).toBe('No cause recorded');
	});

	test('empty string returns marker', () => {
		expect(formatFailureCause('', t)).toBe('No cause recorded');
	});

	test('whitespace-only returns marker', () => {
		expect(formatFailureCause('   ', t)).toBe('No cause recorded');
		expect(formatFailureCause('\t\n', t)).toBe('No cause recorded');
	});

	test('cause with leading/trailing whitespace is trimmed', () => {
		expect(formatFailureCause('  boom  ', t)).toBe('boom');
		expect(formatFailureCause('\terror\n', t)).toBe('error');
	});

	test('cause with internal whitespace is preserved', () => {
		expect(formatFailureCause('Connection refused', t)).toBe(
			'Connection refused',
		);
		expect(formatFailureCause('One two three', t)).toBe('One two three');
	});

	test('cause with special characters is preserved', () => {
		const special = 'System.Net.Http.HttpRequestException: 104';
		expect(formatFailureCause(special, t)).toBe(special);
	});

	test('cause with unicode is preserved', () => {
		const unicode = 'Erreur de connexion: café';
		expect(formatFailureCause(unicode, t)).toBe(unicode);
	});

	test('long cause is returned in full', () => {
		expect(formatFailureCause(LONG_CAUSE, t)).toBe(LONG_CAUSE);
	});
});

describe('column: truncation and title attribute', () => {
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
			data: {
				lastError: LONG_CAUSE,
				attempts: 3,
				failedAt: null,
				payload: null,
			},
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('the column cell has the truncate class', () => {
		renderPage();

		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.className).toContain('truncate');
	});

	test('the column cell has a title attribute with the full cause', () => {
		renderPage();

		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.getAttribute('title')).toBe(LONG_CAUSE);
	});

	test('the column cell does NOT have title when cause is absent', () => {
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

		renderPage();

		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.getAttribute('title')).toBeNull();
	});
});

describe('drawer: uses detail query lastError when available', () => {
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
	});

	afterEach(() => {
		cleanup();
	});

	test('drawer shows detail query lastError when available', async () => {
		setDetailQuery({
			data: {
				lastError: 'Detail-specific error',
				attempts: 3,
				failedAt: null,
				payload: null,
			},
			isPending: false,
		});

		const user = userEvent.setup();
		renderPage();

		const actionTrigger = screen.getAllByTestId('dropdown-trigger')[0];
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer).toBeTruthy();

		// The drawer shows the detail query's lastError, not the row's
		// The DetailRow renders the value in a div, so we search the whole drawer
		const allText = drawer.textContent ?? '';
		expect(allText).toContain('Detail-specific error');
		// And it should NOT contain the row's LONG_CAUSE
		expect(allText).not.toContain(LONG_CAUSE);
	});

	test('drawer falls back to row lastError when detail is null', async () => {
		setDetailQuery({
			data: {
				lastError: null,
				attempts: 3,
				failedAt: null,
				payload: null,
			},
			isPending: false,
		});

		const user = userEvent.setup();
		renderPage();

		const actionTrigger = screen.getAllByTestId('dropdown-trigger')[0];
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer).toBeTruthy();

		// The drawer shows the row's lastError as fallback
		const detailValue = within(drawer).getByText(LONG_CAUSE);
		expect(detailValue).toBeTruthy();
		expect(detailValue.textContent).toBe(LONG_CAUSE);
	});

	test('drawer falls back to row lastError when detail query has no data', async () => {
		setDetailQuery({
			data: undefined,
			isPending: false,
		});

		const user = userEvent.setup();
		renderPage();

		const actionTrigger = screen.getAllByTestId('dropdown-trigger')[0];
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer).toBeTruthy();

		// The drawer shows the row's lastError as fallback
		const detailValue = within(drawer).getByText(LONG_CAUSE);
		expect(detailValue).toBeTruthy();
		expect(detailValue.textContent).toBe(LONG_CAUSE);
	});
});

describe('column and drawer: parity check', () => {
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
			data: {
				lastError: LONG_CAUSE,
				attempts: 3,
				failedAt: null,
				payload: null,
			},
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('column and drawer show the same formatted value for the same cause', async () => {
		const user = userEvent.setup();
		renderPage();

		// Get the column value
		const columnCell = screen.getByTestId('cell-last-error-dl-1');
		const columnValue = columnCell.textContent;

		// Open the drawer
		const actionTrigger = screen.getAllByTestId('dropdown-trigger')[0];
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer).toBeTruthy();

		// Get the drawer value (find the element with the cause text)
		const drawerValue = within(drawer).getByText(LONG_CAUSE);

		// Both should show the same formatted value
		expect(columnValue).toBe(drawerValue.textContent);
	});

	test('column and drawer both show the marker for absent cause', async () => {
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

		const user = userEvent.setup();
		renderPage();

		// Get the column value
		const columnCell = screen.getByTestId('cell-last-error-dl-1');
		expect(columnCell.textContent).toBe('No cause recorded');

		// Open the drawer
		const actionTrigger = screen.getAllByTestId('dropdown-trigger')[0];
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer).toBeTruthy();

		// The drawer also shows the marker
		const marker = within(drawer).getByText('No cause recorded');
		expect(marker).toBeTruthy();
	});
});
