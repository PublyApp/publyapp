import { alpha, Box, ListItemButton, ListItemText } from '@mui/material';
import { nanoid } from 'nanoid';

import Label from '@/ui-react/components/Label';

type ResultItemProps = {
	title: {
		text: string;
		highlight?: boolean;
	}[];
	subTitle?: {
		text: string;
		highlight?: boolean;
	}[];
	groupLabel: string;
	onClickItem: VoidFunction;
};

export const ResultItem = ({ title, subTitle, groupLabel, onClickItem }: ResultItemProps) => {
	return (
		<ListItemButton
			onClick={onClickItem}
			sx={{
				borderWidth: 1,
				borderStyle: 'dashed',
				borderColor: 'transparent',
				borderBottomColor: (theme) => {
					return theme.palette.divider;
				},
				'&:hover': {
					borderRadius: 1,
					borderColor: (theme) => {
						return theme.palette.primary.main;
					},
					backgroundColor: (theme) => {
						return alpha(theme.palette.primary.main, theme.palette.action.hoverOpacity);
					},
				},
			}}
		>
			<ListItemText
				primaryTypographyProps={{
					typography: 'subtitle2',
					sx: { textTransform: 'capitalize' },
				}}
				secondaryTypographyProps={{ typography: 'caption' }}
				primary={title.map((part) => {
					return (
						<Box
							key={nanoid()}
							component="span"
							sx={{
								color: part.highlight ? 'primary.main' : 'text.primary',
							}}
						>
							{part.text}
						</Box>
					);
				})}
				secondary={
					subTitle?.map((part) => {
						return (
							<Box
								key={nanoid()}
								component="span"
								sx={{
									color: part.highlight ? 'primary.main' : 'text.secondary',
								}}
							>
								{part.text}
							</Box>
						);
					}) || ''
				}
			/>

			{groupLabel && <Label color="info">{groupLabel}</Label>}
		</ListItemButton>
	);
};
