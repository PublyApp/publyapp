import Collapse from '@mui/material/Collapse';
import { useTheme } from '@mui/material/styles';
import { useBoolean } from 'minimal-shared/hooks';
import { mergeClasses } from 'minimal-shared/utils';

import { Nav, NavLi, NavSubheader, NavUl } from '../components';
import { navSectionClasses, navSectionCssVars } from '../styles';
import type { NavGroupProps, NavSectionProps } from '../types';
import { NavList } from './nav-list';

// ----------------------------------------------------------------------

export const NavSectionVertical = ({
	sx,
	data,
	render,
	className,
	slotProps,
	checkPermissions,
	enabledRootRedirect,
	cssVars: overridesVars,
	...other
}: NavSectionProps) => {
	const theme = useTheme();

	const cssVars = { ...navSectionCssVars.vertical(theme), ...overridesVars };

	return (
		<Nav
			className={mergeClasses([navSectionClasses.vertical, className])}
			sx={[{ ...cssVars }, ...(Array.isArray(sx) ? sx : [sx])]}
			{...other}
		>
			<NavUl sx={{ flex: '1 1 auto', gap: 'var(--nav-item-gap)' }}>
				{data.map((group) => {
					return (
						<Group
							key={group.subheader ?? group.items[0].title}
							subheader={group.subheader}
							collapsible={group.collapsible}
							items={group.items}
							render={render}
							slotProps={slotProps}
							checkPermissions={checkPermissions}
							enabledRootRedirect={enabledRootRedirect}
						/>
					);
				})}
			</NavUl>
		</Nav>
	);
};

// ----------------------------------------------------------------------

const Group = ({
	items,
	render,
	subheader,
	collapsible,
	slotProps,
	checkPermissions,
	enabledRootRedirect,
}: NavGroupProps) => {
	const groupOpen = useBoolean(true);
	const isCollapsible = collapsible !== false;

	const renderContent = () => {
		return (
			<NavUl sx={{ gap: 'var(--nav-item-gap)' }}>
				{items.map((list) => {
					return (
						<NavList
							key={list.title}
							data={list}
							render={render}
							depth={1}
							slotProps={slotProps}
							checkPermissions={checkPermissions}
							enabledRootRedirect={enabledRootRedirect}
						/>
					);
				})}
			</NavUl>
		);
	};

	const renderSubheader = () => {
		if (!subheader) {
			return null;
		}

		if (isCollapsible) {
			return (
				<NavSubheader
					data-title={subheader}
					open={groupOpen.value}
					onClick={groupOpen.onToggle}
					sx={slotProps?.subheader}
				>
					{subheader}
				</NavSubheader>
			);
		}

		return (
			<NavSubheader
				data-title={subheader}
				interactive={false}
				sx={slotProps?.subheader}
			>
				{subheader}
			</NavSubheader>
		);
	};

	const renderGroupContent = () => {
		if (subheader && isCollapsible) {
			return <Collapse in={groupOpen.value}>{renderContent()}</Collapse>;
		}
		return renderContent();
	};

	return (
		<NavLi>
			{renderSubheader()}
			{renderGroupContent()}
		</NavLi>
	);
};
