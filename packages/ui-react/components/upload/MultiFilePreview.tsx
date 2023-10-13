import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
// @mui
import { alpha } from '@mui/material/styles';
import { AnimatePresence, m } from 'framer-motion';

import { fileData } from '@ui-react/utils/files.utils';
import { fData } from '@ui-react/utils/number.utils';

// utils
// import { fData } from 'src/utils/format-number';

import { varFade } from '../animate/variants/fade';
import FileThumbnail /* , { fileData }  */ from '../file-thumbnail/FileThumbnail';
//
import Iconify from '../Iconify';

//
import type { UploadProps } from './types';

// ----------------------------------------------------------------------

const MultiFilePreview = ({ thumbnail, files, onRemove, sx }: UploadProps) => {
	return (
		<AnimatePresence initial={false}>
			{files?.map((file) => {
				const { key, name = '', size = 0 } = fileData(file);

				const isNotFormatFile = typeof file === 'string';

				if (thumbnail) {
					return (
						<Stack
							key={key}
							component={m.div}
							{...varFade().inUp}
							alignItems="center"
							display="inline-flex"
							justifyContent="center"
							sx={{
								m: 0.5,
								width: 80,
								height: 80,
								borderRadius: 1.25,
								overflow: 'hidden',
								position: 'relative',
								border: (theme) => {
									return `solid 1px ${alpha(theme.palette.grey[500], 0.16)}`;
								},
								...sx,
							}}
						>
							<FileThumbnail
								tooltip
								imageView
								file={file}
								sx={{ position: 'absolute' }}
								imgSx={{ position: 'absolute' }}
							/>

							{onRemove && (
								<IconButton
									size="small"
									onClick={() => {
										return onRemove(file);
									}}
									sx={{
										p: 0.5,
										top: 4,
										right: 4,
										position: 'absolute',
										color: 'common.white',
										bgcolor: (theme) => {
											return alpha(theme.palette.grey[900], 0.48);
										},
										'&:hover': {
											bgcolor: (theme) => {
												return alpha(theme.palette.grey[900], 0.72);
											},
										},
									}}
								>
									<Iconify icon="mingcute:close-line" width={14} />
								</IconButton>
							)}
						</Stack>
					);
				}

				return (
					<Stack
						key={key}
						component={m.div}
						{...varFade().inUp}
						spacing={2}
						direction="row"
						alignItems="center"
						sx={{
							my: 1,
							py: 1,
							px: 1.5,
							borderRadius: 1,
							border: (theme) => {
								return `solid 1px ${alpha(theme.palette.grey[500], 0.16)}`;
							},
							...sx,
						}}
					>
						<FileThumbnail file={file} />

						<ListItemText
							primary={isNotFormatFile ? file : name}
							secondary={isNotFormatFile ? '' : fData(size)}
							secondaryTypographyProps={{
								component: 'span',
								typography: 'caption',
							}}
						/>

						{onRemove && (
							<IconButton
								size="small"
								onClick={() => {
									return onRemove(file);
								}}
							>
								<Iconify icon="mingcute:close-line" width={16} />
							</IconButton>
						)}
					</Stack>
				);
			})}
		</AnimatePresence>
	);
};

export default MultiFilePreview;
