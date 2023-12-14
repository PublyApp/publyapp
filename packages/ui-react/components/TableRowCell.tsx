// import { useEffect, useState, type ChangeEventHandler, type FocusEventHandler } from 'react';

import { Box /* MenuItem, Select, */, TextField /* , type SelectChangeEvent  */ } from '@mui/material';
import type { CellContext /* , SelectOption */ } from '@tanstack/react-table';

import { ENABLE_TABLE_INLINE_EDITING } from '@/ui-react/lib/constants';

// import _ from 'lodash';

type Props<TData, TValue> = {
	ctx: CellContext<TData, TValue>;
};

// TODO: continue work on this feature

const TableRowCell = <TData, TValue>({ ctx: { getValue, row, column, table } }: Props<TData, TValue>) => {
	const tableMeta = table.options.meta;
	// const columnMeta = column.columnDef.meta;
	const value: any = getValue();
	// const [value, setValue] = useState<any>(''); // !

	// useEffect(() => {
	// 	setValue(initialValue);
	// }, [initialValue /* , getValue */]);

	// const handleInputChange: ChangeEventHandler<HTMLInputElement> = (e) => {
	// 	// setValue(e.target.value);
	// 	// tableMeta?.updateData(row.index, column.id, e.currentTarget.value);
	// };

	// const onBlur: FocusEventHandler<HTMLInputElement> = (e) => {
	// 	e.preventDefault();
	// 	// console.log('_______BLUR');
	// 	// tableMeta?.updateData(row.index, column.id, value);
	// };

	// const onSelectChange = (e: SelectChangeEvent<SelectOption>) => {
	// 	// setValue(e.target.value);
	// 	// tableMeta?.updateData(row.index, column.id, e.target.value);
	// };

	if (tableMeta?.editedRows[row.id] && ENABLE_TABLE_INLINE_EDITING) {
		// return columnMeta?.editingCell
		return (
			<TextField
				{...row.hookForm?.register(column.id)}
				// type={column.columnDef.meta?.type || 'text'}
			/>
		);
	}

	return <Box>{value}</Box>;
};

export default TableRowCell;
