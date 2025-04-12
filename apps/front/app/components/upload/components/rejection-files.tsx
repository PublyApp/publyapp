/* eslint-disable @typescript-eslint/no-use-before-define */
import { styled } from '@mui/material/styles';
import { mergeClasses, varAlpha } from 'minimal-shared/utils';
import type { FileRejection } from 'react-dropzone';

import { fData } from '@/front/utils/format-number';

import { fileData } from '../../file-thumbnail';
import { uploadClasses } from '../classes';

// ----------------------------------------------------------------------

type RejectionFilesProps = React.ComponentProps<typeof ListRoot> & {
	files?: readonly FileRejection[];
};

export const RejectionFiles = ({
	files,
	sx,
	className,
	...other
}: RejectionFilesProps) => {
	return (
		<ListRoot
			className={mergeClasses([uploadClasses.uploadRejectionFiles, className])}
			sx={sx}
			{...other}
		>
			{files?.map(({ file, errors }) => {
				const { path, size } = fileData(file);

				return (
					<ListItem key={path}>
						<ItemTitle>
							{path} - {size ? fData(size) : ''}
						</ItemTitle>

						{errors.map((error) => {
							return (
								<ItemCaption key={error.code}>- {error.message}</ItemCaption>
							);
						})}
					</ListItem>
				);
			})}
		</ListRoot>
	);
};

// ----------------------------------------------------------------------

const ListRoot = styled('ul')(({ theme }) => {
	return {
		display: 'flex',
		gap: theme.spacing(1),
		flexDirection: 'column',
		padding: theme.spacing(2),
		marginTop: theme.spacing(3),
		borderRadius: theme.shape.borderRadius,
		border: `dashed 1px ${theme.vars.palette.error.main}`,
		backgroundColor: varAlpha(theme.vars.palette.error.mainChannel, 0.08),
	};
});

const ListItem = styled('li')(() => {
	return { display: 'flex', flexDirection: 'column' };
});

const ItemTitle = styled('span')(({ theme }) => {
	return { ...theme.typography.subtitle2 };
});

const ItemCaption = styled('span')(({ theme }) => {
	return { ...theme.typography.caption };
});
