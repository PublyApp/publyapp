import { Link, ListItemIcon, ListItemText } from '@mui/material';
import { Link as RouterLink } from '@remix-run/react';

import Iconify from '@/ui-react/components/Iconify';

import type { NavItemProps } from '../types';

import { StyledNavItem } from './styles';

// ----------------------------------------------------------------------

const NavItem = ({ item, open, active, isExternalLink, ...other }: NavItemProps) => {
	const { title, path, icon, children } = item;

	const renderContent = (
		<StyledNavItem active={active} {...other}>
			<ListItemIcon> {icon} </ListItemIcon>

			<ListItemText disableTypography primary={title} />

			{!!children && <Iconify width={16} icon={open ? 'carbon:chevron-down' : 'carbon:chevron-right'} sx={{ ml: 1 }} />}
		</StyledNavItem>
	);

	// ExternalLink
	if (isExternalLink) {
		return (
			<Link href={path} target="_blank" rel="noopener" underline="none">
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
		<Link component={RouterLink} to={path} underline="none">
			{renderContent}
		</Link>
	);
};

export default NavItem;
