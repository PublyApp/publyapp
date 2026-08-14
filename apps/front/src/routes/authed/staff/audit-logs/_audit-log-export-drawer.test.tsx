/** @vitest-environment jsdom */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	mutateAsync: vi.fn(),
	downloadFile: vi.fn(),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock('~/lib/query/staff-audit-logs', () => ({
	useExportStaffAuditLogsMutation: () => ({
		mutateAsync: mocks.mutateAsync,
		isPending: false,
	}),
}));

vi.mock('~/lib/download-file', () => ({
	downloadFile: mocks.downloadFile,
	formatExportDateStamp: (_date: Date) => '2026-01-02',
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: async () => undefined,
	toastLocalMutationResult: {
		error: (...args: unknown[]) => mocks.toastError(...args),
		success: (...args: unknown[]) => mocks.toastSuccess(...args),
	},
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AuditLogExportDrawer } from './_audit-log-export-drawer';

const renderDrawer = (props?: { filters?: { actions?: string[] } }) =>
	render(
		<AuditLogExportDrawer
			isOpen
			filters={props?.filters ?? {}}
			onOpenChange={() => undefined}
			onAuthFailure={() => undefined}
		/>,
	);

describe('AuditLogExportDrawer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('exports CSV with the current filters and downloads the response', async () => {
		const filters = {
			actions: ['user.created'],
			startDate: '2026-01-01',
			endDate: '2026-01-31',
		};
		mocks.mutateAsync.mockResolvedValueOnce(new ArrayBuffer(8));
		renderDrawer({ filters });

		fireEvent.click(screen.getByRole('button', { name: /export$/i }));

		await waitFor(() => {
			expect(mocks.mutateAsync).toHaveBeenCalledWith({
				format: 'csv',
				actions: ['user.created'],
				startDate: '2026-01-01',
				endDate: '2026-01-31',
			});
			expect(mocks.downloadFile).toHaveBeenCalledWith({
				data: expect.any(ArrayBuffer),
				fileName: 'audit-logs-2026-01-02.csv',
				mimeType: 'text/csv',
			});
		});
		expect(mocks.toastSuccess).toHaveBeenCalled();
	});

	test('reports an empty export response without downloading', async () => {
		mocks.mutateAsync.mockResolvedValueOnce(undefined);
		renderDrawer();

		fireEvent.click(screen.getByRole('button', { name: /export$/i }));

		await waitFor(() => {
			expect(mocks.toastError).toHaveBeenCalled();
		});
		expect(mocks.downloadFile).not.toHaveBeenCalled();
	});
});
