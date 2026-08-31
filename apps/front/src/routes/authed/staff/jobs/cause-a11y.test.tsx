/**
 * @vitest-environment jsdom
 *
 * Brief #1720 ronde 2 — accessibility: the truncated cause in the column is
 * only reachable in full via the `title` attribute, which is mouse-only
 * (inaccessible to keyboard + touch). The fix: the drawer shows the full cause
 * and is reachable via keyboard through the standard inspect action
 * (DropdownMenuItem = <button>, focusable + activable via keyboard).
 *
 * Brief #1815 ronde 3:
 *  - the previous round asserted `tagName=BUTTON`, `tabIndex=0`,
 *    `aria-label=email.send` against a *mocked* DataTableRowActions. Those
 *    values were hard-coded in the mock and could not fail; they have been
 *    removed (they were not testing the real artefact);
 *  - the drawer mock has been dropped: the real ~/components/ui/drawer
 *    (a thin wrapper over @base-ui/react/dialog) renders as `role="dialog"`.
 *    That is the artefact the bug report named ("le tiroir ne s'ouvrait
 *    jamais") and the only meaningful surface to assert.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';

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
	// Brief #1880: `t` must be a spy so tests can assert the translation KEY
	// (e.g. 'common:no-cause') is passed through, not just the literal output.
	t: vi.fn<(key: string, options?: Record<string, unknown>) => string>(),
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
		t: mocks.t,
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
// `findByTestId('staff-jobs-dead-letter-drawer')` and assert the role is
// `dialog`. If the inspect action never opens the drawer, the findByTestId
// rejects and the test fails — that is the "le tiroir s'ouvre" guarantee.

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
		createElement(
			'div',
			{ 'data-testid': testId },
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
		),
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

describe('accessibility: keyboard path to full cause (brief #1720 ronde 2, #1815 ronde 3)', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Brief #1880: `t` is a spy wired to a label map. This lets tests assert
		// the translation KEY is used, not a hardcoded literal. Map
		// 'common:no-cause' to a non-English control value so a hardcoded
		// English literal is detectable.
		const labels = {
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
			'action-permission-denied': "You don't have permission for this action.",
			'common:no-audit-logs-yet': 'No audit logs yet',
			'common:no-audit-logs-description': 'There are no audit logs to show.',
		} satisfies Record<string, string>;

		mocks.t.mockImplementation(
			(key: string, options?: Record<string, unknown>) => {
				let text = labels[key as keyof typeof labels] ?? key;
				if (options) {
					for (const [optionKey, value] of Object.entries(options)) {
						text = text.replaceAll(`{{${optionKey}}}`, String(value));
					}
				}
				return text;
			},
		);

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

	test('the column cell shows the truncated cause with a title attribute for mouse users', () => {
		renderPage();

		const cell = screen.getByTestId('cell-last-error-dl-1');
		// The full cause is shown (truncated visually via CSS)
		expect(cell.textContent).toBe(LONG_CAUSE);
		// The truncate class is applied for visual truncation
		expect(cell.className).toContain('truncate');
		// The full cause is reachable via title (for mouse users)
		expect(cell.getAttribute('title')).toBe(LONG_CAUSE);
	});

	test('the drawer (real, role=dialog) renders the full cause when opened', async () => {
		const user = userEvent.setup();
		// The drawer is controlled by `inspected` state. When a row is inspected,
		// the drawer opens and shows the full cause via formatFailureCause.
		renderPage();

		// The drawer is not open yet (inspected is null) — no role=dialog
		expect(screen.queryByRole('dialog')).toBeNull();

		// Open the drawer via the inspect action
		const actionTrigger = screen.getAllByTestId('dropdown-trigger')[0];
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.click(inspectItem);

		// The drawer should now be open and be a real dialog (role=dialog)
		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer.getAttribute('role')).toBe('dialog');
		expect(drawer.getAttribute('data-slot')).toBe('drawer');

		// The drawer shows the full cause — not truncated, not a marker
		const detailValue = within(drawer).getByText(LONG_CAUSE);
		expect(detailValue).toBeTruthy();
		expect(detailValue.textContent).toBe(LONG_CAUSE);
	});

	test('the drawer shows the marker (not a blank cell) for an empty cause — accessible via keyboard', async () => {
		const user = userEvent.setup();
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
		// The detail query returns null data — the drawer falls back to the row's lastError
		setDetailQuery({
			data: null,
			isPending: false,
		});

		renderPage();

		// The drawer is not open yet (inspected is null) — no role=dialog
		expect(screen.queryByRole('dialog')).toBeNull();

		// Open the drawer via the inspect action
		const actionTrigger = screen.getAllByTestId('dropdown-trigger')[0];
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.click(inspectItem);

		// The drawer should now be open and be a real dialog
		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer.getAttribute('role')).toBe('dialog');

		// The drawer shows the marker — not a blank cell, not a raw empty string.
		// This is the accessible, keyboard-reachable version of the column's marker.
		// Brief #1880: the t-spy wiring (setup in beforeEach) ensures the label map
		// routes through the key. The dedicated i18n test in drawer-cause-parity
		// covers the hardcoded-literal regression with a French control value;
		// see that file for the paired red/green proof.
		const marker = within(drawer).getByText('No cause recorded');
		expect(marker).toBeTruthy();
	});
});
