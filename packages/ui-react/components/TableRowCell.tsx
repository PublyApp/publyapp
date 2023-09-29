import { useEffect, useState, type ChangeEventHandler, type FocusEventHandler } from 'react';

import { Box, MenuItem, Select, TextField, type SelectChangeEvent } from '@mui/material';
import type { CellContext, SelectOption } from '@tanstack/react-table';

type Props<TData, TValue> = {
	ctx: CellContext<TData, TValue>;
};

const TableRowCell = <TData, TValue>({ ctx: { getValue, row, column, table } }: Props<TData, TValue>) => {
	const tableMeta = table.options.meta;
	const columnMeta = column.columnDef.meta;
	const initialValue: any = getValue();
	const [value, setValue] = useState<any>(initialValue); // !

	useEffect(() => {
		setValue(initialValue);
	}, [initialValue /* , getValue */]);

	const handleInputChange: ChangeEventHandler<HTMLInputElement> = (e) => {
		setValue(e.target.value);
		// tableMeta?.updateData(row.index, column.id, e.currentTarget.value);
	};

	const onBlur: FocusEventHandler = () => {
		tableMeta?.updateData(row.index, column.id, value);
	};

	const onSelectChange = (e: SelectChangeEvent<SelectOption>) => {
		setValue(e.target.value);
		// tableMeta?.updateData(row.index, column.id, e.target.value);
	};

	if (tableMeta?.editedRows[row.id]) {
		return columnMeta?.type === 'select' ? (
			<Select onChange={onSelectChange} defaultValue={columnMeta?.selectOptions[0]}>
				{columnMeta?.selectOptions?.map((option) => {
					return (
						<MenuItem key={option.value} value={option.value}>
							{option.label}
						</MenuItem>
					);
				})}
			</Select>
		) : (
			<TextField
				value={value}
				// onChange={(e) => {
				// 	setValue(e.target.value);
				// }}
				onBlur={onBlur}
				onChange={handleInputChange}
				type={column.columnDef.meta?.type || 'text'}
			/>
		);
	}

	return <Box>{value}</Box>;
};

export default TableRowCell;
