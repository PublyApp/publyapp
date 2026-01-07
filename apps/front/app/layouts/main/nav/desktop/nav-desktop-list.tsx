import { useBoolean } from 'minimal-shared/hooks';
import {
	isActiveLink,
	isEqualPath,
	isExternalLink,
} from 'minimal-shared/utils';
import { useCallback, useEffect, useRef } from 'react';

import { usePathname } from '@/front/hooks/use-pathname';

import { Nav, NavDropdown, NavLi, NavUl } from '../components';
import type { NavListProps, NavSubListProps } from '../types';

import { NavItem } from './nav-desktop-item';
import { NavItemDashboard } from './nav-desktop-item-dashboard';

// ----------------------------------------------------------------------

export const NavList = ({ data, sx, ...other }: NavListProps) => {
	const pathname = usePathname();
	const navItemRef = useRef<HTMLButtonElement>(null);

	const isActive = isActiveLink(pathname, data.path, !!data.children);
	const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();

	// biome-ignore lint/correctness/useExhaustiveDependencies: code from template leave as is for now
	useEffect(() => {
		if (open) {
			onClose();
		}
	}, [pathname]);

	const handleOpenMenu = useCallback(() => {
		if (data.children) {
			onOpen();
		}
	}, [data.children, onOpen]);

	const renderNavItem = () => {
		return (
			<NavItem
				ref={navItemRef}
				// slots
				path={data.path}
				title={data.title}
				// state
				open={open}
				active={isActive}
				// options
				hasChild={!!data.children}
				externalLink={isExternalLink(data.path)}
				// action
				onMouseEnter={handleOpenMenu}
				onMouseLeave={onClose}
			/>
		);
	};

	const renderDropdown = () => {
		return (
			!!data.children && (
				<NavDropdown
					open={open}
					onMouseEnter={handleOpenMenu}
					onMouseLeave={onClose}
				>
					<Nav>
						<NavUl sx={{ gap: 3, flexDirection: 'row' }}>
							{data.children.map((list) => {
								return (
									<NavSubList
										key={list.subheader}
										subheader={list.subheader}
										data={list.items}
									/>
								);
							})}
						</NavUl>
					</Nav>
				</NavDropdown>
			)
		);
	};

	return (
		<NavLi sx={sx} {...other}>
			{renderNavItem()}
			{renderDropdown()}
		</NavLi>
	);
};

// ----------------------------------------------------------------------

const NavSubList = ({ data, subheader, sx, ...other }: NavSubListProps) => {
	const pathname = usePathname();

	const isDashboard = subheader === 'Dashboard';

	return (
		<NavLi
			sx={[
				() => {
					return {
						flexGrow: 1,
						flexBasis: 'auto',
						flexShrink: isDashboard ? 1 : 0,
						...(isDashboard && { maxWidth: 560 }),
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<NavUl>
				<NavLi
					sx={(theme) => {
						return {
							mb: 0.75,
							typography: 'overline',
							fontSize: theme.typography.pxToRem(11),
						};
					}}
				>
					{subheader}
				</NavLi>

				{data.map((item) => {
					return isDashboard ? (
						<NavLi key={item.title} sx={{ mt: 0.75 }}>
							<NavItemDashboard path={item.path} />
						</NavLi>
					) : (
						<NavLi key={item.title} sx={{ mt: 0.75 }}>
							<NavItem
								subItem
								title={item.title}
								path={item.path}
								active={isEqualPath(item.path, pathname)}
							/>
						</NavLi>
					);
				})}
			</NavUl>
		</NavLi>
	);
};
