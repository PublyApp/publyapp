import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
// @mui
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { FileRejection } from 'react-dropzone';

import { fileData } from '@ui-react/utils/fileUtils';
import { fData } from '@ui-react/utils/formatNumber';

// utils
// import { fData } from 'src/utils/format-number';

//
// import { fileData } from '../file-thumbnail';

// ----------------------------------------------------------------------

type Props = {
	fileRejections: FileRejection[];
};

const RejectionFiles = ({ fileRejections }: Props) => {
	if (!fileRejections.length) {
		return null;
	}

	return (
		<Paper
			variant="outlined"
			sx={{
				py: 1,
				px: 2,
				mt: 3,
				textAlign: 'left',
				borderStyle: 'dashed',
				borderColor: 'error.main',
				bgcolor: (theme) => {
					return alpha(theme.palette.error.main, 0.08);
				},
			}}
		>
			{fileRejections.map(({ file, errors }) => {
				const { path, size } = fileData(file);

				return (
					<Box key={path} sx={{ my: 1 }}>
						<Typography variant="subtitle2" noWrap>
							{path} - {size ? fData(size) : ''}
						</Typography>

						{errors.map((error) => {
							return (
								<Box key={error.code} component="span" sx={{ typography: 'caption' }}>
									- {error.message}
								</Box>
							);
						})}
					</Box>
				);
			})}
		</Paper>
	);
};

export default RejectionFiles;
