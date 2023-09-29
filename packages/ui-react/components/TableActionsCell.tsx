import { Button } from '@mui/material';
import type { CellContext, RowSelectionState } from '@tanstack/react-table';

type Props<TData, TValue> = {
	ctx: CellContext<TData, TValue>;
};

const TableActionsCell = <TData, TValue>({ ctx: { row, table } }: Props<TData, TValue>) => {
	const tableMeta = table.options.meta;

	const toggleEdit = () => {
		tableMeta?.setEditedRows((old: RowSelectionState) => {
			return {
				...old,
				[row.id]: !old[row.id],
			};
		});
	};

	const handleOpenEdit = () => {
		toggleEdit();
	};

	const handleCancelEdit = () => {
		tableMeta?.revertData(row.index, true);
		toggleEdit();
	};

	const handleSave = () => {
		toggleEdit();
		tableMeta?.revertData(row.index, false);
	};

	return (
		<>
			{!tableMeta?.editedRows[row.id] ? (
				<>
					<Button variant="text" onClick={handleOpenEdit}>
						🖊
					</Button>
					<Button variant="text" disabled /* onClick={handleDelete} */>
						❌
					</Button>
				</>
			) : (
				<>
					<Button variant="text" onClick={handleCancelEdit}>
						❎
					</Button>
					<Button variant="text" onClick={handleSave}>
						✅
					</Button>
				</>
			)}
		</>
	);
};

export default TableActionsCell;
