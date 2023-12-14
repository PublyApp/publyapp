import { useState } from 'react';

// @mui
import { Collapse } from '@mui/material';
import { useLocation } from 'react-router-dom';
// components
import { NavSectionVertical } from 'src/components/nav-section';
// hooks
import useActiveLink from 'src/hooks/useActiveLink';

//
import { NavItemBaseProps } from '../types';

import NavItem from './NavItem';

// ----------------------------------------------------------------------

type NavListProps = {
	item: NavItemBaseProps;
};

export default function NavList({ item }: NavListProps) {
	const { pathname } = useLocation();

	const { path, children } = item;

	const { isExternalLink } = useActiveLink(path);

	const [open, setOpen] = useState(false);

	return (
		<>
			<NavItem
				item={item}
				open={open}
				onClick={() => setOpen(!open)}
				active={pathname === path}
				isExternalLink={isExternalLink}
			/>

			{!!children && (
				<Collapse in={open} unmountOnExit>
					<NavSectionVertical data={children} />
				</Collapse>
			)}
		</>
	);
}
