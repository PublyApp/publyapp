import { IconDownload } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
	FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME,
	FloatingSelectionBar,
} from '~/components/table/floating-selection-bar';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import { Button } from '~/components/ui/button';
import { downloadFile, formatExportDateStamp } from '~/lib/download-file';

export type CsvExportColumn<TRow> = {
	header: string;
	getValue: (row: TRow) => string;
};

const normalizeLeadingFormulaPrefix = (value: string): string => {
	const beginsWithFormula = /^[=+\-@]/.test(
		value.replace(/^[\u0000-\u001f\s]+/g, ''),
	);

	if (!beginsWithFormula) {
		return value;
	}

	return `'${value}`;
};

const escapeCsvField = (value: string): string => {
	const safeValue = normalizeLeadingFormulaPrefix(value);

	if (/[",\r\n]/.test(safeValue)) return `"${safeValue.replaceAll('"', '""')}"`;
	return safeValue;
};

const buildCsvContent = (headers: string[], rows: string[][]): string =>
	[headers, ...rows]
		.map((row) => row.map(escapeCsvField).join(','))
		.join('\r\n');

export type StaffListExportSelectedActionProps<TRow extends { id: string }> = {
	rows: TRow[];
	selection: UseRowSelectionResult;
	columns: Array<CsvExportColumn<TRow>>;
	fileNamePrefix: string;
};

/**
 * Bar-agnostic Export action (#820): renders ONLY the export button so a page
 * can place it inside its own selection bar next to other bulk actions.
 * Exports the selected rows to CSV from data already loaded client-side — no
 * backend endpoint required. Renders nothing while no row is selected.
 */
export const StaffListExportSelectedButton = <TRow extends { id: string }>({
	rows,
	selection,
	columns,
	fileNamePrefix,
}: StaffListExportSelectedActionProps<TRow>) => {
	const { t } = useTranslation('common');

	if (selection.selectedCount === 0) {
		return null;
	}

	const handleExport = () => {
		const selectedRows = rows.filter((row) => selection.rowSelection[row.id]);
		if (selectedRows.length === 0) {
			return;
		}

		const csv = buildCsvContent(
			columns.map((column) => column.header),
			selectedRows.map((row) => columns.map((column) => column.getValue(row))),
		);

		downloadFile({
			data: csv,
			fileName: `${fileNamePrefix}-${formatExportDateStamp(new Date())}.csv`,
			mimeType: 'text/csv;charset=utf-8',
		});
	};

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			onClick={handleExport}
			className={FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME}
		>
			<IconDownload aria-hidden="true" className="size-3.5" />
			{t('export-selected')}
		</Button>
	);
};

/**
 * Self-bar variant for surfaces that don't host any other selection action
 * yet: owns its own `FloatingSelectionBar`. Pages that compose several bulk
 * actions should render ONE bar and use {@link StaffListExportSelectedButton}
 * instead — two bars would stack portalled fixed overlays on top of each
 * other.
 */
export const StaffListExportSelectedAction = <TRow extends { id: string }>(
	props: StaffListExportSelectedActionProps<TRow>,
) => {
	const { rows, selection } = props;

	return (
		<FloatingSelectionBar
			selectedCount={selection.selectedCount}
			visibleCount={rows.length}
			allVisibleSelected={
				rows.length > 0 && rows.every((row) => selection.rowSelection[row.id])
			}
			onClear={selection.clearSelection}
			onSelectAllVisible={() =>
				selection.onSelectionChange(new Set(rows.map((row) => row.id)))
			}
		>
			<StaffListExportSelectedButton {...props} />
		</FloatingSelectionBar>
	);
};
