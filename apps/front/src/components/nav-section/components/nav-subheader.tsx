import ListSubheader, {
	type ListSubheaderProps,
} from '@mui/material/ListSubheader';
import { styled } from '@mui/material/styles';
import { mergeClasses } from 'minimal-shared/utils';

import { Iconify } from '@/front/components/iconify/iconify';

import { iconifyClasses } from '../../iconify/classes';
import { navSectionClasses } from '../styles';

// ----------------------------------------------------------------------

export type NavSubheaderProps = ListSubheaderProps & {
	open?: boolean;
	interactive?: boolean;
};

const NavSubheaderBase = ({
	open,
	interactive,
	children,
	className,
	...other
}: NavSubheaderProps) => {
	return (
		<ListSubheader
			disableSticky
			component="div"
			{...other}
			className={mergeClasses([navSectionClasses.subheader, className])}
		>
			{interactive !== false && (
				<Iconify
					width={16}
					icon={
						open ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'
					}
				/>
			)}
			{children}
		</ListSubheader>
	);
};

export const NavSubheader = styled(NavSubheaderBase, {
	shouldForwardProp: (prop) => prop !== 'open',
})<NavSubheaderProps>(({ theme, interactive }) => ({
	...theme.typography.overline,
	alignItems: 'center',
	position: 'relative',
	gap: theme.spacing(1),
	display: 'inline-flex',
	alignSelf: 'flex-start',
	color: 'var(--nav-subheader-color)',
	padding: theme.spacing(2, 1, 1, 1.5),
	fontSize: theme.typography.pxToRem(11),
	...(interactive !== false && {
		cursor: 'pointer',
		transition: theme.transitions.create(['color', 'padding-left'], {
			duration: theme.transitions.duration.standard,
		}),
		[`& .${iconifyClasses.root}`]: {
			left: -4,
			opacity: 0,
			position: 'absolute',
			transition: theme.transitions.create(['opacity'], {
				duration: theme.transitions.duration.standard,
			}),
		},
		'&:hover': {
			paddingLeft: theme.spacing(2),
			color: 'var(--nav-subheader-hover-color)',
			[`& .${iconifyClasses.root}`]: { opacity: 1 },
		},
	}),
}));
