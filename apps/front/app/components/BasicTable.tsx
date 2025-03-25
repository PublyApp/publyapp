import {
	MantineReactTable, // if using TypeScript (optional, but recommended)
	type MRT_RowData,
	type MRT_TableInstance,
} from 'mantine-react-table';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props<T extends MRT_RowData = MRT_RowData> = {
	table: MRT_TableInstance<T>;
};

const BasicTable = <T extends MRT_RowData = MRT_RowData>({ table }: Props<T>) => {
	return <MantineReactTable table={table} />;
};

export default BasicTable;
