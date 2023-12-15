import { useState } from 'react';

import { Collapse } from '@mui/material';
import { useLocation } from '@remix-run/react';

import NavSectionVertical from '@/front/components/nav-section/vertical/NavSectionVertical';
import useActiveLink from '@/front/hooks/useActiveLink';

import type { NavItemBaseProps } from '../types';

import NavItem from './NavItem';

// ----------------------------------------------------------------------

type NavListProps = {
	item: NavItemBaseProps;
};

const NavList = ({ item }: NavListProps) => {
	const { pathname } = useLocation();

	const { path, children } = item;

	const { isExternalLink } = useActiveLink(path);

	const [open, setOpen] = useState(false);

	return (
		<>
			<NavItem
				item={item}
				open={open}
				onClick={() => {
					return setOpen(!open);
				}}
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
};

export default NavList;
