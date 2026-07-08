import { Avatar, Button, Chip, Input } from '@heroui/react';
import { Link } from '@tanstack/react-router';
import {
	Bell,
	ChevronDown,
	ChevronRight,
	Menu,
	MessageCircle,
	Search,
	Settings,
	X,
} from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';

import avatarSrc from '../../assets/gray-ui/avatar-profile.jpg';
import logoSvg from '../../assets/gray-ui/logo.svg';
import {
	getActiveAppRoute,
	getBreadcrumbsForPath,
	getShellDisplayMode,
	getStaffSecondaryItems,
	getVisiblePrimaryRoutes,
} from '../../lib/navigation/route-metadata';
import type {
	AppRouteMetadata,
	SecondaryPanelItem,
} from '../../lib/navigation/route-metadata';
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

const NAV_ITEMS: Record<Exclude<AppShellMode, 'authed'>, NavItem[]> = {
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

	const parentPath = target.substring(0, target.lastIndexOf('/'));
	if (parentPath.length > 1 && pathname === parentPath) {
		return true;
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
	const navItems =
		mode === 'authed' ? [] : NAV_ITEMS[mode as keyof typeof NAV_ITEMS];
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

	if (mode === 'authed') {
		return null;
	}

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

				return (
					<Link
						key={item.label}
						to={item.path}
						aria-current={isActive ? 'page' : undefined}
						onClick={closeOnSelect ? closeMenu : undefined}
						className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors"
						style={
							isActive
								? {
										background: 'var(--publy-primary)',
										color: 'var(--publy-primary-foreground)',
									}
								: { color: 'var(--publy-foreground-muted)' }
						}
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
					<div className="font-semibold tracking-wide text-foreground">
						PublyApp
					</div>
					<div className="app-shell-header-subtitle text-xs">front-2 shell</div>
				</div>
				{renderNavButtons({})}
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<Button
						onPress={() => setIsMenuOpen((next) => !next)}
						variant="outline"
						isIconOnly
						aria-expanded={isMenuOpen}
						aria-controls="app-shell-mobile-menu"
						aria-label={navButtonLabel}
						className="sm:hidden"
						data-testid="app-shell-mobile-menu-toggle"
					>
						{isMenuOpen ? (
							<X aria-hidden="true" className="size-4" />
						) : (
							<Menu aria-hidden="true" className="size-4" />
						)}
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
	if (mode !== 'authed') {
		return (
			<main className="app-shell-main">
				<div className="app-shell-main-card">{children}</div>
			</main>
		);
	}

	return (
		<AuthedWorkspaceShell pathname={pathname}>{children}</AuthedWorkspaceShell>
	);
};

const RailLink = ({
	item,
	isActive,
}: {
	item: AppRouteMetadata;
	isActive: boolean;
}) => {
	const Icon = item.Icon;

	return (
		<Link
			to={item.path as never}
			aria-label={item.label}
			aria-current={isActive ? 'page' : undefined}
			className="app-shell-rail-link"
			data-active={isActive ? 'true' : undefined}
		>
			<Icon aria-hidden="true" className="size-[17px]" />
		</Link>
	);
};

const SecondaryPanelNavItem = ({
	item,
	pathname,
}: {
	item: SecondaryPanelItem;
	pathname: string;
}) => {
	const isActive =
		pathname === item.path || pathname.startsWith(item.path + '/');
	const Icon = item.Icon;

	return (
		<Link
			to={item.path as never}
			className="app-shell-secondary-nav-link"
			data-active={isActive ? 'true' : undefined}
		>
			<Icon aria-hidden="true" className="size-4 shrink-0" />
			<span className="app-shell-secondary-nav-label">{item.label}</span>
			{item.count !== undefined ? (
				<span className="app-shell-secondary-nav-count">{item.count}</span>
			) : null}
		</Link>
	);
};

const hasStaffSecondaryPanel = (pathname: string) =>
	pathname === '/staff/staff-users' ||
	pathname.startsWith('/staff/staff-users/') ||
	pathname === '/staff/invitations' ||
	pathname.startsWith('/staff/invitations/') ||
	pathname === '/staff/profiles' ||
	pathname.startsWith('/staff/profiles/');

const AuthedWorkspaceShell = ({
	children,
	pathname,
}: {
	children: ReactNode;
	pathname: string;
}) => {
	const sidebarOpen = useUiStore((state) => state.sidebarOpen);
	const toggleSidebarOpen = useUiStore((state) => state.toggleSidebarOpen);
	const activeRoute = getActiveAppRoute(pathname);
	const displayMode = getShellDisplayMode(pathname);
	const breadcrumbs = getBreadcrumbsForPath(pathname);
	const showSecondaryPanel = sidebarOpen && displayMode === 'default';

	const visibleRoutes = getVisiblePrimaryRoutes();
	const staffSecondaryItems = getStaffSecondaryItems();
	const showStaffSecondaryPanel =
		showSecondaryPanel && hasStaffSecondaryPanel(pathname);

	return (
		<div
			className="app-shell-workspace"
			data-testid="app-shell-shell"
			data-mode="authed"
		>
			<nav
				className="app-shell-rail"
				aria-label="Primary navigation"
				data-testid="app-shell-rail"
			>
				<Link
					to="/staff/staff-users"
					className="app-shell-rail-logo"
					aria-label="PublyApp workspace"
				>
					<img src={logoSvg} alt="PublyApp" className="size-8" />
				</Link>
				<div className="app-shell-rail-links">
					{visibleRoutes.map((item) => {
						const isActive = activeRoute?.id === item.id;

						return <RailLink key={item.id} item={item} isActive={isActive} />;
					})}
				</div>
				<div className="app-shell-rail-spacer" />
				<button
					type="button"
					className="app-shell-rail-link"
					aria-label="Settings"
				>
					<Settings aria-hidden="true" className="size-[17px]" />
				</button>
			</nav>
			{showStaffSecondaryPanel ? (
				<aside
					className="app-shell-secondary-panel"
					data-testid="app-shell-secondary-panel"
					aria-labelledby="app-shell-secondary-heading"
				>
					<div className="app-shell-secondary-header">
						<h2
							className="app-shell-secondary-title"
							id="app-shell-secondary-heading"
						>
							Staff
						</h2>
						<Chip.Root
							size="sm"
							variant="soft"
							className="app-shell-workspace-pill"
						>
							<Chip.Label>Workspace</Chip.Label>
						</Chip.Root>
					</div>
					<div className="app-shell-secondary-search">
						<div className="app-shell-search-wrapper">
							<Search aria-hidden="true" className="app-shell-search-icon" />
							<Input
								aria-label="Search staff"
								placeholder="Search"
								className="app-shell-search-input"
							/>
						</div>
					</div>
					<nav
						className="app-shell-secondary-nav"
						aria-label="Staff navigation"
					>
						{staffSecondaryItems.map((item) => (
							<SecondaryPanelNavItem
								key={item.path}
								item={item}
								pathname={pathname}
							/>
						))}
					</nav>
				</aside>
			) : null}
			<div className="app-shell-body">
				<header className="app-shell-topbar" data-testid="app-shell-topbar">
					<div className="app-shell-topbar-left">
						<Button
							isIconOnly
							size="sm"
							variant="ghost"
							aria-label={
								sidebarOpen
									? 'Collapse navigation panel'
									: 'Expand navigation panel'
							}
							onPress={toggleSidebarOpen}
							className="app-shell-sidebar-toggle"
						>
							<Menu aria-hidden="true" className="size-5" />
						</Button>
						<div className="app-shell-topbar-separator" />
						<nav aria-label="Breadcrumb" className="app-shell-breadcrumbs">
							{breadcrumbs.map((item, index) => {
								const isLast = index === breadcrumbs.length - 1;
								return (
									<Fragment key={`${item.label}-${index}`}>
										{index > 0 ? (
											<ChevronRight
												aria-hidden="true"
												className="app-shell-breadcrumb-chevron"
											/>
										) : null}
										{isLast ? (
											<span
												aria-current="page"
												className="app-shell-breadcrumb-current"
											>
												{item.label}
											</span>
										) : item.path ? (
											<Link
												to={item.path as never}
												className="app-shell-breadcrumb-link"
											>
												{item.label}
											</Link>
										) : (
											<span className="app-shell-breadcrumb-muted">
												{item.label}
											</span>
										)}
									</Fragment>
								);
							})}
						</nav>
					</div>
					<div className="app-shell-topbar-right">
						<Button
							isIconOnly
							variant="outline"
							aria-label="Search"
							className="app-shell-topbar-action-btn"
						>
							<Search aria-hidden="true" className="size-[17px]" />
						</Button>
						<Button
							isIconOnly
							variant="outline"
							aria-label="Notifications"
							className="app-shell-topbar-action-btn"
						>
							<Bell aria-hidden="true" className="size-[17px]" />
						</Button>
						<Button
							isIconOnly
							variant="outline"
							aria-label="Messages"
							className="app-shell-topbar-action-btn"
						>
							<MessageCircle aria-hidden="true" className="size-[17px]" />
						</Button>
						<div className="app-shell-topbar-separator" />
						<div className="app-shell-user-chip">
							<Avatar.Root size="sm" className="size-7">
								<Avatar.Image src={avatarSrc} />
							</Avatar.Root>
							<span className="app-shell-user-name">Capt. Radan</span>
							<ChevronDown aria-hidden="true" className="size-4" />
						</div>
					</div>
				</header>
				<main className="app-shell-main">{children}</main>
			</div>
		</div>
	);
};

export const AppShell = ({
	children,
	mode = 'marketing',
	pathname = '/',
}: AppShellProps) => {
	const hydrateFromStorage = useUiStore((state) => state.hydrateFromStorage);

	useEffect(() => {
		hydrateFromStorage();
	}, [hydrateFromStorage]);

	if (mode === 'authed') {
		return (
			<AppShellNavigation mode={mode} pathname={pathname}>
				{children}
			</AppShellNavigation>
		);
	}

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
