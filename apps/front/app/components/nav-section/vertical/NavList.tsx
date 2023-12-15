/* eslint-disable @typescript-eslint/no-use-before-define */
import { useEffect, useState } from 'react';

import { Collapse } from '@mui/material';
import { useLocation } from '@remix-run/react';

import useActiveLink from '@/front/hooks/useActiveLink';

import type { NavListProps } from '../types';

import NavItem from './NavItem';

// ----------------------------------------------------------------------

type NavListRootProps = {
	data: NavListProps;
	depth: number;
	hasChild: boolean;
};

const NavList = ({ data, depth, hasChild }: NavListRootProps) => {
	const { pathname } = useLocation();

	const { active, isExternalLink } = useActiveLink(data.path);

	const [open, setOpen] = useState(active);

	useEffect(() => {
		if (!active) {
			handleClose();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pathname]);

	const handleToggle = () => {
		setOpen(!open);
	};

	const handleClose = () => {
		setOpen(false);
	};

	return (
		<>
			<NavItem
				item={data}
				depth={depth}
				open={open}
				active={active}
				isExternalLink={isExternalLink}
				onClick={handleToggle}
			/>

			{hasChild && (
				<Collapse in={open} unmountOnExit>
					<NavSubList data={data.children} depth={depth} />
				</Collapse>
			)}
		</>
	);
};

export default NavList;

// ----------------------------------------------------------------------

type NavListSubProps = {
	data: NavListProps[];
	depth: number;
};

const NavSubList = ({ data, depth }: NavListSubProps) => {
	return (
		<>
			{data.map((list) => {
				return <NavList key={list.title + list.path} data={list} depth={depth + 1} hasChild={!!list.children} />;
			})}
		</>
	);
};
