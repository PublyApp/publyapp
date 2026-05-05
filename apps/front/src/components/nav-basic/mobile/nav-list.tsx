import { useBoolean } from 'minimal-shared/hooks';
import { isActiveLink, isExternalLink } from 'minimal-shared/utils';
import { useCallback, useEffect, useRef } from 'react';

import { usePathname } from '#app/hooks/use-pathname.ts';

import { NavCollapse, NavLi, NavUl } from '../components';
import { navBasicClasses } from '../styles';
import type { NavListProps, NavSubListProps } from '../types';
import { NavItem } from './nav-item';

// ----------------------------------------------------------------------

export const NavList = ({
	data,
	depth,
	render,
	slotProps,
	enabledRootRedirect,
}: NavListProps) => {
	const pathname = usePathname();
	const navItemRef = useRef<HTMLButtonElement>(null);

	const isActive = isActiveLink(pathname, data.path, !!data.children);
	const { value: open, onFalse: onClose, onToggle } = useBoolean(isActive);
	const isActiveRef = useRef(isActive);
	const onCloseRef = useRef(onClose);

	isActiveRef.current = isActive;
	onCloseRef.current = onClose;

	useEffect(() => {
		if (!isActiveRef.current) {
			onCloseRef.current();
		}
	}, [pathname]);

	const handleToggleMenu = useCallback(() => {
		if (data.children) {
			onToggle();
		}
	}, [data.children, onToggle]);

	const renderNavItem = () => {
		return (
			<NavItem
				ref={navItemRef}
				// slots
				path={data.path}
				icon={data.icon}
				title={data.title}
				info={data.info}
				caption={data.caption}
				// state
				open={open}
				active={isActive}
				disabled={data.disabled}
				// options
				depth={depth}
				render={render}
				hasChild={!!data.children}
				externalLink={isExternalLink(data.path)}
				enabledRootRedirect={enabledRootRedirect}
				// styles
				slotProps={depth === 1 ? slotProps?.rootItem : slotProps?.subItem}
				// actions
				onClick={handleToggleMenu}
			/>
		);
	};

	const renderCollapse = () => {
		return (
			!!data.children && (
				<NavCollapse
					mountOnEnter
					unmountOnExit
					depth={depth}
					in={open}
					data-group={data.title}
				>
					<NavSubList
						data={data.children}
						depth={depth}
						render={render}
						slotProps={slotProps}
						enabledRootRedirect={enabledRootRedirect}
					/>
				</NavCollapse>
			)
		);
	};

	return (
		<NavLi
			disabled={data.disabled}
			sx={{
				...(!!data.children && {
					[`& .${navBasicClasses.li}`]: {
						'&:first-of-type': { mt: 'var(--nav-item-gap)' },
					},
				}),
			}}
		>
			{renderNavItem()}
			{renderCollapse()}
		</NavLi>
	);
};

// ----------------------------------------------------------------------

const NavSubList = ({
	data,
	render,
	depth = 0,
	slotProps,
	enabledRootRedirect,
}: NavSubListProps) => {
	return (
		<NavUl sx={{ gap: 'var(--nav-item-gap)' }}>
			{data.map((list) => {
				return (
					<NavList
						key={list.title}
						data={list}
						depth={depth + 1}
						render={render}
						slotProps={slotProps}
						enabledRootRedirect={enabledRootRedirect}
					/>
				);
			})}
		</NavUl>
	);
};
