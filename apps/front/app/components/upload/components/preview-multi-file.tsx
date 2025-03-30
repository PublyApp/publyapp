/* eslint-disable @typescript-eslint/no-use-before-define */
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import { styled } from '@mui/material/styles';
import { mergeClasses, varAlpha } from 'minimal-shared/utils';

import { fData } from '@/front/utils/format-number';

import { fileData, FileThumbnail } from '../../file-thumbnail';
import { Iconify } from '../../iconify/iconify';
import { uploadClasses } from '../classes';
import type { MultiFilePreviewProps } from '../types';

// ----------------------------------------------------------------------

export const MultiFilePreview = ({
	sx,
	onRemove,
	lastNode,
	thumbnail,
	slotProps,
	firstNode,
	files = [],
	className,
	...other
}: MultiFilePreviewProps) => {
	return (
		<ListRoot
			thumbnail={thumbnail}
			className={mergeClasses([uploadClasses.uploadMultiPreview, className])}
			sx={sx}
			{...other}
		>
			{firstNode && <ItemNode thumbnail={thumbnail}>{firstNode}</ItemNode>}

			{files.map((file) => {
				const { name, size } = fileData(file);

				if (thumbnail) {
					return (
						<ItemThumbnail key={name}>
							<FileThumbnail
								tooltip
								imageView
								file={file}
								onRemove={() => {
									return onRemove?.(file);
								}}
								sx={[
									(theme) => {
										return {
											width: 80,
											height: 80,
											border: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
										};
									},
								]}
								slotProps={{ icon: { sx: { width: 36, height: 36 } } }}
								{...slotProps?.thumbnail}
							/>
						</ItemThumbnail>
					);
				}

				return (
					<ItemRow key={name}>
						<FileThumbnail file={file} {...slotProps?.thumbnail} />

						<ListItemText
							primary={name}
							secondary={fData(size)}
							slotProps={{
								secondary: { sx: { typography: 'caption' } },
							}}
						/>

						{onRemove && (
							<IconButton
								size="small"
								onClick={() => {
									return onRemove(file);
								}}
							>
								<Iconify width={16} icon="mingcute:close-line" />
							</IconButton>
						)}
					</ItemRow>
				);
			})}

			{lastNode && <ItemNode thumbnail={thumbnail}>{lastNode}</ItemNode>}
		</ListRoot>
	);
};

// ----------------------------------------------------------------------

const ListRoot = styled('ul', {
	shouldForwardProp: (prop: string) => {
		return !['thumbnail', 'sx'].includes(prop);
	},
})<Pick<MultiFilePreviewProps, 'thumbnail'>>(({ thumbnail, theme }) => {
	return {
		display: 'flex',
		gap: theme.spacing(1),
		flexDirection: 'column',
		...(thumbnail && { flexWrap: 'wrap', flexDirection: 'row' }),
	};
});

const ItemThumbnail = styled('li')(() => {
	return { display: 'inline-flex' };
});

const ItemRow = styled('li')(({ theme }) => {
	return {
		display: 'flex',
		alignItems: 'center',
		gap: theme.spacing(1.5),
		padding: theme.spacing(1, 1, 1, 1.5),
		borderRadius: theme.shape.borderRadius,
		border: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
	};
});

const ItemNode = styled('li', {
	shouldForwardProp: (prop: string) => {
		return !['thumbnail', 'sx'].includes(prop);
	},
})<Pick<MultiFilePreviewProps, 'thumbnail'>>(({ thumbnail }) => {
	return {
		...(thumbnail && { width: 'auto', display: 'inline-flex' }),
	};
});
