/**
 * @vitest-environment jsdom
 *
 * Behaviour-level invalidation tests for StaffJobsDeadLetterPage (#1775).
 *
 * Covers the dead-letter "Remettre en file" (Requeue) mutation: the page must
 * call `invalidateQueries` with `['staff', 'staff-jobs']` after a successful
 * requeue, and must NOT call it when the mutation rejects.
 *
 * Follows the exact pattern of `system-jobs.test.tsx`: mock heavy UI
 * primitives at the module boundary so the real component renders through
 * `Route.options.component`, and assert on the query-client spy — the
 * artefact, not an assistant.
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	requeueMutation: { mutateAsync: vi.fn(), isPending: false },
	useStaffDeadLettersQuery: vi.fn(),
	useStaffDeadLetterDetailQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn<(error: unknown) => boolean>(() => false),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>();
	return {
		...actual,
		useQueryClient: () => ({
			invalidateQueries: mocks.invalidateQueries,
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
				'requeue-confirm-title': 'Requeue',
				'requeue-confirm-description': 'Requeue {{jobType}}?',
				'requeue-confirm-description-generic': 'Requeue this job?',
				'requeue-note-label': 'Note',
				'dl-drawer-title': 'Details',
				'detail-last-error': 'Last error',
				'no-rows-match-title': 'No matches',
				'no-rows-match-description': 'No dead letters match.',
				'action-permission-checking': 'Checking your permissions…',
				'action-permission-denied':
					"You don't have permission for this action.",
				'common:no-value': '—',
				'common:column-attempts': 'Attempts',
				'common:column-failed-at': 'Failed at',
				'common:no-audit-logs-yet': 'No audit logs yet',
				'common:no-audit-logs-description': 'There are no audit logs to show.',
				'common:action-requeue': 'Requeue',
				'common:cancel': 'Cancel',
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
		invalidateStaffJobsQueries: (queryClient: {
			invalidateQueries: (arg: unknown) => void;
		}) =>
			queryClient.invalidateQueries({
				queryKey: ['staff', 'staff-jobs'],
			}),
		toStaffDeadLetterRows: vi.fn((items) => items ?? []),
		useStaffDeadLettersQuery: mocks.useStaffDeadLettersQuery,
		useStaffRequeueDeadLetterMutation: vi.fn(() => ({
			mutateAsync: mocks.requeueMutation.mutateAsync,
			isPending: mocks.requeueMutation.isPending,
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
	ConfirmDialog: ({
		isOpen,
		children,
		onConfirm,
		title,
		description,
		confirmLabel,
		isPending,
	}: {
		isOpen: boolean;
		children: ReactNode;
		onConfirm?: () => void;
		title?: string;
		description?: string;
		confirmLabel?: string;
		isPending?: boolean;
	}) =>
		isOpen
			? createElement(
					'div',
					{ 'data-testid': 'requeue-confirm-dialog' },
					createElement('h2', { key: 'title' }, title),
					createElement('p', { key: 'desc' }, description),
					createElement(
						'button',
						{
							'data-testid': 'requeue-confirm',
							onClick: onConfirm,
							disabled: isPending,
						},
						confirmLabel,
					),
					children,
				)
			: null,
}));

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

vi.mock('~/components/table/data-table', () => ({
	DataTable: ({
		testId,
		columns,
		rows,
		queryState,
	}: {
		testId?: string;
		columns: Array<{ id: string; cell: (ctx: unknown) => ReactNode }>;
		rows: Array<{ id: string } & Record<string, unknown>>;
		queryState: { isPending: boolean; isError: boolean };
	}) =>
		createElement('div', { 'data-testid': testId }, [
			queryState.isPending
				? createElement('div', { key: 'loading' }, 'Loading...')
				: rows.map((row) =>
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

import { Route } from './dead-letter';

const DEAD_LETTER_ROWS: StaffDeadLetterRow[] = [
	{
		id: 'dl-1',
		originalJobId: null,
		jobType: 'email.send',
		attempts: 3,
		lastError: 'boom',
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

describe('dead-letter page: query invalidation after requeue (#1775)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffDeadLettersQuery.mockReturnValue({
			data: { data: DEAD_LETTER_ROWS, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
			error: null,
		});
		mocks.useStaffDeadLetterDetailQuery.mockReturnValue({
			data: null,
			isPending: false,
		});
		mocks.requeueMutation.mutateAsync.mockResolvedValue({ jobId: 'job-1' });
		mocks.requeueMutation.isPending = false;
	});

	afterEach(() => {
		cleanup();
	});

	test('requeue calls invalidateQueries with [staff, staff-jobs] after successful mutateAsync', async () => {
		renderPage();

		// Open the row's action menu, then click the Requeue item.
		const rowTrigger = await screen.findByTestId('row-dl-1');
		fireEvent.click(rowTrigger);
		const requeueItem = await screen.findByTestId('dead-letter-requeue-dl-1');
		fireEvent.click(requeueItem);

		// The ConfirmDialog appears — click confirm.
		const confirmButton = await screen.findByTestId('requeue-confirm');
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(mocks.requeueMutation.mutateAsync).toHaveBeenCalledWith({
				deadLetterId: 'dl-1',
				note: '',
			});
		});
		await waitFor(() => {
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-jobs'],
			});
		});
	});

	test('requeue does NOT call invalidateQueries when mutateAsync rejects', async () => {
		mocks.requeueMutation.mutateAsync.mockRejectedValue(
			new Error('Requeue failed'),
		);

		renderPage();

		const rowTrigger = await screen.findByTestId('row-dl-1');
		fireEvent.click(rowTrigger);
		const requeueItem = await screen.findByTestId('dead-letter-requeue-dl-1');
		fireEvent.click(requeueItem);

		const confirmButton = await screen.findByTestId('requeue-confirm');
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(mocks.requeueMutation.mutateAsync).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(mocks.invalidateQueries).not.toHaveBeenCalled();
		});
	});
});
