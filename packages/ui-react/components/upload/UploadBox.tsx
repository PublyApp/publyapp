import { alpha, Box } from '@mui/material';
import { useDropzone } from 'react-dropzone';

import Iconify from '../Iconify';

//
import type { UploadProps } from './types';

// ----------------------------------------------------------------------

const UploadBox = ({ placeholder, error, disabled, sx, ...other }: UploadProps) => {
	const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
		disabled,
		...other,
	});

	const hasError = isDragReject || error;

	return (
		<Box
			{...getRootProps()}
			sx={{
				m: 0.5,
				width: 64,
				height: 64,
				flexShrink: 0,
				display: 'flex',
				borderRadius: 1,
				cursor: 'pointer',
				alignItems: 'center',
				color: 'text.disabled',
				justifyContent: 'center',
				bgcolor: (theme) => {
					return alpha(theme.palette.grey[500], 0.08);
				},
				border: (theme) => {
					return `dashed 1px ${alpha(theme.palette.grey[500], 0.16)}`;
				},
				...(isDragActive && {
					opacity: 0.72,
				}),
				...(disabled && {
					opacity: 0.48,
					pointerEvents: 'none',
				}),
				...(hasError && {
					color: 'error.main',
					borderColor: 'error.main',
					bgcolor: (theme) => {
						return alpha(theme.palette.error.main, 0.08);
					},
				}),
				'&:hover': {
					opacity: 0.72,
				},
				...sx,
			}}
		>
			<input {...getInputProps()} />

			{placeholder || <Iconify icon="eva:cloud-upload-fill" width={28} />}
		</Box>
	);
};

export default UploadBox;
