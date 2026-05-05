import Box from '@mui/material/Box';
import { MaterialReactTable } from 'material-react-table';

import StaffUsersBulkActionDialogs from './staff-users-bulk-action-dialogs.tsx';
import StaffUsersExportDialogController from './staff-users-export-dialog-controller.tsx';
import { useStaffUsersTableController } from './use-staff-users-table-controller.ts';

const StaffUsersTable = () => {
	const {
		table,
		rows,
		selectedRows,
		selectedCount,
		isSelectionMode,
		exportDialogRef,
		bulkActionDialog,
		isBulkSuspending,
		isBulkReactivating,
		isBulkDeleting,
		closeBulkActionDialog,
		handleBulkSuspend,
		handleBulkReactivate,
		handleBulkDelete,
	} = useStaffUsersTableController();

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				border: 'none',
			}}
		>
			<MaterialReactTable table={table} />

			<StaffUsersExportDialogController
				ref={exportDialogRef}
				isSelectionMode={isSelectionMode}
				selectedCount={selectedCount}
				rows={rows}
				selectedRows={selectedRows}
			/>

			<StaffUsersBulkActionDialogs
				dialogState={bulkActionDialog}
				selectedCount={selectedCount}
				isBulkSuspending={isBulkSuspending}
				isBulkReactivating={isBulkReactivating}
				isBulkDeleting={isBulkDeleting}
				onClose={closeBulkActionDialog}
				onBulkSuspend={handleBulkSuspend}
				onBulkReactivate={handleBulkReactivate}
				onBulkDelete={handleBulkDelete}
			/>
		</Box>
	);
};

export default StaffUsersTable;
