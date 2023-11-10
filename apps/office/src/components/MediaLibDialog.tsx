import { Suspense } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';
import { nanoid } from 'nanoid';

import { IMAGE_FORMAT_CONFIG } from '@devist/shared/lib/constants';
import Image from '@devist/ui-react/components/Image';
import SingleFilePreview from '@devist/ui-react/components/upload/SingleFilePreview';
import useBoolean from '@devist/ui-react/hooks/useBoolean';
import { useFindAppFileSuspense } from '@devist/ui-react/lib/react-query/features/appFiles/appFile.hooks';

import { themeOptions } from '@ui-react/lib/mui/theme';
import { pxToRem } from '@ui-react/utils/css.utils';

// type Props = {};

const MediaLibDialog = () => {
	const dialog = useBoolean();

	return (
		<>
			<Box position="relative">
				<SingleFilePreview />
			</Box>

			<Button variant="contained" color="warning" onClick={dialog.setTrue}>
				Add Image
			</Button>
			<Dialog open={dialog.value} onClose={dialog.setFalse} maxWidth="lg" fullWidth>
				<DialogTitle>Media library</DialogTitle>
				<DialogContent>
					<Suspense>
						{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
						<FileList /* files={data.appFiles} */ />
					</Suspense>
				</DialogContent>
			</Dialog>
		</>
	);
};

export default MediaLibDialog;

// type FileListProps = {
// 	// files: AppFile[];
// };

const FileList = (/* {  }: FileListProps */) => {
	const theme = useTheme();

	const {
		result: { data },
	} = useFindAppFileSuspense({});

	const fallbackElement = Array.from({ length: 5 }).map(() => {
		return <Skeleton key={nanoid()} variant="rounded" width={pxToRem(200)} height={pxToRem(200)} />;
	});

	return (
		<Suspense fallback={fallbackElement}>
			<Grid container spacing={3}>
				{data.appFiles.map((file) => {
					console.log(file);
					return (
						<Grid key={nanoid()} item xs={4}>
							<Image
								border={`4px solid ${theme.palette.common.black}`}
								width={IMAGE_FORMAT_CONFIG.thumbnail.width}
								height={IMAGE_FORMAT_CONFIG.thumbnail.height}
								src={`http://localhost:6180${/* file.formats?.thumbnail.url ??  */ file.url}`}
							/>
						</Grid>
					);
				})}
			</Grid>
		</Suspense>
	);
};
