export {};

declare module '@tanstack/react-table' {
	import type { Dispatch, SetStateAction } from 'react';

	import type { RowData, RowSelectionState } from '@tanstack/react-table';

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export interface TableMeta<TData extends RowData> {
		editedRows: RowSelectionState;
		setEditedRows: Dispatch<SetStateAction<RowSelectionState>>;
		updateData: (rowIndex: number, columnId: string, value: unknown) => void;
	}

	export type SelectOption = {
		value: any;
		label: string;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface ColumnMeta<TData extends RowData, TValue> {
		type: 'text' | 'number' | 'date' | 'select'; // TODO: add other types
		selectOptions: SelectOption[];
	}
}
