import { Button, buttonVariants } from '@heroui/react';
import { Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';

import { useUiStore } from '../../lib/store/ui-store';
import { ThemeToggle } from './theme/theme-toggle';

type AppShellMode = 'auth' | 'authed' | 'marketing';

type NavItem = {
	label: string;
	path: string;
	shortLabel: string;
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
			shortLabel: 'Mk',
		},
		{
			label: 'Sign in',
			path: '/login',
			shortLabel: 'SI',
		},
	],
	authed: [
		{
			label: 'Staff',
			path: '/staff',
			shortLabel: 'St',
		},
		{
			label: 'Tenant',
			path: '/tenant',
			shortLabel: 'Te',
		},
	],
	marketing: [
		{
			label: 'Home',
			path: '/',
			shortLabel: 'Hm',
		},
		{
			label: 'Login',
			path: '/login',
			shortLabel: 'Lg',
		},
	],
};

const isActivePath = (pathname: string, target: string) => {
	if (target === '/') {
		return pathname === '/';
	}

	return pathname === target || pathname.startsWith(`${target}/`);
};

const getActivePath = (items: NavItem[], pathname: string): string | null => {
	const bestMatch = items
		.filter((item) => isActivePath(pathname, item.path))
		.sort((a, b) => b.path.length - a.path.length)[0];

	return bestMatch ? bestMatch.path : null;
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
	const activePath = getActivePath(navItems, pathname);
	const closeMenu = () => setIsMenuOpen(false);

	useEffect(() => {
		if (!isMenuOpen) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				closeMenu();
			}
		};

		window.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [isMenuOpen]);

	useEffect(() => {
		setIsMenuOpen(false);
	}, [mode, pathname]);

	const renderNavButtons = ({
		closeOnSelect = false,
		isMobile = false,
	}: {
		closeOnSelect?: boolean;
		isMobile?: boolean;
	}) => (
		<nav
			aria-label={isMobile ? 'Mobile navigation' : 'Primary navigation'}
			className={
				isMobile
					? 'app-shell-mobile-menu'
					: 'app-shell-desktop-nav hidden gap-2 sm:flex'
			}
			id={isMobile ? 'app-shell-mobile-menu' : undefined}
			data-testid={isMobile ? 'app-shell-mobile-links' : undefined}
		>
			{navItems.map((item) => {
				const isActive = activePath === item.path;
				const variant = isActive ? 'primary' : 'tertiary';

				return (
					<Link
						key={item.label}
						to={item.path}
						aria-current={isActive ? 'page' : undefined}
						onClick={closeOnSelect ? closeMenu : undefined}
						className={buttonVariants({
							variant,
							size: isMobile ? 'sm' : 'md',
							className: isMobile ? 'w-full justify-start' : '',
						})}
					>
						{item.label}
					</Link>
				);
			})}
		</nav>
	);

	const navButtonLabel = isMenuOpen ? 'Close navigation' : 'Open navigation';

	return (
		<header className="app-shell-header">
			<div className="app-shell-header-inner">
				<div>
					<div className="font-semibold tracking-wide text-slate-900 dark:text-slate-50">
						PublyApp
					</div>
					<div className="text-xs text-slate-500 dark:text-slate-400">
						front-2 shell
					</div>
				</div>
				{renderNavButtons({})}
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<Button
						onPress={() => setIsMenuOpen((next) => !next)}
						variant="outline"
						size="sm"
						aria-expanded={isMenuOpen}
						aria-controls="app-shell-mobile-menu"
						aria-label={navButtonLabel}
						className="sm:hidden"
						data-testid="app-shell-mobile-menu-toggle"
					>
						{isMenuOpen ? 'Close' : 'Menu'}
					</Button>
				</div>
			</div>
			<div
				className={
					isMenuOpen
						? 'app-shell-mobile-menu-wrap'
						: 'app-shell-mobile-menu-wrap hidden'
				}
			>
				{renderNavButtons({ closeOnSelect: true, isMobile: true })}
			</div>
		</header>
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
				<div className="app-shell-main-card">{children}</div>
			</main>
		);
	}

	return (
		<AuthedAppShellNavigation pathname={pathname}>
			{children}
		</AuthedAppShellNavigation>
	);
};

const AuthedAppShellNavigation = ({
	children,
	pathname,
}: {
	children: ReactNode;
	pathname: string;
}) => {
	const { sidebarOpen, toggleSidebarOpen } = useUiStore(
		({ sidebarOpen, toggleSidebarOpen }) => ({
			sidebarOpen,
			toggleSidebarOpen,
		}),
	);
	const activePath = getActivePath(NAV_ITEMS.authed, pathname);
	const sidebarStateClass = sidebarOpen
		? 'app-shell-sidebar--open'
		: 'app-shell-sidebar--collapsed';
	const sidebarAffordanceClass = sidebarOpen
		? ''
		: 'app-shell-sidebar-link--collapsed';

	return (
		<div className="app-shell-content-wrap">
			<aside
				className={`app-shell-sidebar ${sidebarStateClass}`}
				data-testid="app-shell-sidebar"
				aria-label="Primary navigation"
			>
				<div className="app-shell-sidebar-title">Navigation</div>
				{NAV_ITEMS.authed.map((item) => {
					const isActive = activePath === item.path;

					return (
						<Link
							key={item.label}
							to={item.path}
							aria-label={item.label}
							aria-current={isActive ? 'page' : undefined}
							className={buttonVariants({
								variant: isActive ? 'primary' : 'outline',
								size: 'md',
								className: `app-shell-sidebar-link w-full justify-start ${sidebarAffordanceClass}`,
							})}
						>
							<span
								aria-hidden="true"
								className={
									sidebarOpen ? 'sr-only' : 'app-shell-sidebar-short-label'
								}
							>
								{item.shortLabel}
							</span>
							<span
								className={
									sidebarOpen
										? 'app-shell-sidebar-label'
										: 'app-shell-sidebar-label sr-only'
								}
							>
								{item.label}
							</span>
						</Link>
					);
				})}
				<Button
					size="sm"
					variant="primary"
					className="app-shell-sidebar-toggle"
					onPress={toggleSidebarOpen}
					aria-expanded={sidebarOpen}
					aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
				>
					{sidebarOpen ? 'Collapse' : 'Expand'}
				</Button>
			</aside>
			<main className="app-shell-main">
				<div className="app-shell-main-card">{children}</div>
			</main>
		</div>
	);
};

export const AppShell = ({
	children,
	mode = 'marketing',
	pathname = '/',
}: AppShellProps) => {
	const hydrateFromStorage = useUiStore(({ hydrateFromStorage }) => ({
		hydrateFromStorage,
	})).hydrateFromStorage;

	useEffect(() => {
		hydrateFromStorage();
	}, [hydrateFromStorage]);

	return (
		<div
			className="app-shell-shell"
			data-mode={mode}
			data-testid="app-shell-shell"
		>
			<AppShellHeader mode={mode} pathname={pathname} />
			<div className="h-6" />
			<AppShellNavigation mode={mode} pathname={pathname}>
				{children}
			</AppShellNavigation>
		</div>
	);
};
