import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

// import { BO_PATH_NAMES } from '@devist/shared/lib/constants';
import { getSaveWebHostInputSchema, type SaveWebHostInput } from '@devist/shared/validations/webHost.validations';
import { ENABLE_TABLE_INLINE_EDITING } from '@devist/ui-react/lib/constants';
import { useSaveWebHost } from '@devist/ui-react/lib/react-query/features/webHosts/webHost.hooks';

import useWebHosts from './useWebHosts';
import WebHostsTable from './WebHostsTable';

const WebHosts = () => {
	const navigate = useNavigate();
	const {
		setDialogEditedRow,
		dialogEditedRow,
		editDialogOpen,
		toggleEditDialog,
		getWebHostsReturn: {
			result: { refetch: refetchWebHostList },
		},
	} = useWebHosts();

	const dialogRowData = dialogEditedRow?.original;

	const { t } = useTranslation();
	const saveWebHostInputSchema = getSaveWebHostInputSchema(t);

	const form = useForm<SaveWebHostInput>({
		resolver: zodResolver(saveWebHostInputSchema),
		values: {
			objectId: dialogRowData?.objectId,
			name: dialogRowData?.translations.en.name ?? '',
			description: dialogRowData?.translations.en.description ?? '',
		},
	});

	const handleEditDialogClose = () => {
		if (editDialogOpen) {
			toggleEditDialog();
		}

		form.reset();
	};

	const handleEditDialogCancel = () => {
		handleEditDialogClose();
	};

	const {
		result: { mutate: saveWebHost, isPending: isSaveWebHostPending },
	} = useSaveWebHost({
		successMessage: 'TODO: Fucking Success message',
		onSuccess: () => {
			handleEditDialogClose();
			refetchWebHostList();
		},
	});

	const handleEditDialogSave = form.handleSubmit((data) => {
		saveWebHost(data);
	});

	return (
		<>
			<Typography variant="h2">Web Hosts</Typography>
			<Box>
				<Button
					disabled={!ENABLE_TABLE_INLINE_EDITING}
					variant="contained"
					onClick={() => {
						// setNum(_.isNumber(num) ? num + 1 : 0);
						// toggleOpenCreationRow();
					}}
				>
					Add (inline)
				</Button>
				<Button
					variant="contained"
					onClick={() => {
						setDialogEditedRow(undefined);
						toggleEditDialog();
					}}
				>
					Add (dialog)
				</Button>
				<Button
					variant="contained"
					onClick={() => {
						navigate(/* BO_PATH_NAMES.createWebHost */ '#');
					}}
				>
					Add (form)
				</Button>
			</Box>

			<WebHostsTable />

			<Dialog open={editDialogOpen} onClose={handleEditDialogClose}>
				<DialogTitle>{dialogRowData ? 'Update web host' : 'Create a web host'}</DialogTitle>
				<DialogContent>
					{dialogRowData && <DialogContentText>modify Web Host with id {dialogRowData?.objectId}</DialogContentText>}
					<Box>
						<TextField
							{...form.register('name')}
							error={!!form.formState.errors.name}
							helperText={form.formState.errors.name?.message}
						/>
					</Box>
					<Box>
						<TextField
							{...form.register('description')}
							error={!!form.formState.errors.description}
							helperText={form.formState.errors.description?.message}
						/>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleEditDialogCancel}>Cancel</Button>
					<Button onClick={handleEditDialogSave} disabled={!form.formState.isDirty}>
						{isSaveWebHostPending ? <CircularProgress size={16} /> : 'save'}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};

export default WebHosts;
