/**
 * @vitest-environment jsdom
 *
 * Brief #1720 ronde 2 — validation supplémentaire : tester le contenu réel
 * du tiroir queue en mockant les portails pour qu'ils rendent inline (sans
 * portal). Cela vérifie que le tiroir queue montre la cause complète après
 * clic, prouvant la parité avec le tiroir dead-letter.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { StaffJobQueueRow } from '~/lib/query/staff-jobs';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useStaffJobQueueQuery: vi.fn(),
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
				'queue-page-title': 'Job queue',
				'queue-page-description': 'Active jobs',
				'detail-last-error': 'Last error',
				'common:no-cause': 'No cause recorded',
				'common:no-value': '—',
				'common:column-attempts': 'Attempts',
				'column-status': 'Status',
				'column-next-attempt': 'Next attempt',
				'detail-created-at': 'Created at',
				'common:action-inspect': 'Inspect',
				'queue-drawer-title': 'Details',
				'no-rows-match-title': 'No matches',
				'no-rows-match-description': 'No jobs match.',
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
		toStaffJobQueueRows: vi.fn((items) => items ?? []),
		useStaffJobQueueQuery: mocks.useStaffJobQueueQuery,
	};
});

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: vi.fn(() => false),
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
		children: React.ReactNode;
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
			React.createElement('button', {}, children),
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
		columns: Array<{ id: string; cell: (ctx: unknown) => React.ReactNode }>;
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

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () =>
		createElement('div', { 'data-testid': 'logout-redirect' }, 'logout'),
}));

vi.mock('@tabler/icons-react', () => ({
	IconActivity: () => createElement('span', {}, 'icon-activity'),
	IconEye: () => createElement('span', {}, 'icon-eye'),
	IconDots: () => createElement('span', {}, 'icon-dots'),
}));

import { Route } from './queue';

const LONG_CAUSE =
	'System.Net.Http.HttpRequestException: The socket connection was reset. ---> System.Net.Sockets.SocketException (104): Connection reset by peer at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.ThrowException(SocketError error, CancellationToken cancellationToken, EndPoint endPoint) at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.GetStatusResult(Int16 token, Int32& bytesTransferred, EndPoint& endPoint, SocketFlags& flags) at PublyApp.Infrastructure.Email.SmtpEmailSender.SendAsync(EmailMessage message, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Email.SendEmailJob.HandleAsync(JobContext context, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessAsync(JobQueueItem item, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessWithPolicyAsync(JobQueueItem item, CancellationToken cancellationToken)';

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

const renderPage = () => {
	const PageComponent = Route.options.component as () => JSX.Element;
	return render(<PageComponent />);
};

describe('queue drawer: full content with inline portal mocks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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

	test('clicking Inspect opens the drawer and shows the full cause', async () => {
		const user = userEvent.setup();
		renderPage();

		// The drawer is not open initially
		expect(screen.queryByTestId('staff-jobs-queue-drawer')).toBeNull();

		// Click the action trigger button (⋯)
		const actionTrigger = screen.getByTestId('dropdown-trigger');
		await user.click(actionTrigger);

		// Click the Inspect item
		const inspectItem = screen.getByTestId('queue-inspect-q-1');
		await user.click(inspectItem);

		// The drawer should now be open and show the full cause
		const drawer = await screen.findByTestId('staff-jobs-queue-drawer');
		expect(drawer).toBeTruthy();

		// The drawer shows the full cause — not truncated, not a marker
		const detailValue = within(drawer).getByText(LONG_CAUSE);
		expect(detailValue).toBeTruthy();
		expect(detailValue.textContent).toBe(LONG_CAUSE);
	});

	test('the drawer shows the marker for an empty-string cause', async () => {
		const rowsWithEmptyCause: StaffJobQueueRow[] = [
			{ ...QUEUE_ROWS[0], lastError: '' },
		];
		mocks.useStaffJobQueueQuery.mockReturnValue({
			data: { data: rowsWithEmptyCause, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
			error: null,
		});

		const user = userEvent.setup();
		renderPage();

		// Click the action trigger button (⋯)
		const actionTrigger = screen.getByTestId('dropdown-trigger');
		await user.click(actionTrigger);

		// Click the Inspect item
		const inspectItem = screen.getByTestId('queue-inspect-q-1');
		await user.click(inspectItem);

		// The drawer should now be open and show the marker
		const drawer = await screen.findByTestId('staff-jobs-queue-drawer');
		expect(drawer).toBeTruthy();

		// The drawer shows the marker — not a blank cell
		const marker = within(drawer).getByText('No cause recorded');
		expect(marker).toBeTruthy();
	});

	test('the drawer shows the marker for a null cause', async () => {
		const rowsWithNullCause: StaffJobQueueRow[] = [
			{ ...QUEUE_ROWS[0], lastError: null },
		];
		mocks.useStaffJobQueueQuery.mockReturnValue({
			data: { data: rowsWithNullCause, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
			error: null,
		});

		const user = userEvent.setup();
		renderPage();

		// Click the action trigger button (⋯)
		const actionTrigger = screen.getByTestId('dropdown-trigger');
		await user.click(actionTrigger);

		// Click the Inspect item
		const inspectItem = screen.getByTestId('queue-inspect-q-1');
		await user.click(inspectItem);

		// The drawer should now be open and show the marker
		const drawer = await screen.findByTestId('staff-jobs-queue-drawer');
		expect(drawer).toBeTruthy();

		// The drawer shows the marker — not a blank cell
		const marker = within(drawer).getByText('No cause recorded');
		expect(marker).toBeTruthy();
	});
});
