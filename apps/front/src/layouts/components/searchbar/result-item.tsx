import Box from '@mui/material/Box';
import ListItemButton, {
	type ListItemButtonProps,
} from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { isExternalLink, varAlpha } from 'minimal-shared/utils';
import { nanoid } from 'nanoid';

import { Label } from '#app/components/label/index.ts';
import { RouterLink } from '#app/components/router-link.tsx';

// ----------------------------------------------------------------------

type Props = Omit<ListItemButtonProps, 'title'> & {
	href: string;
	labels: string[];
	title: { text: string; highlight: boolean }[];
	path: { text: string; highlight: boolean }[];
};

export const ResultItem = ({
	title,
	path,
	labels,
	href,
	sx,
	...other
}: Props) => {
	const linkProps = isExternalLink(href)
		? { target: '_blank', rel: 'noopener noreferrer', href, component: 'a' }
		: { component: RouterLink, href };

	return (
		<ListItemButton
			{...linkProps}
			disableRipple
			sx={[
				(theme) => {
					return {
						borderWidth: 1,
						borderStyle: 'dashed',
						borderColor: 'transparent',
						borderBottomColor: theme.vars.palette.divider,
						'&:hover': {
							borderRadius: 1,
							borderColor: theme.vars.palette.primary.main,
							backgroundColor: varAlpha(
								theme.vars.palette.primary.mainChannel,
								theme.vars.palette.action.hoverOpacity,
							),
						},
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<ListItemText
				primary={title.map((part) => {
					return (
						<Box
							key={nanoid()}
							component="span"
							sx={{ color: part.highlight ? 'primary.main' : 'text.primary' }}
						>
							{part.text}
						</Box>
					);
				})}
				secondary={path.map((part) => {
					return (
						<Box
							key={nanoid()}
							component="span"
							sx={{ color: part.highlight ? 'primary.main' : 'text.secondary' }}
						>
							{part.text}
						</Box>
					);
				})}
				slotProps={{
					secondary: {
						noWrap: true,
						sx: { typography: 'caption' },
					},
				}}
			/>

			<Box sx={{ gap: 0.75, display: 'flex' }}>
				{[...labels].reverse().map((label) => {
					return (
						<Label key={label} color="default">
							{label}
						</Label>
					);
				})}
			</Box>
		</ListItemButton>
	);
};
