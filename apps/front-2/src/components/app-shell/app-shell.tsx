import {
	IconBell,
	IconChevronDown,
	IconChevronRight,
	IconLayoutSidebar,
	IconMenu2,
	IconMessage2,
	IconSearch,
	IconX,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Avatar, AvatarImage } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

import avatarSrc from '../../assets/gray-ui/avatar-profile.jpg';
import logoSvg from '../../assets/gray-ui/logo.svg';
import { useMediaQuery } from '../../lib/hooks/use-media-query';
import {
	getActiveRailItem,
	getBreadcrumbsForPath,
	getBottomRailItemForPath,
	getRailItemsForPath,
	getSecondaryPanelItems,
	isSecondaryPanelItemActive,
	shouldShowSecondaryPanel,
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

/** Only the keys secondary-panel items can filter on (e.g. tenants' status). */
type AppShellSearch = Record<string, unknown>;

type AppShellProps = {
	children: ReactNode;
	mode?: AppShellMode;
	pathname?: string;
	search?: AppShellSearch;
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
						onClick={() => setIsMenuOpen((next) => !next)}
						variant="outline"
						size="icon"
						aria-expanded={isMenuOpen}
						aria-controls="app-shell-mobile-menu"
						aria-label={navButtonLabel}
						className="sm:hidden"
						data-testid="app-shell-mobile-menu-toggle"
					>
						{isMenuOpen ? (
							<IconX aria-hidden="true" className="size-4" />
						) : (
							<IconMenu2 aria-hidden="true" className="size-4" />
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
	search,
}: {
	children: ReactNode;
	mode: AppShellMode;
	pathname: string;
	search: AppShellSearch;
}) => {
	if (mode !== 'authed') {
		return (
			<main className="app-shell-main">
				<div className="app-shell-main-card">{children}</div>
			</main>
		);
	}

	return (
		<AuthedWorkspaceShell pathname={pathname} search={search}>
			{children}
		</AuthedWorkspaceShell>
	);
};

const RailLink = ({
	item,
	isActive,
	isBottom,
}: {
	item: AppRouteMetadata;
	isActive: boolean;
	isBottom?: boolean;
}) => {
	const Icon = item.Icon;

	return (
		<Link
			to={item.path as never}
			aria-label={item.label}
			aria-current={isActive ? 'page' : undefined}
			data-rail-item={item.id}
			data-active={isActive ? 'true' : undefined}
			data-bottom={isBottom ? 'true' : undefined}
			className="app-shell-rail-link"
		>
			{isBottom ? (
				<span className="app-shell-rail-account-avatar" aria-hidden="true">
					<img
						src={avatarSrc}
						alt=""
						className="app-shell-rail-account-image"
					/>
				</span>
			) : (
				<Icon aria-hidden="true" className="size-[17px]" />
			)}
		</Link>
	);
};

const SecondaryPanelNavItem = ({
	item,
	pathname,
	search,
}: {
	item: SecondaryPanelItem;
	pathname: string;
	search: AppShellSearch;
}) => {
	const isActive = isSecondaryPanelItemActive(item, pathname, search);
	const Icon = item.Icon;

	return (
		<Link
			to={item.path}
			search={item.search}
			className="app-shell-secondary-nav-link"
			data-active={isActive ? 'true' : undefined}
		>
			<Icon aria-hidden="true" className="size-4 shrink-0" />
			<span className="app-shell-secondary-nav-label">{item.label}</span>
			{item.count !== undefined ? (
				<span
					className="app-shell-secondary-nav-count"
					data-tone={item.countTone ?? 'neutral'}
				>
					{item.count}
				</span>
			) : null}
		</Link>
	);
};

const AuthedWorkspaceShell = ({
	children,
	pathname,
	search,
}: {
	children: ReactNode;
	pathname: string;
	search: AppShellSearch;
}) => {
	const sidebarOpen = useUiStore((state) => state.sidebarOpen);
	const toggleSidebarOpen = useUiStore((state) => state.toggleSidebarOpen);
	const activeRoute = getActiveRailItem(pathname);
	const railItems = getRailItemsForPath(pathname);
	const bottomRailItem = getBottomRailItemForPath(pathname);
	const secondaryItems = getSecondaryPanelItems(pathname);
	const breadcrumbs = getBreadcrumbsForPath(pathname);
	const isDesktop = useMediaQuery('(min-width: 1024px)');
	const showSecondaryPanel = shouldShowSecondaryPanel(pathname, {
		sidebarOpen,
		viewportWidth: isDesktop ? 1024 : 0,
	});
	// The secondary panel can only ever show at desktop width (see
	// shouldShowSecondaryPanel's viewportWidth >= 1024 requirement) — below
	// that, toggling `sidebarOpen` changes nothing visible. Gate the toggle
	// button on the same condition so it isn't rendered lying about its own
	// effect between 768px and 1023px.
	const canToggleSecondaryPanel = isDesktop && secondaryItems.length >= 2;

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
					{railItems.map((item) => {
						const isActive = activeRoute?.id === item.id;

						return <RailLink key={item.id} item={item} isActive={isActive} />;
					})}
				</div>
				<div className="app-shell-rail-spacer" />
				{bottomRailItem ? (
					<RailLink
						item={bottomRailItem}
						isActive={activeRoute?.id === bottomRailItem.id}
						isBottom
					/>
				) : null}
			</nav>
			{showSecondaryPanel ? (
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
							{activeRoute?.label}
						</h2>
						{activeRoute?.scope === 'tenant' ? (
							<Badge variant="outline" className="app-shell-tenant-pill">
								<span
									aria-hidden="true"
									className="app-shell-tenant-pill-brand"
								/>
								Lattice Cloud
							</Badge>
						) : (
							<Badge variant="outline" className="app-shell-workspace-pill">
								Workspace
							</Badge>
						)}
					</div>
					<div className="app-shell-secondary-search">
						<div className="app-shell-search-wrapper">
							<IconSearch
								aria-hidden="true"
								className="app-shell-search-icon"
							/>
							<Input
								aria-label={
									activeRoute ? `Search ${activeRoute.label}` : 'Search'
								}
								placeholder="Search"
								className="app-shell-search-input"
							/>
						</div>
					</div>
					<nav
						className="app-shell-secondary-nav"
						aria-label={`${activeRoute?.label ?? 'Primary'} navigation`}
					>
						{secondaryItems.map((item) => (
							<SecondaryPanelNavItem
								key={item.id}
								item={item}
								pathname={pathname}
								search={search}
							/>
						))}
					</nav>
				</aside>
			) : null}
			<div className="app-shell-body">
				<header className="app-shell-topbar" data-testid="app-shell-topbar">
					<div className="app-shell-topbar-left">
						{canToggleSecondaryPanel ? (
							<>
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label={
										sidebarOpen
											? 'Collapse navigation panel'
											: 'Expand navigation panel'
									}
									onClick={toggleSidebarOpen}
									className="app-shell-sidebar-toggle"
								>
									<IconLayoutSidebar
										aria-hidden="true"
										className="size-[18px]"
									/>
								</Button>
								<div className="app-shell-topbar-separator" />
							</>
						) : null}
						<nav aria-label="Breadcrumb" className="app-shell-breadcrumbs">
							{breadcrumbs.map((item, index) => {
								const isLast = index === breadcrumbs.length - 1;
								let content: ReactNode;
								if (isLast) {
									content = (
										<span
											aria-current="page"
											className="app-shell-breadcrumb-current"
										>
											{item.label}
										</span>
									);
								} else if (item.path) {
									content = (
										<Link
											to={item.path as never}
											className="app-shell-breadcrumb-link"
										>
											{item.label}
										</Link>
									);
								} else {
									content = (
										<span className="app-shell-breadcrumb-muted">
											{item.label}
										</span>
									);
								}
								return (
									<Fragment key={`${item.label}-${index}`}>
										{index > 0 ? (
											<IconChevronRight
												aria-hidden="true"
												className="app-shell-breadcrumb-chevron"
											/>
										) : null}
										{content}
									</Fragment>
								);
							})}
						</nav>
					</div>
					<div className="app-shell-topbar-right">
						<Button
							variant="outline"
							size="icon"
							aria-label="Search"
							className="app-shell-topbar-action-btn"
						>
							<IconSearch aria-hidden="true" className="size-[17px]" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							aria-label="Notifications"
							className="app-shell-topbar-action-btn"
						>
							<IconBell aria-hidden="true" className="size-[17px]" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							aria-label="Messages"
							className="app-shell-topbar-action-btn"
						>
							<IconMessage2 aria-hidden="true" className="size-[17px]" />
						</Button>
						<ThemeToggle className="app-shell-topbar-action-btn" />
						<div className="app-shell-topbar-separator" />
						<div className="app-shell-user-chip">
							<Avatar size="sm" className="size-7">
								<AvatarImage src={avatarSrc} />
							</Avatar>
							<span className="app-shell-user-name">Capt. Radan</span>
							<IconChevronDown aria-hidden="true" className="size-4" />
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
	search = {},
}: AppShellProps) => {
	const hydrateFromStorage = useUiStore((state) => state.hydrateFromStorage);

	useEffect(() => {
		hydrateFromStorage();
	}, [hydrateFromStorage]);

	if (mode === 'authed') {
		return (
			<AppShellNavigation mode={mode} pathname={pathname} search={search}>
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
			<AppShellNavigation mode={mode} pathname={pathname} search={search}>
				{children}
			</AppShellNavigation>
		</div>
	);
};
