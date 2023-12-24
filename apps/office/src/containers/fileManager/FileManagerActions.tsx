import { useCallback, useState } from 'react';

// import { Box } from '@mui/material';
import Button from '@mui/material/Button';

// import ToggleButton from '@mui/material/ToggleButton';
// import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import Iconify from '@devist/ui-react/components/Iconify';
import useBoolean from '@devist/ui-react/hooks/useBoolean';

import FileManagerNewFolderDialog from '@/office/components/file-manager/FileManagerNewFolderDialog';

// import EmptyContent from '@/office/components/EmptyContent';
// import Iconify from '@/ui-react/components/Iconify';

const FileManagerActions = () => {
	const upload = useBoolean();
	const newFolder = useBoolean();
	const [folderName, setFolderName] = useState('');

	const handleChangeFolderName = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setFolderName(event.target.value);
	}, []);

	return (
		<>
			<Button
				variant="contained"
				startIcon={<Iconify icon="eva:cloud-upload-fill" />}
				onClick={newFolder.setTrue}
				// disabled
			>
				New Folder
			</Button>
			<Button variant="contained" startIcon={<Iconify icon="eva:cloud-upload-fill" />} onClick={upload.setTrue}>
				Upload
			</Button>

			<FileManagerNewFolderDialog open={upload.value} onClose={upload.setFalse} onUpload={() => {}} />

			<FileManagerNewFolderDialog
				open={newFolder.value}
				onClose={newFolder.setFalse}
				title="New Folder"
				onCreate={() => {
					newFolder.setFalse();
					setFolderName('');
					console.info('CREATE NEW FOLDER', folderName);
				}}
				folderName={folderName}
				onChangeFolderName={handleChangeFolderName}
				onUpload={() => {}}
			/>
		</>
	);
};

export default FileManagerActions;
