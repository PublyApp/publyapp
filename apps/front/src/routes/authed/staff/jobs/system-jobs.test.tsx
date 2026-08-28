/**
 * @vitest-environment jsdom
 *
 * Behaviour-level invalidation tests for StaffJobsSystemJobsPage (#1627 r5).
 *
 * Replaces the source-anchored regex tests in staff-jobs.test.ts (which
 * matched text patterns and were bypassable by block reordering). These
 * tests render the real component, trigger each mutation via the column
 * action callbacks, and assert invalidateQueries was called — making
 * block reordering a non-viable mutation.
 *
 * Covers three mutations on the system-jobs page:
 *   1. Enabled toggle (onToggleEnabled)
 *   2. Cron update (confirmCron via ConfirmDialog)
 *   3. Trigger now (onTriggerNow)
 *
 * The dead-letter requeue mutation is tested via the dead-letter page test
 * (dead-letter.test.tsx), not here.
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
import type { StaffSystemJobDefinitionRow } from '~/lib/query/staff-jobs';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	navigate: vi.fn(),
	enabledMutation: { mutateAsync: vi.fn() },
	cronMutation: { mutateAsync: vi.fn() },
	triggerMutation: { mutateAsync: vi.fn() },
	useStaffSystemJobDefinitionsQuery: vi.fn(),
	useStaffUpdateSystemJobEnabledMutation: vi.fn(),
	useStaffUpdateSystemJobCronMutation: vi.fn(),
	useStaffTriggerSystemJobMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn<(error: unknown) => boolean>(() => false),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => mocks.navigate,
		useSearch: () => ({}) as Record<string, unknown>,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: TestLabelMap = {
				'system-page-title': 'System Jobs',
				'system-page-description': 'System job definitions',
				'action-edit-cron': 'Schedule',
				'action-trigger-now': 'Trigger now',
				'cron-dialog-title': 'Edit schedule',
				'cron-dialog-description': 'Edit schedule for {{jobKey}}',
				'cron-expression-label': 'Cron expression',
				'action-save-cron': 'Save',
				'action-permission-checking': 'Checking your permissions…',
				'action-permission-denied':
					"You don't have permission for this action.",
				'no-rows-match-title': 'No matches',
				'no-rows-match-description': 'No system jobs match your search.',
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
		toStaffSystemJobDefinitionRows: vi.fn((items) => items ?? []),
		useStaffSystemJobDefinitionsQuery: mocks.useStaffSystemJobDefinitionsQuery,
		useStaffUpdateSystemJobEnabledMutation:
			mocks.useStaffUpdateSystemJobEnabledMutation,
		useStaffUpdateSystemJobCronMutation:
			mocks.useStaffUpdateSystemJobCronMutation,
		useStaffTriggerSystemJobMutation: mocks.useStaffTriggerSystemJobMutation,
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
		...props
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		onClick?: () => void;
		disabled?: boolean;
	}) =>
		createElement(
			'button',
			{
				type: type ?? 'button',
				onClick,
				disabled,
				...props,
			},
			children,
		),
	buttonVariants: () => '',
}));

vi.mock('~/components/ui/switch', () => ({
	Switch: ({
		checked,
		onCheckedChange,
		disabled,
		'data-testid': testId,
		'aria-label': ariaLabel,
	}: {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		disabled?: boolean;
		'data-testid'?: string;
		'aria-label'?: string;
	}) =>
		createElement('button', {
			'data-testid': testId,
			'aria-label': ariaLabel,
			'aria-checked': String(checked),
			'aria-disabled': disabled,
			disabled,
			onClick: () => onCheckedChange?.(!checked),
			role: 'switch',
		}),
}));

vi.mock('~/components/ui/confirm-dialog', () => ({
	ConfirmDialog: ({
		isOpen,
		children,
		onConfirm,
		title,
		description,
	}: {
		isOpen: boolean;
		children: ReactNode;
		onConfirm?: () => void;
		title?: string;
		description?: string;
	}) =>
		isOpen
			? createElement(
					'div',
					{ 'data-testid': 'cron-dialog' },
					createElement('h2', { key: 'title' }, title),
					createElement('p', { key: 'desc' }, description),
					createElement(
						'button',
						{
							'data-testid': 'cron-confirm',
							onClick: onConfirm,
						},
						'Save',
					),
					children,
				)
			: null,
}));

vi.mock('~/components/ui/input', () => ({
	Input: ({
		value,
		onChange,
		maxLength,
		id,
	}: {
		value?: string;
		onChange?: (e: { target: { value: string } }) => void;
		maxLength?: number;
		id?: string;
	}) =>
		createElement('input', {
			id,
			value,
			onChange,
			maxLength,
		}),
}));

vi.mock('~/components/ui/label', () => ({
	Label: ({ children, htmlFor }: { children: ReactNode; htmlFor: string }) =>
		createElement('label', { htmlFor }, children),
}));

vi.mock('~/components/ui/product-page', () => ({
	PageHeader: ({
		title,
		description,
	}: {
		title: ReactNode;
		description?: ReactNode;
	}) =>
		createElement('div', { 'data-testid': 'page-header' }, [
			createElement('h1', { key: 'title' }, title),
			createElement('p', { key: 'desc' }, description),
		]),
}));

vi.mock('~/components/ui/scroll-area', () => ({
	ScrollArea: ({ children }: { children: ReactNode }) =>
		createElement('div', {}, children),
}));

vi.mock('~/components/table/data-table', () => ({
	DataTable: ({
		testId,
		columns,
		rows,
		queryState,
	}: {
		testId?: string;
		columns: Array<{ id: string; cell: (ctx: unknown) => ReactNode }>;
		rows: Array<{ id: string; jobKey: string }>;
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
	IconPlayerPlay: () => createElement('span', {}, 'icon-play'),
	IconRefresh: () => createElement('span', {}, 'icon-refresh'),
}));

import { Route } from './system-jobs';

const SYSTEM_JOB_ROWS: StaffSystemJobDefinitionRow[] = [
	{
		id: 'sys-1',
		jobKey: 'email.send',
		cronExpression: '0 * * * *',
		isEnabled: true,
		lastEnqueuedAt: null,
		updatedAt: null,
	},
	{
		id: 'sys-2',
		jobKey: 'post.publish',
		cronExpression: '0 3 * * *',
		isEnabled: false,
		lastEnqueuedAt: null,
		updatedAt: null,
	},
];

const renderPage = () => {
	const PageComponent = Route.options.component as () => JSX.Element;
	return render(<PageComponent />);
};

describe('system-jobs page: query invalidation after mutations (#1627 r5)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffSystemJobDefinitionsQuery.mockReturnValue({
			data: { data: SYSTEM_JOB_ROWS, nextCursor: undefined },
			isPending: false,
			isError: false,
			isFetching: false,
		});
		mocks.useStaffUpdateSystemJobEnabledMutation.mockReturnValue({
			mutateAsync: mocks.enabledMutation.mutateAsync,
			isPending: false,
		});
		mocks.useStaffUpdateSystemJobCronMutation.mockReturnValue({
			mutateAsync: mocks.cronMutation.mutateAsync,
			isPending: false,
		});
		mocks.useStaffTriggerSystemJobMutation.mockReturnValue({
			mutateAsync: mocks.triggerMutation.mutateAsync,
			isPending: false,
		});
		mocks.enabledMutation.mutateAsync.mockResolvedValue({ id: 'sys-1' });
		mocks.cronMutation.mutateAsync.mockResolvedValue({ id: 'sys-1' });
		mocks.triggerMutation.mutateAsync.mockResolvedValue({ jobId: 'job-1' });
	});

	afterEach(() => {
		cleanup();
	});

	test('toggle-enabled calls invalidateQueries after successful mutateAsync', async () => {
		renderPage();

		const toggle = await screen.findByTestId('system-job-toggle-sys-1');
		fireEvent.click(toggle);

		await waitFor(() => {
			expect(mocks.enabledMutation.mutateAsync).toHaveBeenCalledWith({
				systemJobId: 'sys-1',
				isEnabled: false,
			});
		});
		await waitFor(() => {
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-jobs'],
			});
		});
	});

	test('cron update calls invalidateQueries after successful mutateAsync', async () => {
		renderPage();

		// Open the cron dialog by clicking the edit-cron button
		const editCron = await screen.findByTestId('system-job-edit-cron-sys-1');
		fireEvent.click(editCron);

		// Confirm the cron dialog (uses the draft value from the row)
		const confirmButton = await screen.findByTestId('cron-confirm');
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(mocks.cronMutation.mutateAsync).toHaveBeenCalledWith({
				systemJobId: 'sys-1',
				cronExpression: '0 * * * *',
			});
		});
		await waitFor(() => {
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-jobs'],
			});
		});
	});

	test('trigger-now calls invalidateQueries after successful mutateAsync', async () => {
		renderPage();

		const trigger = await screen.findByTestId('system-job-trigger-sys-1');
		fireEvent.click(trigger);

		await waitFor(() => {
			expect(mocks.triggerMutation.mutateAsync).toHaveBeenCalledWith({
				systemJobId: 'sys-1',
			});
		});
		await waitFor(() => {
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-jobs'],
			});
		});
	});

	test('toggle-enabled does NOT call invalidateQueries when mutateAsync rejects', async () => {
		mocks.enabledMutation.mutateAsync.mockRejectedValue(
			new Error('Toggle failed'),
		);

		renderPage();

		const toggle = await screen.findByTestId('system-job-toggle-sys-1');
		fireEvent.click(toggle);

		await waitFor(() => {
			expect(mocks.enabledMutation.mutateAsync).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(mocks.invalidateQueries).not.toHaveBeenCalled();
		});
	});

	test('trigger-now does NOT call invalidateQueries when mutateAsync rejects', async () => {
		mocks.triggerMutation.mutateAsync.mockRejectedValue(
			new Error('Trigger failed'),
		);

		renderPage();

		const trigger = await screen.findByTestId('system-job-trigger-sys-1');
		fireEvent.click(trigger);

		await waitFor(() => {
			expect(mocks.triggerMutation.mutateAsync).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(mocks.invalidateQueries).not.toHaveBeenCalled();
		});
	});
});
