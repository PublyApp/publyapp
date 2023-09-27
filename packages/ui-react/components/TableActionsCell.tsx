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

	return (
		<>
			{!tableMeta?.editedRows[row.id] ? (
				<>
					<Button variant="text" onClick={toggleEdit}>
						🖊
					</Button>
					<Button variant="text" disabled onClick={toggleEdit /* delete operation */}>
						❌
					</Button>
				</>
			) : (
				<>
					<Button variant="text" onClick={toggleEdit}>
						❎
					</Button>
					<Button variant="text" onClick={toggleEdit}>
						✅
					</Button>
				</>
			)}
		</>
	);
};

export default TableActionsCell;
