/* eslint-disable @typescript-eslint/no-use-before-define */
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { useTheme, type SxProps, type Theme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';

import Iconify from '@/ui-react/components/Iconify';
import { bgBlur } from '@/ui-react/utils/css.utils';
import { fileData, fileFormat, fileThumb } from '@/ui-react/utils/files.utils';

// ----------------------------------------------------------------------

export interface ExtendFile extends File {
	preview?: string;
	path?: string;
	lastModifiedDate?: string;
}

// ----------------------------------------------------------------------

type FileIconProps = {
	file: File | string;
	tooltip?: boolean;
	imageView?: boolean;
	onDownload?: VoidFunction;
	sx?: SxProps<Theme>;
	imgSx?: SxProps<Theme>;
};

const FileThumbnail = ({ file, tooltip, imageView, onDownload, sx, imgSx }: FileIconProps) => {
	const { name = '', path = '', preview = '' } = fileData(file);

	const format = fileFormat(path || preview);

	const renderContent =
		format === 'image' && imageView ? (
			<Box
				component="img"
				src={preview}
				sx={{
					width: 1,
					height: 1,
					flexShrink: 0,
					objectFit: 'cover',
					...imgSx,
				}}
			/>
		) : (
			<Box
				component="img"
				src={fileThumb(format)}
				sx={{
					width: 32,
					height: 32,
					flexShrink: 0,
					...sx,
				}}
			/>
		);

	if (tooltip) {
		return (
			<Tooltip title={name}>
				<Stack
					flexShrink={0}
					component="span"
					alignItems="center"
					justifyContent="center"
					sx={{
						width: 'fit-content',
						height: 'inherit',
					}}
				>
					{renderContent}
					{onDownload && <DownloadButton onDownload={onDownload} />}
				</Stack>
			</Tooltip>
		);
	}

	return (
		<>
			{renderContent}
			{onDownload && <DownloadButton onDownload={onDownload} />}
		</>
	);
};

export default FileThumbnail;

// ----------------------------------------------------------------------

type DownloadButtonProps = {
	onDownload?: VoidFunction;
};

const DownloadButton = ({ onDownload }: DownloadButtonProps) => {
	const theme = useTheme();

	return (
		<IconButton
			onClick={onDownload}
			sx={{
				p: 0,
				top: 0,
				right: 0,
				width: 1,
				height: 1,
				zIndex: 9,
				opacity: 0,
				position: 'absolute',
				borderRadius: 'unset',
				justifyContent: 'center',
				bgcolor: 'grey.800',
				color: 'common.white',
				transition: theme.transitions.create(['opacity']),

				'&:hover': {
					opacity: 1,
					...bgBlur({
						opacity: 0.64,
						color: theme.palette.grey[900],
					}),
				},
			}}
		>
			<Iconify icon="eva:arrow-circle-down-fill" width={24} />
		</IconButton>
	);
};
