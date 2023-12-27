import { useCallback } from 'react';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { type DialogProps } from '@mui/material/Dialog';
import _ from 'lodash';
import type { Accept } from 'react-dropzone';
import { FormProvider, type UseFormReturn } from 'react-hook-form';

import { RHFUpload } from '@devist/ui-react/components/form/RHFUpload';
import Iconify from '@devist/ui-react/components/Iconify';

// import Upload from '@devist/ui-react/components/upload/Upload';

// ----------------------------------------------------------------------

// type DialogAction = ({ files }: { files: File[] }) => void;

// interface Props extends DialogProps {
// 	title?: string;
// 	//
// 	onCreate?: VoidFunction;
// 	onUpdate?: VoidFunction;
// 	//
// 	folderName?: string;
// 	onChangeFolderName?: (event: React.ChangeEvent<HTMLInputElement>) => void;
// 	//
// 	open: boolean;
// 	onClose: VoidFunction;
// 	//
// 	onUpload?: VoidFunction;
// 	onDropFiles?: DialogAction;
// 	accept?: Accept;
// }
type Props = (
	| {
			action: 'uploadFiles';
			form: UseFormReturn<{
				files: File[];
				parentFolderPath?: string | undefined;
			}>;
			onUpload: ({ files, parentFolderPath }: { files: File[]; parentFolderPath?: string }) => void;
	  }
	| {
			action: 'createFolder';
			form: UseFormReturn<{
				folderName: string;
				parentFolderPath?: string | undefined;
				files?: File[] | undefined;
			}>;
			onCreate: ({
				folderName,
				files,
				parentFolderPath,
			}: {
				folderName: string;
				files?: File[];
				parentFolderPath?: string;
			}) => void;
	  }
) & {
	title?: string;
	open: boolean;
	onClose: VoidFunction;
	accept?: Accept;
} & DialogProps;

const FileManagerActionDialog = ({
	title = 'Upload Files',
	open,
	onClose,
	accept,
	// //
	// onCreate,
	// onUpdate,
	// //
	// folderName,
	// onChangeFolderName,
	// //
	// onUpload,
	// onDropFiles,
	// accept,
	//
	...other
}: Props) => {
	// // const [files, setFiles] = useState<File /*  | string */[]>([]);

	// // useEffect(() => {
	// // 	if (!open) {
	// // 		setFiles([]);
	// // 	}
	// // }, [open]);
	// const form = useFormContext<{
	// 	files?: File[];
	// 	folderName?: string;
	// }>();

	const handleDrop = useCallback(
		(acceptedFiles: File[]) => {
			const newFiles = acceptedFiles.map((file) => {
				return Object.assign(file, {
					preview: URL.createObjectURL(file),
				});
			});

			if (other.action === 'uploadFiles') {
				const iFiles = [...(other.form.getValues('files') ?? []), ...newFiles];

				other.form.setValue('files', iFiles);
			}

			if (other.action === 'createFolder') {
				const iFiles = [...(other.form.getValues('files') ?? []), ...newFiles];

				other.form.setValue('files', iFiles);
			}
		},
		[other.action, other.form],
	);

	const handleUpload = (() => {
		if (other.action === 'uploadFiles') {
			return other.form.handleSubmit(async (values) => {
				other.onUpload(values);
			});
		}

		return undefined;
	})();

	const handleCreate = (() => {
		if (other.action === 'createFolder') {
			return other.form.handleSubmit(async (values) => {
				other.onCreate(values);
			});
		}

		return undefined;
	})();

	const handleRemoveFile = (inputFile: File | string) => {
		if (other.action === 'uploadFiles') {
			const files = other.form.getValues('files');

			const filtered = files.filter((file) => {
				return file !== inputFile;
			});

			other.form.setValue('files', filtered);
		}

		if (other.action === 'createFolder') {
			const files = other.form.getValues('files');

			const filtered = files?.filter((file) => {
				return file !== inputFile;
			});

			other.form.setValue('files', filtered);
		}
		// setFiles(filtered);
	};

	const handleRemoveAllFiles = () => {
		if (other.action === 'uploadFiles') {
			other.form.setValue('files', []);
		}

		if (other.action === 'createFolder') {
			other.form.setValue('files', undefined);
		}
	};

	const renderFolderNameInput =
		other.action === 'createFolder' ? (
			<TextField
				fullWidth
				sx={{ mb: 3 }}
				{...other.form.register('folderName')}
				label="Folder name"
				// value={folderName}
				// onChange={onChangeFolderName}
			/>
		) : null;

	const renderUploadZone = (
		<>
			{other.action === 'createFolder' && (
				<FormProvider {...other.form}>
					<RHFUpload
						accept={accept}
						multiple
						onDrop={handleDrop}
						onRemove={handleRemoveFile}
						{..._.omit(other.form.register('files'), ['ref'])}
						// name={other.form.register('files').name}
					/>
				</FormProvider>
			)}
			{other.action === 'uploadFiles' && (
				<FormProvider {...other.form}>
					<RHFUpload
						accept={accept}
						multiple
						onDrop={handleDrop}
						onRemove={handleRemoveFile}
						{..._.omit(other.form.register('files'), ['ref'])}
						// name={other.form.register('files').name}
					/>
				</FormProvider>
			)}
		</>
	);

	return (
		<Dialog fullWidth maxWidth="sm" open={open} onClose={onClose} {..._.omit(other, ['onCreate', 'onUpload'])}>
			<DialogTitle
				sx={{
					p: (theme) => {
						return theme.spacing(3, 3, 2, 3);
					},
				}}
			>
				{' '}
				{title}{' '}
			</DialogTitle>

			<DialogContent dividers sx={{ pt: 1, pb: 0, border: 'none' }}>
				{renderFolderNameInput}

				{renderUploadZone}
			</DialogContent>

			<DialogActions>
				{other.action === 'uploadFiles' ? (
					<Button variant="contained" startIcon={<Iconify icon="eva:cloud-upload-fill" />} onClick={handleUpload}>
						Upload
					</Button>
				) : null}

				{!!other.form.getValues().files?.length && (
					<Button variant="outlined" color="inherit" onClick={handleRemoveAllFiles}>
						Remove all
					</Button>
				)}

				{other.action === 'createFolder' ? (
					<Stack direction="row" justifyContent="flex-end" flexGrow={1}>
						<Button
							variant="soft"
							// onClick={onCreate || onUpdate}
							onClick={handleCreate}
						>
							{/* {onUpdate ? 'Save' : 'Create'} */}
							Save
						</Button>
					</Stack>
				) : null}
			</DialogActions>
		</Dialog>
	);
};

export default FileManagerActionDialog;

// ---- 1 --------------------------------------------------------------------------------
