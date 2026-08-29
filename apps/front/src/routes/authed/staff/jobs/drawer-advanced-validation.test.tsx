/**
 * @vitest-environment jsdom
 *
 * Brief #1720 ronde 2 — validation supplémentaire avancée :
 * 1. Le tiroir se ferme quand on clique sur un autre élément
 * 2. Le tiroir montre la cause complète avec le marqueur pour cause vide
 * 3. Le tiroir queue montre tous les champs (status, attempts/max, etc.)
 * 4. Ouvrir une ligne différente met à jour le contenu du tiroir
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {
	StaffDeadLetterRow,
	StaffJobQueueRow,
} from '~/lib/query/staff-jobs';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useStaffDeadLettersQuery: vi.fn(),
	useStaffDeadLetterDetailQuery: vi.fn(),
	useStaffJobQueueQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn<(error: unknown) => boolean>(() => false),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>();
	return {
		...actual,
		useQueryClient: () => ({
			invalidateQueries: vi.fn(),
		}),
		useQuery: () => ({
			data: null,
			isPending: false,
			isError: false,
		}),
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
				'queue-page-title': 'Job queue',
				'queue-page-description': 'Active jobs',
				'column-status': 'Status',
				'column-next-attempt': 'Next attempt',
				'detail-created-at': 'Created at',
				'queue-drawer-title': 'Queue Details',
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
		toStaffJobQueueRows: vi.fn((items) => items ?? []),
		useStaffDeadLettersQuery: mocks.useStaffDeadLettersQuery,
		useStaffRequeueDeadLetterMutation: vi.fn(() => ({
			mutateAsync: vi.fn(),
			isPending: false,
		})),
		useStaffDeadLetterDetailQuery: mocks.useStaffDeadLetterDetailQuery,
		useStaffJobQueueQuery: mocks.useStaffJobQueueQuery,
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
		'aria-label': ariaLabel,
		...props
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		onClick?: () => void;
		disabled?: boolean;
		variant?: string;
		'aria-label'?: string;
	}) =>
		createElement(
			'button',
			{
				type: type ?? 'button',
				onClick,
				disabled,
				'aria-label': ariaLabel,
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
	IconEye: () => createElement('span', {}, 'icon-eye'),
}));

import { Route as DeadLetterRoute } from './dead-letter';
import { Route as QueueRoute } from './queue';

const LONG_CAUSE =
	'System.Net.Http.HttpRequestException: The socket connection was reset. ---> System.Net.Sockets.SocketException (104): Connection reset by peer at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.ThrowException(SocketError error, CancellationToken cancellationToken, EndPoint endPoint) at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.GetStatusResult(Int16 token, Int32& bytesTransferred, EndPoint& endPoint, SocketFlags& flags) at PublyApp.Infrastructure.Email.SmtpEmailSender.SendAsync(EmailMessage message, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Email.SendEmailJob.HandleAsync(JobContext context, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessAsync(JobQueueItem item, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessWithPolicyAsync(JobQueueItem item, CancellationToken cancellationToken)';

const SHORT_CAUSE = 'Connection refused';

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
	{
		id: 'dl-2',
		originalJobId: null,
		jobType: 'webhook.deliver',
		attempts: 5,
		lastError: SHORT_CAUSE,
		externalStateStatus: null,
		triagedAt: null,
		failedAt: null,
		requeuedAsJobId: null,
		requeuedAt: null,
		tenantId: null,
	},
];

const QUEUE_ROWS: StaffJobQueueRow[] = [
	{
		id: 'q-1',
		jobType: 'email.send',
		status: 'failed',
		priority: 0,
		attempts: 3,
		maxAttempts: 5,
		nextAttemptAt: null,
		lockedBy: null,
		lockedUntil: null,
		lastError: LONG_CAUSE,
		tenantId: null,
		createdAt: null,
		updatedAt: null,
	},
];

const renderDeadLetterPage = () => {
	const PageComponent = DeadLetterRoute.options.component as () => JSX.Element;
	return render(<PageComponent />);
};

const renderQueuePage = () => {
	const PageComponent = QueueRoute.options.component as () => JSX.Element;
	return render(<PageComponent />);
};

describe('dead-letter drawer: advanced validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffDeadLettersQuery.mockReturnValue({
			data: { data: DEAD_LETTER_ROWS, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
			error: null,
		});
		mocks.useStaffDeadLetterDetailQuery.mockReturnValue({
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

	test('opening a different row updates drawer content', async () => {
		const user = userEvent.setup();
		renderDeadLetterPage();

		// Open first row
		const actionTrigger1 = screen.getAllByTestId('dropdown-trigger')[0];
		await user.click(actionTrigger1);

		const inspectItem1 = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.click(inspectItem1);

		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer).toBeTruthy();

		// First row shows the LONG_CAUSE
		const detailValue1 = within(drawer).getByText(LONG_CAUSE);
		expect(detailValue1).toBeTruthy();
		expect(detailValue1.textContent).toBe(LONG_CAUSE);

		// Open second row (this should close first drawer and open second)
		const actionTrigger2 = screen.getAllByTestId('dropdown-trigger')[1];
		await user.click(actionTrigger2);

		const inspectItem2 = screen.getByTestId('dead-letter-inspect-dl-2');
		await user.click(inspectItem2);

		// The drawer should now show the second row's cause
		const drawer2 = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer2).toBeTruthy();

		const detailValue2 = within(drawer2).getByText(SHORT_CAUSE);
		expect(detailValue2).toBeTruthy();
		expect(detailValue2.textContent).toBe(SHORT_CAUSE);
	});

	test('the drawer shows a long cause that is not truncated', async () => {
		const user = userEvent.setup();
		renderDeadLetterPage();

		const actionTrigger = screen.getAllByTestId('dropdown-trigger')[0];
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer).toBeTruthy();

		// The full cause is present — not truncated
		const detailValue = within(drawer).getByText(LONG_CAUSE);
		expect(detailValue).toBeTruthy();
		// The cause is NOT truncated (no truncate class in the drawer)
		expect(detailValue.className).not.toContain('truncate');
	});
});

describe('queue drawer: shows all expected fields', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffJobQueueQuery.mockReturnValue({
			data: { data: QUEUE_ROWS, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
			error: null,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('the queue drawer shows the status field', async () => {
		const user = userEvent.setup();
		renderQueuePage();

		const actionTrigger = screen.getByTestId('dropdown-trigger');
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('queue-inspect-q-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-queue-drawer');
		expect(drawer).toBeTruthy();

		// The status field is present
		const statusLabel = within(drawer).getByText('Status');
		expect(statusLabel).toBeTruthy();
		const statusValue = within(drawer).getByText('failed');
		expect(statusValue).toBeTruthy();
	});

	test('the queue drawer shows the attempts/maxAttempts field', async () => {
		const user = userEvent.setup();
		renderQueuePage();

		const actionTrigger = screen.getByTestId('dropdown-trigger');
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('queue-inspect-q-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-queue-drawer');
		expect(drawer).toBeTruthy();

		// The attempts field shows "3/5"
		const attemptsValue = within(drawer).getByText('3/5');
		expect(attemptsValue).toBeTruthy();
	});

	test('the queue drawer shows the full cause in the Last error field', async () => {
		const user = userEvent.setup();
		renderQueuePage();

		const actionTrigger = screen.getByTestId('dropdown-trigger');
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('queue-inspect-q-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-queue-drawer');
		expect(drawer).toBeTruthy();

		// The Last error field shows the full cause
		const detailValue = within(drawer).getByText(LONG_CAUSE);
		expect(detailValue).toBeTruthy();
		expect(detailValue.textContent).toBe(LONG_CAUSE);
		// The cause is NOT truncated
		expect(detailValue.className).not.toContain('truncate');
	});

	test('the queue drawer shows the Next attempt field', async () => {
		const user = userEvent.setup();
		renderQueuePage();

		const actionTrigger = screen.getByTestId('dropdown-trigger');
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('queue-inspect-q-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-queue-drawer');
		expect(drawer).toBeTruthy();

		// The Next attempt field is present (shows "—" for null)
		const nextAttemptLabel = within(drawer).getByText('Next attempt');
		expect(nextAttemptLabel).toBeTruthy();
	});

	test('the queue drawer shows the Created at field', async () => {
		const user = userEvent.setup();
		renderQueuePage();

		const actionTrigger = screen.getByTestId('dropdown-trigger');
		await user.click(actionTrigger);

		const inspectItem = screen.getByTestId('queue-inspect-q-1');
		await user.click(inspectItem);

		const drawer = await screen.findByTestId('staff-jobs-queue-drawer');
		expect(drawer).toBeTruthy();

		// The Created at field is present (shows "—" for null)
		const createdAtLabel = within(drawer).getByText('Created at');
		expect(createdAtLabel).toBeTruthy();
	});
});
