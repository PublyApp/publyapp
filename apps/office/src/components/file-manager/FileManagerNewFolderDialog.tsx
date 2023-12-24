import { useCallback, useEffect, useState } from 'react';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { type DialogProps } from '@mui/material/Dialog';

import Iconify from '@devist/ui-react/components/Iconify';
import Upload from '@devist/ui-react/components/upload/Upload';

// ----------------------------------------------------------------------

interface Props extends DialogProps {
	title?: string;
	//
	onCreate?: VoidFunction;
	onUpdate?: VoidFunction;
	//
	folderName?: string;
	onChangeFolderName?: (event: React.ChangeEvent<HTMLInputElement>) => void;
	//
	open: boolean;
	onClose: VoidFunction;
	//
	onUpload: VoidFunction;
}

const FileManagerNewFolderDialog = ({
	title = 'Upload Files',
	open,
	onClose,
	//
	onCreate,
	onUpdate,
	//
	folderName,
	onChangeFolderName,
	//
	onUpload,
	//
	...other
}: Props) => {
	const [files, setFiles] = useState<(File | string)[]>([]);

	useEffect(() => {
		if (!open) {
			setFiles([]);
		}
	}, [open]);

	const handleDrop = useCallback(
		(acceptedFiles: File[]) => {
			const newFiles = acceptedFiles.map((file) => {
				return Object.assign(file, {
					preview: URL.createObjectURL(file),
				});
			});

			setFiles([...files, ...newFiles]);
		},
		[files],
	);

	const handleUpload = () => {
		onUpload();
		onClose();
		console.info('ON UPLOAD');
	};

	const handleRemoveFile = (inputFile: File | string) => {
		const filtered = files.filter((file) => {
			return file !== inputFile;
		});
		setFiles(filtered);
	};

	const handleRemoveAllFiles = () => {
		setFiles([]);
	};

	return (
		<Dialog fullWidth maxWidth="sm" open={open} onClose={onClose} {...other}>
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
				{(onCreate || onUpdate) && (
					<TextField fullWidth label="Folder name" value={folderName} onChange={onChangeFolderName} sx={{ mb: 3 }} />
				)}

				{/* only accept images for now */}
				<Upload accept={{ 'image/*': [] }} multiple files={files} onDrop={handleDrop} onRemove={handleRemoveFile} />
			</DialogContent>

			<DialogActions>
				<Button variant="contained" startIcon={<Iconify icon="eva:cloud-upload-fill" />} onClick={handleUpload}>
					Upload
				</Button>

				{!!files.length && (
					<Button variant="outlined" color="inherit" onClick={handleRemoveAllFiles}>
						Remove all
					</Button>
				)}

				{(onCreate || onUpdate) && (
					<Stack direction="row" justifyContent="flex-end" flexGrow={1}>
						<Button variant="soft" onClick={onCreate || onUpdate}>
							{onUpdate ? 'Save' : 'Create'}
						</Button>
					</Stack>
				)}
			</DialogActions>
		</Dialog>
	);
};

export default FileManagerNewFolderDialog;
