import { memo, useCallback, useState } from 'react';

import Collapse from '@mui/material/Collapse';
// @mui
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';

import { navVerticalConfig } from '../config';
//
import type { NavConfigProps, NavListProps, NavSectionProps } from '../types';

import NavList from './NavList';
import { StyledSubheader } from './styles';

// ----------------------------------------------------------------------

type GroupProps = {
	subheader: string;
	items: NavListProps[];
	config: NavConfigProps;
};

const Group = ({ subheader, items, config }: GroupProps) => {
	const [open, setOpen] = useState(true);

	const handleToggle = useCallback(() => {
		setOpen((prev) => {
			return !prev;
		});
	}, []);

	const renderContent = items.map((list) => {
		return <NavList key={list.title + list.path} data={list} depth={1} hasChild={!!list.children} config={config} />;
	});

	return (
		<List disablePadding sx={{ px: 2 }}>
			{subheader ? (
				<>
					<StyledSubheader disableGutters disableSticky onClick={handleToggle} config={config}>
						{subheader}
					</StyledSubheader>

					<Collapse in={open}>{renderContent}</Collapse>
				</>
			) : (
				renderContent
			)}
		</List>
	);
};

// ----------------------------------------------------------------------

const NavSectionVertical = ({ data, config, sx, ...other }: NavSectionProps) => {
	return (
		<Stack sx={sx} {...other}>
			{data.map((group, index) => {
				return (
					<Group
						key={group.subheader || index}
						subheader={group.subheader}
						items={group.items}
						config={navVerticalConfig(config)}
					/>
				);
			})}
		</Stack>
	);
};

export default memo(NavSectionVertical);
