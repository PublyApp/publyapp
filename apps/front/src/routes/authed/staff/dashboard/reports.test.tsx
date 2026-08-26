/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	exportMutation: {
		isPending: false,
		mutateAsync: vi.fn(),
	},
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('~/lib/query/staff-audit-logs', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-audit-logs')>();

	return {
		...actual,
		useExportStaffAuditLogsMutation: vi.fn(() => mocks.exportMutation),
	};
});

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastLocalMutationResult: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
	},
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

const EN_LABELS: TestLabelMap = {
	export: 'Export',
	'export-complete': 'Export complete',
	'export-failed': 'Export failed',
	exporting: 'Exporting…',
	'analytics-reports': 'Analytics & reports',
	'reports-coming-later-title': 'Analytics & reports are coming later',
	'reports-coming-later-description':
		'Usage dashboards and scheduled report summaries will appear here once the analytics API ships.',
	'reports-download': 'Download export',
	'reports-export-description':
		'Download every recorded audit event as CSV or JSON. Filtered exports are available from the audit logs page.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			if (EN_LABELS[key] !== undefined) {
				return EN_LABELS[key];
			}
			const separator = key.indexOf(':');
			if (separator !== -1) {
				return EN_LABELS[key.slice(separator + 1)] ?? key;
			}
			return key;
		},
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './reports';

const StaffDashboardReportsTab = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.exportMutation.isPending = false;
});

describe('StaffDashboardReportsTab', () => {
	test('offers the working audit-log export with format choice and download action', async () => {
		render(<StaffDashboardReportsTab />);

		expect(
			screen.getByTestId('staff-dashboard-reports-export-card'),
		).toBeTruthy();
		expect(screen.getByTestId('staff-dashboard-reports-format')).toBeTruthy();
		const download = screen.getByTestId('staff-dashboard-reports-download');
		expect(download.textContent).toContain('Download export');

		mocks.exportMutation.mutateAsync.mockResolvedValue(new ArrayBuffer(8));
		fireEvent.click(download);
		await waitFor(() => {
			expect(mocks.exportMutation.mutateAsync).toHaveBeenCalledWith({
				format: 'csv',
			});
		});
	});

	test('shows the honest coming-later state for analytics reports (no fabricated charts)', () => {
		render(<StaffDashboardReportsTab />);

		expect(screen.getByTestId('staff-dashboard-reports-empty')).toBeTruthy();
	});

	test('disables the download while the export is pending', () => {
		mocks.exportMutation.isPending = true;

		render(<StaffDashboardReportsTab />);

		const download = screen.getByTestId(
			'staff-dashboard-reports-download',
		) as HTMLButtonElement;
		expect(download.disabled).toBe(true);
		expect(download.textContent).toContain('Exporting');
	});

	test('sends an auth failure to logout instead of showing a toast', async () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.exportMutation.mutateAsync.mockRejectedValue(new Error('401'));

		render(<StaffDashboardReportsTab />);
		fireEvent.click(screen.getByTestId('staff-dashboard-reports-download'));

		await waitFor(() => {
			expect(screen.getByTestId('logout-redirect')).toBeTruthy();
		});
	});
});
