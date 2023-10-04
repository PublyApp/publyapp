// @mui
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import ListItemButton, { type ListItemButtonProps } from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
// import ListSubheader from '@mui/material/ListSubheader';
import type { StackProps } from '@mui/material/Stack';
import { alpha, styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
// routes
// import { RouterLink } from 'src/routes/components';
import { Link as RouterLink } from 'react-router-dom';

import Iconify from '@ui-react/components/Iconify';

import type { NavListProps } from './NavList';

//
// import Iconify from '../../iconify';
//
// import type { NavConfigProps, NavItemProps } from '../types';

// import { StyledDotIcon, StyledIcon, StyledItem } from './styles';

export type NavConfigProps = {
	hiddenLabel?: boolean;
	itemGap?: number;
	iconSize?: number;
	itemRadius?: number;
	itemPadding?: string;
	currentRole?: string;
	itemSubHeight?: number;
	itemRootHeight?: number;
};

export type NavItemProps = ListItemButtonProps & {
	item: NavListProps;
	depth: number;
	open?: boolean;
	active: boolean;
	externalLink?: boolean;
};

export type NavSectionProps = StackProps & {
	data: {
		subheader: string;
		items: NavListProps[];
	}[];
	config?: NavConfigProps;
};

// ----------------------------------------------------------------------

type Props = NavItemProps & {
	config: NavConfigProps;
};

const NavItem = ({ item, open, depth, active, config, externalLink, ...other }: Props) => {
	const { title, path, icon, info, children, disabled, caption, roles } = item;

	const subItem = depth !== 1;

	const renderContent = (
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		<StyledItem disableGutters disabled={disabled} active={active} depth={depth} config={config} {...other}>
			<>
				{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
				{icon && <StyledIcon size={config.iconSize}>{icon}</StyledIcon>}

				{subItem && (
					// eslint-disable-next-line @typescript-eslint/no-use-before-define
					<StyledIcon size={config.iconSize}>
						{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
						<StyledDotIcon active={active} />
					</StyledIcon>
				)}
			</>

			{!(config.hiddenLabel && !subItem) && (
				<ListItemText
					primary={title}
					secondary={
						caption ? (
							<Tooltip title={caption} placement="top-start">
								<span>{caption}</span>
							</Tooltip>
						) : null
					}
					primaryTypographyProps={{
						noWrap: true,
						typography: 'body2',
						textTransform: 'capitalize',
						fontWeight: active ? 'fontWeightSemiBold' : 'fontWeightMedium',
					}}
					secondaryTypographyProps={{
						noWrap: true,
						component: 'span',
						typography: 'caption',
						color: 'text.disabled',
					}}
				/>
			)}

			{info && (
				<Box component="span" sx={{ ml: 1, lineHeight: 0 }}>
					{info}
				</Box>
			)}

			{!!children && (
				<Iconify
					width={16}
					icon={open ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'}
					sx={{ ml: 1, flexShrink: 0 }}
				/>
			)}
		</StyledItem>
	);

	// Hidden item by role
	if (roles && !roles.includes(`${config.currentRole}`)) {
		return null;
	}

	// External link
	if (externalLink)
		return (
			<Link
				href={path}
				target="_blank"
				rel="noopener"
				underline="none"
				color="inherit"
				sx={{
					...(disabled && {
						cursor: 'default',
					}),
				}}
			>
				{renderContent}
			</Link>
		);

	// Has child
	if (children) {
		return renderContent;
	}

	// Default
	return (
		<Link
			component={RouterLink}
			to={path}
			underline="none"
			color="inherit"
			sx={{
				...(disabled && {
					cursor: 'default',
				}),
			}}
		>
			{renderContent}
		</Link>
	);
};

export default NavItem;

// ----------------------------------------------------------------------

type StyledItemProps = Omit<NavItemProps, 'item'> & {
	config: NavConfigProps;
};

export const StyledItem = styled(ListItemButton, {
	shouldForwardProp: (prop) => {
		return prop !== 'active';
	},
})<StyledItemProps>(({ active, depth, config, theme }) => {
	const subItem = depth !== 1;

	const deepSubItem = depth > 2;

	const activeStyles = {
		root: {
			color: theme.palette.mode === 'light' ? theme.palette.primary.main : theme.palette.primary.light,
			backgroundColor: alpha(theme.palette.primary.main, 0.08),
			'&:hover': {
				backgroundColor: alpha(theme.palette.primary.main, 0.16),
			},
		},
		sub: {
			color: theme.palette.text.primary,
			backgroundColor: 'transparent',
			'&:hover': {
				backgroundColor: theme.palette.action.hover,
			},
		},
	};

	return {
		// Root item
		padding: config.itemPadding,
		marginBottom: config.itemGap,
		borderRadius: config.itemRadius,
		minHeight: config.itemRootHeight,
		color: theme.palette.text.secondary,

		// Active root item
		...(active && {
			...activeStyles.root,
		}),

		// Sub item
		...(subItem && {
			minHeight: config.itemSubHeight,
			// Active sub item
			...(active && {
				...activeStyles.sub,
			}),
		}),

		// Deep sub item
		...(deepSubItem && {
			paddingLeft: theme.spacing(depth),
		}),
	};
});

// ----------------------------------------------------------------------

type StyledIconProps = {
	size?: number;
};

export const StyledIcon = styled(ListItemIcon)<StyledIconProps>(({ size }) => {
	return {
		width: size,
		height: size,
		alignItems: 'center',
		justifyContent: 'center',
	};
});

type StyledDotIconProps = {
	active?: boolean;
};

export const StyledDotIcon = styled('span')<StyledDotIconProps>(({ active, theme }) => {
	return {
		width: 4,
		height: 4,
		borderRadius: '50%',
		backgroundColor: theme.palette.text.disabled,
		transition: theme.transitions.create(['transform'], {
			duration: theme.transitions.duration.shorter,
		}),
		...(active && {
			transform: 'scale(2)',
			backgroundColor: theme.palette.primary.main,
		}),
	};
});
