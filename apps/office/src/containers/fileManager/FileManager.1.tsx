import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import Iconify from '@devist/ui-react/components/Iconify';
import useBoolean from '@devist/ui-react/hooks/useBoolean';

import FileManagerNewFolderDialog from '@/office/components/file-manager/FileManagerNewFolderDialog';
import FileManagerGrid from '@/office/containers/fileManager/FileManagerGrid';

import FileManagerFilters from './FileManagerFilters';

// import { fileFormat } from '@/ui-react/utils/files.utils';
// import { _allFiles, FILE_TYPE_OPTIONS } from 'src/_mock';
// import { ConfirmDialog } from 'src/components/custom-dialog';
// import EmptyContent from 'src/components/empty-content';
// import { fileFormat } from 'src/components/file-thumbnail';
// import Iconify from 'src/components/iconify';
// import { useSettingsContext } from 'src/components/settings';
// import { getComparator, useTable } from 'src/components/table';
// import { useBoolean } from 'src/hooks/use-boolean';
// import type { IFile, IFileFilters, IFileFilterValue } from 'src/types/file';
// import { fTimestamp } from 'src/utils/format-time';
// import FileManagerFilters from '../file-manager-filters';
// import FileManagerFiltersResult from '../file-manager-filters-result';
// import FileManagerGridView from '../file-manager-grid-view';
// import FileManagerNewFolderDialog from '../file-manager-new-folder-dialog';
// //
// import FileManagerTable from '../file-manager-table';
// ----------------------------------------------------------------------
// const defaultFilters: IFileFilters = {
// 	name: '',
// 	type: [],
// 	startDate: null,
// 	endDate: null,
// };
// ----------------------------------------------------------------------
export const FileManager = () => {
	// const table = useTable({ defaultRowsPerPage: 10 });
	// const settings = useSettingsContext();
	// const openDateRange = useBoolean();
	// const confirm = useBoolean();
	const upload = useBoolean();

	// const [view, setView] = useState('list');
	// const view = 'grid';
	// const [tableData, setTableData] = useState(_allFiles);
	// const [filters, setFilters] = useState(defaultFilters);
	// const dateError =
	// 	filters.startDate && filters.endDate ? filters.startDate.getTime() > filters.endDate.getTime() : false;
	// const dataFiltered = applyFilter({
	// 	inputData: tableData,
	// 	comparator: getComparator(table.order, table.orderBy),
	// 	filters,
	// 	dateError,
	// });
	// const dataInPage = dataFiltered.slice(
	// 	table.page * table.rowsPerPage,
	// 	table.page * table.rowsPerPage + table.rowsPerPage,
	// );
	// const canReset = !!filters.name || !!filters.type.length || (!!filters.startDate && !!filters.endDate);
	// const notFound = (!dataFiltered.length && canReset) || !dataFiltered.length;
	// const handleChangeView = useCallback((event: React.MouseEvent<HTMLElement>, newView: string | null) => {
	// 	if (newView !== null) {
	// 		setView(newView);
	// 	}
	// }, []);
	// const handleFilters = useCallback(
	// 	(name: string, value: IFileFilterValue) => {
	// 		table.onResetPage();
	// 		setFilters((prevState) => {
	// 			return {
	// 				...prevState,
	// 				[name]: value,
	// 			};
	// 		});
	// 	},
	// 	[table],
	// );
	// const handleDeleteItem = useCallback(
	// 	(id: string) => {
	// 		const deleteRow = tableData.filter((row) => {
	// 			return row.id !== id;
	// 		});
	// 		setTableData(deleteRow);
	// 		table.onUpdatePageDeleteRow(dataInPage.length);
	// 	},
	// 	[dataInPage.length, table, tableData],
	// );
	// const handleDeleteItems = useCallback(() => {
	// 	const deleteRows = tableData.filter((row) => {
	// 		return !table.selected.includes(row.id);
	// 	});
	// 	setTableData(deleteRows);
	// 	table.onUpdatePageDeleteRows({
	// 		totalRows: tableData.length,
	// 		totalRowsInPage: dataInPage.length,
	// 		totalRowsFiltered: dataFiltered.length,
	// 	});
	// }, [dataFiltered.length, dataInPage.length, table, tableData]);
	// const handleResetFilters = useCallback(() => {
	// 	setFilters(defaultFilters);
	// }, []);
	const renderFilters = (
		<Stack spacing={2} direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-end', md: 'center' }}>
			<FileManagerFilters />

			{/* <ToggleButtonGroup size="small" value={view} exclusive onChange={handleChangeView}>
                <ToggleButton value="list">
                    <Iconify icon="solar:list-bold" />
                </ToggleButton>

                <ToggleButton value="grid">
                    <Iconify icon="mingcute:dot-grid-fill" />
                </ToggleButton>
            </ToggleButtonGroup> */}
		</Stack>
	);

	// const renderResults = (
	// 	<FileManagerFiltersResult
	// 		filters={filters}
	// 		onResetFilters={handleResetFilters}
	// 		//
	// 		canReset={canReset}
	// 		onFilters={handleFilters}
	// 		//
	// 		results={dataFiltered.length}
	// 	/>
	// );
	return (
		<>
			<Container maxWidth={/* settings.themeStretch ? false : 'lg' */ 'lg'}>
				<Stack direction="row" alignItems="center" justifyContent="space-between">
					<Typography variant="h4">File Manager</Typography>
					<Box>
						<Button variant="contained" startIcon={<Iconify icon="eva:cloud-upload-fill" />} onClick={upload.setTrue}>
							New Folder
						</Button>
						<Button variant="contained" startIcon={<Iconify icon="eva:cloud-upload-fill" />} onClick={upload.setTrue}>
							Upload
						</Button>
					</Box>
				</Stack>

				<Stack
					spacing={2.5}
					sx={{
						my: { xs: 3, md: 5 },
					}}
				>
					{renderFilters}

					{/* {canReset && renderResults} */}
				</Stack>

				{/* {notFound ? (
                <EmptyContent
                    filled
                    title="No Data"
                    sx={{
                        py: 10,
                    }}
                />
            ) : (
                <>
                    {view === 'list' ? (
                        <FileManagerTable
                            table={table}
                            tableData={tableData}
                            dataFiltered={dataFiltered}
                            onDeleteRow={handleDeleteItem}
                            notFound={notFound}
                            onOpenConfirm={confirm.onTrue}
                        />
                    ) : (
                        <FileManagerGridView
                            table={table}
                            data={tableData}
                            dataFiltered={dataFiltered}
                            onDeleteItem={handleDeleteItem}
                            onOpenConfirm={confirm.onTrue}
                        />
                    )}
                </>
                <FileManagerGridView
                table={table}
                data={tableData}
                dataFiltered={dataFiltered}
                onDeleteItem={handleDeleteItem}
                onOpenConfirm={confirm.onTrue}
                />
            )} */}
				<FileManagerGrid />
			</Container>

			<FileManagerNewFolderDialog open={upload.value} onClose={upload.setFalse} />

			{/* <ConfirmDialog
                open={confirm.value}
                onClose={confirm.onFalse}
                title="Delete"
                content={
                    <>
                        Are you sure want to delete <strong> {table.selected.length} </strong> items?
                    </>
                }
                action={
                    <Button
                        variant="contained"
                        color="error"
                        onClick={() => {
                            handleDeleteItems();
                            confirm.onFalse();
                        }}
                    >
                        Delete
                    </Button>
                }
            /> */}
		</>
	);
};
