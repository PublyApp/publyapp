import { forwardRef } from 'react';

import { Link, ListItemButton, styled } from '@mui/material';
import NextLink from 'next/link';

import Iconify from '@devist/ui-react/components/Iconify';

import type { NavItemProps } from './types';

// ----------------------------------------------------------------------

export const NavItem = forwardRef<HTMLDivElement, NavItemProps>(
	({ item, open, active, subItem, isExternalLink, ...other }, ref) => {
		const { title, path, children } = item;

		const renderContent = (
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			<StyledNavItem ref={ref} disableRipple subItem={subItem} active={active} open={open} {...other}>
				{title}

				{!!children && <Iconify width={16} icon="carbon:chevron-down" sx={{ ml: 1 }} />}
			</StyledNavItem>
		);

		// ExternalLink
		if (isExternalLink) {
			return (
				<Link href={path} target="_blank" rel="noopener" color="inherit" underline="none">
					{renderContent}
				</Link>
			);
		}

		// Has child
		if (children) {
			return renderContent;
		}

		// Default
		return (
			<Link component={NextLink} /*  to={path}  */ href={path} color="inherit" underline="none">
				{renderContent}
			</Link>
		);
	},
);

// ----------------------------------------------------------------------

type StyledNavItemProps = Omit<NavItemProps, 'item'>;

export const StyledNavItem = styled(ListItemButton, {
	shouldForwardProp: (prop) => {
		return prop !== 'active' && prop !== 'open' && prop !== 'subItem';
	},
})<StyledNavItemProps>(({ active, open, subItem, theme }) => {
	const dotActiveStyle = {
		content: '""',
		borderRadius: '50%',
		position: 'absolute',
		width: 6,
		height: 6,
		left: -12,
		backgroundColor: theme.palette.primary.main,
	};

	return {
		...theme.typography.body2,
		padding: 0,
		height: '100%',
		transition: theme.transitions.create('opacity', {
			duration: theme.transitions.duration.shorter,
		}),
		'&:hover': {
			opacity: 0.8,
			backgroundColor: 'transparent',
			'&::before': dotActiveStyle,
		},
		// Sub item
		...(subItem && {
			...theme.typography.body2,
			color: theme.palette.text.secondary,
		}),
		// Active
		...(active && {
			color: theme.palette.text.primary,
			fontWeight: theme.typography.fontWeightSemiBold,
			'&::before': dotActiveStyle,
		}),
		// Active sub item
		...(active &&
			subItem && {
				color: theme.palette.text.primary,
				fontWeight: theme.typography.fontWeightSemiBold,
				'&::before': {
					...dotActiveStyle,
					color: theme.palette.primary.main,
				},
			}),
		// Open
		...(open && {
			opacity: 0.48,
			'&::before': dotActiveStyle,
		}),
	};
});
