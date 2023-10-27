// import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

import SingleFilePreview from '@devist/ui-react/components/upload/SingleFilePreview';

import useBoolean from '@ui-react/hooks/useBoolean';

// type Props = {};

const MediaLibPicker = () => {
	const dialog = useBoolean();

	return (
		<>
			<Box position="relative">
				<SingleFilePreview />
			</Box>

			<Button variant="contained" color="warning" onClick={dialog.setTrue}>
				Add Image
			</Button>
			<Dialog open={dialog.value} onClose={dialog.setFalse}>
				<DialogTitle>Set Image</DialogTitle>
				<DialogContent>ok</DialogContent>
			</Dialog>
		</>
	);
};

export default MediaLibPicker;
