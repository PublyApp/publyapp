import type { MouseEventHandler } from 'react';

import { Button } from '@mui/material';
import type { CellContext, RowSelectionState } from '@tanstack/react-table';

import { ENABLE_TABLE_INLINE_EDITING } from '@ui-react/utils/constants';

type Props<TData, TValue> = {
	ctx: CellContext<TData, TValue>;
};

const TableActionsCell = <TData, TValue>({ ctx: { row, table } }: Props<TData, TValue>) => {
	const tableMeta = table.options.meta;

	const toggleRowEditInline = () => {
		tableMeta?.setEditedRows((old: RowSelectionState) => {
			return {
				...old,
				[row.id]: !old[row.id],
			};
		});
	};

	const handleOpenEditInline = () => {
		toggleRowEditInline();
	};

	const handleCancelEditInline: MouseEventHandler<HTMLButtonElement> = (e) => {
		e.preventDefault();
		// tableMeta?.revertData(row.index, true);
		toggleRowEditInline();
	};

	const handleSaveInline = () => {
		toggleRowEditInline();
		// tableMeta?.revertData(row.index, false);
	};

	// --------------------------------------------------------------------------------------//
	//                                     dialog mode                                      //
	// --------------------------------------------------------------------------------------//
	const handleOpenEditDialog = () => {
		tableMeta?.toggleEditDialog();
		tableMeta?.setDialogEditedRow(row);
	};

	return (
		<>
			{!tableMeta?.editedRows[row.id] ? (
				<>
					<Button variant="text" onClick={handleOpenEditDialog}>
						🖊
					</Button>
					<Button variant="text" disabled={!ENABLE_TABLE_INLINE_EDITING} onClick={handleOpenEditInline}>
						🖊 (inline)
					</Button>
					<Button variant="text" disabled /* onClick={handleDelete} */>
						❌
					</Button>
				</>
			) : (
				<>
					<Button variant="text" onClick={handleCancelEditInline}>
						❎
					</Button>
					<Button variant="text" onClick={handleSaveInline}>
						✅
					</Button>
				</>
			)}
		</>
	);
};

export default TableActionsCell;
