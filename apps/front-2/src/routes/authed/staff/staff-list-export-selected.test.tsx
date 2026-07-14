/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	downloadFile: vi.fn(),
}));

vi.mock('~/lib/download-file', () => ({
	downloadFile: mocks.downloadFile,
	formatExportDateStamp: () => '2026-07-14',
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

import { useRowSelection } from '~/components/table/use-row-selection';

import { StaffListExportSelectedAction } from './staff-list-export-selected';

type TestRow = { id: string; name: string; email: string };

const ROWS: TestRow[] = [
	{ id: 'row-1', name: 'Alex, "Ace"', email: 'alex@example.com' },
	{ id: 'row-2', name: 'Billie', email: 'billie@example.com' },
];

const Harness = ({ initiallySelected }: { initiallySelected: string[] }) => {
	const selection = useRowSelection(ROWS.map((row) => row.id));

	if (initiallySelected.length > 0 && selection.selectedCount === 0) {
		selection.onSelectionChange(new Set(initiallySelected));
	}

	return (
		<StaffListExportSelectedAction
			rows={ROWS}
			selection={selection}
			fileNamePrefix="staff-test"
			columns={[
				{ header: 'Name', getValue: (row) => row.name },
				{ header: 'Email', getValue: (row) => row.email },
			]}
		/>
	);
};

describe('StaffListExportSelectedAction', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	test('renders nothing while no row is selected', () => {
		render(<Harness initiallySelected={[]} />);

		expect(screen.queryByText('export-selected')).toBeNull();
	});

	test('exports only the selected rows as an escaped CSV on click', () => {
		render(<Harness initiallySelected={['row-1']} />);

		fireEvent.click(screen.getByText('export-selected'));

		expect(mocks.downloadFile).toHaveBeenCalledWith({
			data: 'Name,Email\r\n"Alex, ""Ace""",alex@example.com',
			fileName: 'staff-test-2026-07-14.csv',
			mimeType: 'text/csv;charset=utf-8',
		});
	});
});
