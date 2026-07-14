import {
	IconChevronRight,
	IconLayoutSidebar,
	IconMenu2,
	IconX,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';

import logoSvg from '../../assets/gray-ui/logo.svg';
import { useMediaQuery } from '../../lib/hooks/use-media-query';
import {
	getActiveRailItem,
	getBreadcrumbsForPath,
	getRailItemsForPath,
	getSecondaryPanelItems,
	isRailOnlyPath,
	isSecondaryPanelItemActive,
	shouldShowSecondaryPanel,
} from '../../lib/navigation/route-metadata';
import type {
	AppRouteMetadata,
	SecondaryPanelItem,
} from '../../lib/navigation/route-metadata';
import { useUiStore } from '../../lib/store/ui-store';
import { ThemeToggle } from './theme/theme-toggle';
import { AppShellUserMenu } from './user-menu';

type AppShellMode = 'authed' | 'marketing';

type NavItem = {
	labelKey: string;
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

const MARKETING_NAV_ITEMS: NavItem[] = [
	{
		labelKey: 'nav-home',
		path: '/',
	},
	{
		labelKey: 'login',
		path: '/login',
	},
];

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
	mode: Exclude<AppShellMode, 'authed'>;
	pathname: string;
}) => {
	const { t } = useTranslation('common');
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const navItems = MARKETING_NAV_ITEMS;
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
			aria-label={isMobile ? t('mobile-navigation') : t('primary-navigation')}
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
						key={item.labelKey}
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
						{t(item.labelKey)}
					</Link>
				);
			})}
		</nav>
	);

	const navButtonLabel = isMenuOpen ? t('nav-close-menu') : t('nav-open-menu');

	return (
		<header className="app-shell-header">
			<div className="app-shell-header-inner">
				<div className="font-semibold tracking-wide text-foreground">
					PublyApp
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
	onNavigate,
	showLabel = false,
}: {
	item: AppRouteMetadata;
	isActive: boolean;
	onNavigate?: () => void;
	/** The mobile drawer renders a full-width sheet, where a column of bare
	 * icon glyphs is ambiguous — show the label inline there instead of
	 * relying solely on `aria-label` (r3-shell-F6). */
	showLabel?: boolean;
}) => {
	const { t } = useTranslation('common');
	const Icon = item.Icon;

	if (showLabel) {
		return (
			<Link
				to={item.path}
				aria-current={isActive ? 'page' : undefined}
				onClick={onNavigate}
				data-rail-item={item.id}
				data-active={isActive ? 'true' : undefined}
				className="app-shell-secondary-nav-link"
			>
				<Icon aria-hidden="true" className="size-4 shrink-0" />
				<span className="app-shell-secondary-nav-label">
					{t(item.labelKey)}
				</span>
			</Link>
		);
	}

	return (
		<Link
			to={item.path}
			aria-label={t(item.labelKey)}
			aria-current={isActive ? 'page' : undefined}
			onClick={onNavigate}
			data-rail-item={item.id}
			data-active={isActive ? 'true' : undefined}
			className="app-shell-rail-link"
		>
			<Icon aria-hidden="true" className="size-[17px]" />
		</Link>
	);
};

const SecondaryPanelNavItem = ({
	item,
	pathname,
	search,
	onNavigate,
}: {
	item: SecondaryPanelItem;
	pathname: string;
	search: AppShellSearch;
	onNavigate?: () => void;
}) => {
	const { t } = useTranslation('common');
	const isActive = isSecondaryPanelItemActive(item, pathname, search);
	const Icon = item.Icon;

	return (
		<Link
			to={item.path}
			search={(prev: AppShellSearch) => ({
				...prev,
				...item.search,
				status: item.search?.status,
				cursor: undefined,
			})}
			onClick={onNavigate}
			className="app-shell-secondary-nav-link"
			data-active={isActive ? 'true' : undefined}
		>
			<Icon aria-hidden="true" className="size-4 shrink-0" />
			<span className="app-shell-secondary-nav-label">{t(item.labelKey)}</span>
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
	const { t } = useTranslation('common');
	const sidebarOpen = useUiStore((state) => state.sidebarOpen);
	const toggleSidebarOpen = useUiStore((state) => state.toggleSidebarOpen);
	const railOnlyPanelOpen = useUiStore((state) => state.railOnlyPanelOpen);
	const toggleRailOnlyPanelOpen = useUiStore(
		(state) => state.toggleRailOnlyPanelOpen,
	);
	const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
	const activeRoute = getActiveRailItem(pathname);
	const railItems = getRailItemsForPath(pathname);
	const secondaryItems = getSecondaryPanelItems(pathname);
	const breadcrumbs = getBreadcrumbsForPath(pathname);
	const isDesktop = useMediaQuery('(min-width: 1024px)');
	const isRailOnly = isRailOnlyPath(pathname);
	const showSecondaryPanel = shouldShowSecondaryPanel(pathname, {
		sidebarOpen,
		railOnlyPanelOpen,
		viewportWidth: isDesktop ? 1024 : 0,
	});
	// The secondary panel can only ever show at desktop width (see
	// shouldShowSecondaryPanel's viewportWidth >= 1024 requirement) — below
	// that, toggling the panel changes nothing visible. Gate the toggle button
	// on the same condition so it isn't rendered lying about its own effect
	// between 768px and 1023px. Rail-only routes (detail/form) have a panel
	// too — it's just closed by default (`railOnlyPanelOpen`, in-memory only)
	// — so the toggle stays visible there and opens/closes it; that explicit
	// choice carries over across other rail-only routes for the session but
	// is not persisted, so a fresh session always starts closed. List routes
	// keep using the persisted `sidebarOpen`, defaulting to open.
	const canToggleSecondaryPanel = isDesktop && secondaryItems.length >= 2;
	const isSecondaryPanelOpenForToggle = isRailOnly
		? railOnlyPanelOpen
		: sidebarOpen;
	const handleToggleSecondaryPanel = isRailOnly
		? toggleRailOnlyPanelOpen
		: toggleSidebarOpen;

	useEffect(() => {
		setIsMobileNavOpen(false);
	}, [pathname]);

	const closeMobileNav = () => setIsMobileNavOpen(false);

	return (
		<div
			className="app-shell-workspace"
			data-testid="app-shell-shell"
			data-mode="authed"
		>
			<nav
				className="app-shell-rail"
				aria-label={t('nav-rail-primary')}
				data-testid="app-shell-rail"
			>
				<Link
					to="/staff/staff-users"
					className="app-shell-rail-logo"
					aria-label={t('nav-workspace-home')}
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
							{activeRoute ? t(activeRoute.labelKey) : null}
						</h2>
						<Badge variant="outline" className="app-shell-workspace-pill">
							{t('nav-root-workspace')}
						</Badge>
					</div>
					<nav
						className="app-shell-secondary-nav"
						aria-label={t('nav-secondary')}
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
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label={
								isMobileNavOpen ? t('nav-close-menu') : t('nav-open-menu')
							}
							aria-expanded={isMobileNavOpen}
							onClick={() => setIsMobileNavOpen(true)}
							className="app-shell-mobile-nav-toggle flex md:hidden"
							data-testid="app-shell-mobile-nav-toggle"
						>
							<IconMenu2 aria-hidden="true" className="size-[18px]" />
						</Button>
						{canToggleSecondaryPanel ? (
							<>
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label={
										isSecondaryPanelOpenForToggle
											? t('collapse-navigation-panel')
											: t('expand-navigation-panel')
									}
									onClick={handleToggleSecondaryPanel}
									className="app-shell-sidebar-toggle"
									data-testid="app-shell-sidebar-toggle"
								>
									<IconLayoutSidebar
										aria-hidden="true"
										className="size-[18px]"
									/>
								</Button>
								<div className="app-shell-topbar-separator" />
							</>
						) : null}
						<nav
							aria-label={t('nav-breadcrumb')}
							className="app-shell-breadcrumbs"
						>
							{breadcrumbs.map((item, index) => {
								const isLast = index === breadcrumbs.length - 1;
								let content: ReactNode;
								if (isLast) {
									content = (
										<span
											aria-current="page"
											className="app-shell-breadcrumb-current"
										>
											{t(item.labelKey)}
										</span>
									);
								} else if (item.path) {
									content = (
										<Link to={item.path} className="app-shell-breadcrumb-link">
											{t(item.labelKey)}
										</Link>
									);
								} else {
									content = (
										<span className="app-shell-breadcrumb-muted">
											{t(item.labelKey)}
										</span>
									);
								}
								return (
									<Fragment key={`${item.labelKey}-${index}`}>
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
						<ThemeToggle className="app-shell-topbar-action-btn" />
						<div className="app-shell-topbar-separator" />
						<AppShellUserMenu />
					</div>
				</header>
				<main className="app-shell-main">{children}</main>
			</div>
			<Drawer open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
				<DrawerContent
					id="app-shell-mobile-nav-drawer"
					data-testid="app-shell-mobile-nav-drawer"
				>
					<DrawerHeader>
						<DrawerTitle>{t('nav-mobile-drawer-title')}</DrawerTitle>
					</DrawerHeader>
					<DrawerBody className="flex flex-col gap-4">
						<nav
							aria-label={t('nav-rail-primary')}
							className="flex flex-col gap-1"
						>
							{railItems.map((item) => {
								const isActive = activeRoute?.id === item.id;

								return (
									<RailLink
										key={item.id}
										item={item}
										isActive={isActive}
										onNavigate={closeMobileNav}
										showLabel
									/>
								);
							})}
						</nav>
						{secondaryItems.length > 0 ? (
							<nav
								aria-label={t('nav-secondary')}
								className="flex flex-col gap-1"
							>
								{secondaryItems.map((item) => (
									<SecondaryPanelNavItem
										key={item.id}
										item={item}
										pathname={pathname}
										search={search}
										onNavigate={closeMobileNav}
									/>
								))}
							</nav>
						) : null}
					</DrawerBody>
				</DrawerContent>
			</Drawer>
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
