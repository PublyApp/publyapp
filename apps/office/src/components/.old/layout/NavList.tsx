import { useCallback, useEffect, useState } from 'react';

// @mui
import Collapse from '@mui/material/Collapse';

import { useActiveLink } from '@office/hooks/useActiveLink';
import { usePathname } from '@office/hooks/usePathName';

import NavItem, { type NavConfigProps } from './NavItem';

// import type { NavListProps } from './NavItem';

// routes
// import { usePathname } from 'src/routes/hooks';
// import { useActiveLink } from 'src/routes/hooks/use-active-link';

//
// import type { NavConfigProps, NavListProps } from '../types';

// import NavItem from './nav-item';

// ----------------------------------------------------------------------
export type NavListProps = {
	title: string;
	path: string;
	icon?: React.ReactElement;
	info?: React.ReactElement;
	caption?: string;
	disabled?: boolean;
	roles?: string[];
	children?: any;
};

type NavListRootProps = {
	data: NavListProps;
	depth: number;
	hasChild: boolean;
	config: NavConfigProps;
};

const NavList = ({ data, depth, hasChild, config }: NavListRootProps) => {
	const pathname = usePathname();

	const active = useActiveLink(data.path, hasChild);

	const externalLink = data.path.includes('http');

	const [open, setOpen] = useState(active);

	const handleClose = useCallback(() => {
		setOpen(false);
	}, []);

	useEffect(() => {
		if (!active) {
			handleClose();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pathname]);

	const handleToggle = useCallback(() => {
		setOpen((prev) => {
			return !prev;
		});
	}, []);

	return (
		<>
			<NavItem
				item={data}
				depth={depth}
				open={open}
				active={active}
				externalLink={externalLink}
				onClick={handleToggle}
				config={config}
			/>

			{hasChild && (
				<Collapse in={open} unmountOnExit>
					{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
					<NavSubList data={data.children} depth={depth} config={config} />
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
	config: NavConfigProps;
};

const NavSubList = ({ data, depth, config }: NavListSubProps) => {
	return (
		<>
			{data.map((list) => {
				return (
					<NavList
						key={list.title + list.path}
						data={list}
						depth={depth + 1}
						hasChild={!!list.children}
						config={config}
					/>
				);
			})}
		</>
	);
};
