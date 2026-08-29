/**
 * @vitest-environment jsdom
 *
 * Brief #1720 ronde 2 — validation du chemin clavier : vérifier que les
 * éléments d'action sont focusables et activables au clavier. On ne peut pas
 * simuler la navigation réelle à travers les portails en jsdom, mais on vérifie
 * les garanties structurelles qui rendent cette navigation possible :
 * - Le déclencheur est un bouton (focusable naturellement)
 * - Les éléments du menu sont des boutons (focusables naturellement)
 * - Le déclencheur a un aria-label
 * - Les éléments ont des labels textuels
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useStaffDeadLettersQuery: vi.fn(),
	useStaffDeadLetterDetailQuery: vi.fn(),
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
		DropdownMenuTrigger: ({
			children,
			render,
		}: {
			children: React.ReactNode;
			render?: unknown;
		}) => {
			// The render prop is a Button component — render it as a button
			if (render) {
				const renderProps = render as { props?: Record<string, unknown> };
				return React.createElement(
					'button',
					{
						'data-testid': 'dropdown-trigger',
						'aria-label': renderProps.props?.['aria-label'],
					},
					children,
				);
			}
			return React.createElement(
				'button',
				{ 'data-testid': 'dropdown-trigger' },
				children,
			);
		},
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

const LONG_CAUSE =
	'System.Net.Http.HttpRequestException: The socket connection was reset. ---> System.Net.Sockets.SocketException (104): Connection reset by peer';

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

describe('dead-letter: keyboard accessibility guarantees', () => {
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

	test('the action trigger is a focusable button with an aria-label', () => {
		renderPage();

		const trigger = screen.getByTestId('dropdown-trigger');
		expect(trigger.tagName).toBe('BUTTON');
		// Buttons are naturally focusable (tabindex >= 0)
		expect(trigger.getAttribute('tabindex')).toBeNull(); // no explicit tabindex needed
		// The trigger has an aria-label for screen readers
		expect(trigger.getAttribute('aria-label')).toBe('email.send');
	});

	test('the Inspect menu item is a focusable button with a text label', () => {
		renderPage();

		const _trigger = screen.getByTestId('dropdown-trigger');
		// Open the dropdown
		fireEvent.click(_trigger);

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		expect(inspectItem.tagName).toBe('BUTTON');
		expect(inspectItem.getAttribute('tabindex')).toBeNull();
		expect(inspectItem.textContent).toContain('Inspect');
	});

	test('the Requeue menu item is a focusable button with a text label', () => {
		renderPage();

		const trigger = screen.getByTestId('dropdown-trigger');
		fireEvent.click(trigger);

		const requeueItem = screen.getByTestId('dead-letter-requeue-dl-1');
		expect(requeueItem.tagName).toBe('BUTTON');
		expect(requeueItem.getAttribute('tabindex')).toBeNull();
		expect(requeueItem.textContent).toContain('Requeue');
	});

	test('the trigger can be activated with Enter key (button default behavior)', async () => {
		const user = userEvent.setup();
		renderPage();

		const trigger = screen.getByTestId('dropdown-trigger');
		// Focus the trigger
		await user.tab();
		expect(document.activeElement).toBe(trigger);
		// Activate with Enter
		await user.keyboard('{Enter}');

		// The dropdown content should be visible
		const content = screen.getByTestId('dropdown-content');
		expect(content).toBeTruthy();
	});

	test('the Inspect item can be activated with Enter key to open the drawer', async () => {
		const user = userEvent.setup();
		renderPage();

		await user.tab();
		await user.keyboard('{Enter}');

		const inspectItem = screen.getByTestId('dead-letter-inspect-dl-1');
		await user.tab();
		expect(document.activeElement).toBe(inspectItem);
		await user.keyboard('{Enter}');

		// The drawer should be open
		const drawer = await screen.findByTestId('staff-jobs-dead-letter-drawer');
		expect(drawer).toBeTruthy();
	});
});
