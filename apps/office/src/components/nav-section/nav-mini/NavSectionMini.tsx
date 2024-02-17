import { memo } from 'react';

import Stack from '@mui/material/Stack';

import { navMiniConfig } from '../config';
import type { NavConfigProps, NavListProps, NavSectionProps } from '../types';

import NavList from './NavList';

// ----------------------------------------------------------------------

type GroupProps = {
	items: NavListProps[];
	config: NavConfigProps;
};

const Group = ({ items, config }: GroupProps) => {
	return (
		<>
			{items.map((list) => {
				return (
					<NavList key={list.title + list.path} data={list} depth={1} hasChild={!!list.children} config={config} />
				);
			})}
		</>
	);
};

// ----------------------------------------------------------------------

const NavSectionMini = ({ data, config, sx, ...other }: NavSectionProps) => {
	return (
		<Stack sx={sx} {...other}>
			{data.map((group, index) => {
				return <Group key={group.subheader || index} items={group.items} config={navMiniConfig(config)} />;
			})}
		</Stack>
	);
};

export default memo(NavSectionMini);
