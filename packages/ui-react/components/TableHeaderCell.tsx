import { Button } from '@mui/material';
import { HeaderContext, RowData } from '@tanstack/react-table';

type Props<TData extends RowData = RowData, TValue = any> = {
	ctx: HeaderContext<TData, TValue>;
	label: string;
};

const TableHeaderCell = <TData extends RowData = RowData, TValue = any>({ ctx, label }: Props<TData, TValue>) => {
	return (
		<>
			{/* {ctx.header.column.id} */}
			{label}
			<Button
				onClick={() => {
					// ctx.header.column.getToggleSortingHandler()
					ctx.header.column.toggleSorting(undefined, true);
				}}
			>
				Sort:{' '}
				{{
					asc: ' 🔼',
					desc: ' 🔽',
				}[ctx.header.column.getIsSorted() as string] ?? '-'}
			</Button>
		</>
	);
};

export default TableHeaderCell;
