import {
	Button,
	Card,
	CardBody,
	Navbar,
	NavbarBrand,
	NavbarContent,
	NavbarItem,
	NavbarMenu,
	NavbarMenuItem,
	NavbarMenuToggle,
	Spacer,
} from '@heroui/react';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';

import { useUiStore } from '../../lib/store/ui-store';
import { ThemeToggle } from './theme/theme-toggle';

type AppShellMode = 'auth' | 'authed' | 'marketing';

type NavItem = {
	label: string;
	path: string;
};

type AppShellProps = {
	children: ReactNode;
	mode?: AppShellMode;
	pathname?: string;
};

const NAV_ITEMS: Record<AppShellMode, NavItem[]> = {
	auth: [
		{
			label: 'Marketing',
			path: '/',
		},
		{
			label: 'Sign in',
			path: '/login',
		},
	],
	authed: [
		{
			label: 'Staff',
			path: '/staff',
		},
		{
			label: 'Tenant',
			path: '/tenant',
		},
		{
			label: 'Reports',
			path: '/staff/reports',
		},
	],
	marketing: [
		{
			label: 'Home',
			path: '/',
		},
		{
			label: 'Login',
			path: '/login',
		},
	],
};

const isActivePath = (pathname: string, target: string) => {
	if (target === '/') {
		return pathname === '/';
	}

	return pathname === target || pathname.startsWith(`${target}/`);
};

const renderNavItem = (item: NavItem, pathname: string) => {
	const isActive = isActivePath(pathname, item.path);

	return (
		<NavbarItem isActive={isActive} key={item.label}>
			<Button
				as={Link}
				to={item.path}
				size="sm"
				variant={isActive ? 'solid' : 'flat'}
				color={isActive ? 'primary' : 'default'}
			>
				{item.label}
			</Button>
		</NavbarItem>
	);
};

const AppShellHeader = ({
	mode,
	pathname,
}: {
	mode: AppShellMode;
	pathname: string;
}) => {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const navItems = NAV_ITEMS[mode];

	return (
		<Navbar
			isMenuOpen={isMenuOpen}
			onMenuOpenChange={setIsMenuOpen}
			className="app-shell-header"
		>
			<NavbarBrand>
				<div>
					<div className="font-semibold tracking-wide text-slate-900 dark:text-slate-50">
						PublyApp
					</div>
					<div className="text-xs text-slate-500 dark:text-slate-400">
						front-2 shell
					</div>
				</div>
			</NavbarBrand>
			<NavbarContent className="hidden gap-2 sm:flex" justify="center">
				{navItems.map((item) => renderNavItem(item, pathname))}
			</NavbarContent>
				<NavbarContent justify="end">
					<ThemeToggle />
					<NavbarMenuToggle
						className="sm:hidden"
						data-testid="app-shell-mobile-menu-toggle"
						aria-label="Main navigation"
					/>
				</NavbarContent>
			<NavbarMenu>
				{navItems.map((item) => (
					<NavbarMenuItem key={item.label}>
						<Button
							as={Link}
							to={item.path}
							size="sm"
							variant={
								isActivePath(pathname, item.path) ? 'solid' : 'light'
							}
							color={
								isActivePath(pathname, item.path)
									? 'primary'
									: 'default'
							}
							onPress={() => setIsMenuOpen(false)}
						>
							{item.label}
						</Button>
					</NavbarMenuItem>
				))}
			</NavbarMenu>
		</Navbar>
	);
};

const AppShellNavigation = ({
	children,
	mode,
	pathname,
}: {
	children: ReactNode;
	mode: AppShellMode;
	pathname: string;
}) => {
	const showSidebar = mode === 'authed';

	if (!showSidebar) {
		return (
			<main className="app-shell-main">
				<Card className="app-shell-main-card" shadow="sm">
					<CardBody>{children}</CardBody>
				</Card>
			</main>
		);
	}

	return <AuthedAppShellNavigation pathname={pathname}>{children}</AuthedAppShellNavigation>;
};

const AuthedAppShellNavigation = ({
	children,
	pathname,
}: {
	children: ReactNode;
	pathname: string;
}) => {
	const sidebarOpen = useUiStore((state) => state.sidebarOpen);
	const toggleSidebarOpen = useUiStore((state) => state.toggleSidebarOpen);
	const sidebarStateClass = sidebarOpen
		? 'app-shell-sidebar--open'
		: 'app-shell-sidebar--collapsed';
	const sidebarLinkLabelClass = sidebarOpen ? '' : 'sr-only';

	return (
		<div className="app-shell-content-wrap">
			<Card
				as="aside"
				className={`app-shell-sidebar ${sidebarStateClass}`}
				data-testid="app-shell-sidebar"
				aria-label="Primary navigation"
			>
				<div className="app-shell-sidebar-title">Navigation</div>
				{NAV_ITEMS.authed.map((item) => {
					const isActive = isActivePath(pathname, item.path);
					const linkLabel = item.label;

					return (
						<Button
							key={item.label}
							as={Link}
							to={item.path}
							className={`app-shell-sidebar-link w-full justify-start ${
								sidebarOpen ? '' : 'app-shell-sidebar-link--collapsed'
							}`}
							variant={isActive ? 'solid' : 'light'}
							color={isActive ? 'primary' : 'default'}
							aria-label={linkLabel}
						>
							<span className={sidebarLinkLabelClass}>{linkLabel}</span>
						</Button>
					);
				})}
				<Button
					size="sm"
					variant="flat"
					color="primary"
					className="app-shell-sidebar-toggle"
					onPress={toggleSidebarOpen}
					aria-expanded={sidebarOpen}
					aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
				>
					{sidebarOpen ? 'Collapse' : 'Expand'}
				</Button>
			</Card>
			<main className="app-shell-main">
				<Card className="app-shell-main-card" shadow="sm">
					<CardBody>{children}</CardBody>
				</Card>
			</main>
		</div>
	);
};

export const AppShell = ({
	children,
	mode = 'marketing',
	pathname = '/',
}: AppShellProps) => {
	return (
		<div className="app-shell-shell" data-mode={mode} data-testid="app-shell-shell">
			<AppShellHeader mode={mode} pathname={pathname} />
			<Spacer y={6} />
			<AppShellNavigation mode={mode} pathname={pathname}>
				{children}
			</AppShellNavigation>
		</div>
	);
};
