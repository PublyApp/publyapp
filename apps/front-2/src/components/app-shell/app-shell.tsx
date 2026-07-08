import { Button, buttonVariants } from '@heroui/react';
import { Link } from '@tanstack/react-router';
import {
	ChevronRight,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	ShieldCheck,
	X,
} from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';

import {
	PRIMARY_APP_ROUTES,
	getActiveAppRoute,
	getBreadcrumbsForPath,
	getShellDisplayMode,
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

	const displayBreadcrumbs =
		breadcrumbs.length >= 2 &&
		breadcrumbs[0].path &&
		breadcrumbs[1].path &&
		breadcrumbs[0].path === breadcrumbs[1].path
			? breadcrumbs.slice(1)
			: breadcrumbs;

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
					className="app-shell-brand"
					aria-label="PublyApp workspace"
				>
					<ShieldCheck aria-hidden="true" className="size-4" />
				</Link>
				<div className="app-shell-rail-links">
					{PRIMARY_APP_ROUTES.map((item) => {
						const isActive = activeRoute?.id === item.id;
						const Icon = item.Icon;

						return (
							<Link
								key={item.id}
								to={item.path as never}
								aria-label={item.label}
								aria-current={isActive ? 'page' : undefined}
								className="app-shell-rail-link"
								data-active={isActive ? 'true' : undefined}
							>
								<Icon aria-hidden="true" className="size-4" />
							</Link>
						);
					})}
				</div>
				<Button
					isIconOnly
					size="sm"
					variant="outline"
					aria-label={
						sidebarOpen
							? 'Collapse navigation panel'
							: 'Expand navigation panel'
					}
					onPress={toggleSidebarOpen}
					className="app-shell-panel-toggle"
				>
					{sidebarOpen ? (
						<PanelLeftClose aria-hidden="true" className="size-4" />
					) : (
						<PanelLeftOpen aria-hidden="true" className="size-4" />
					)}
				</Button>
			</nav>
			{showSecondaryPanel && activeRoute ? (
				<aside
					className="app-shell-secondary-panel"
					data-testid="app-shell-secondary-panel"
					aria-labelledby="app-shell-secondary-heading"
				>
					<div
						className="app-shell-secondary-heading"
						id="app-shell-secondary-heading"
					>
						{activeRoute.label}
					</div>
					{activeRoute.secondaryItems.map((item) => {
						const Icon = item.Icon;

						return (
							<Link
								key={item.path}
								to={item.path as never}
								className="app-shell-secondary-link"
							>
								<Icon aria-hidden="true" className="size-4" />
								<span>
									<span className="app-shell-secondary-link-title">
										{item.label}
									</span>
									<span className="app-shell-secondary-link-description">
										{item.description}
									</span>
								</span>
							</Link>
						);
					})}
				</aside>
			) : null}
			<div className="app-shell-body">
				<header className="app-shell-topbar" data-testid="app-shell-topbar">
					<nav aria-label="Breadcrumb" className="app-shell-breadcrumbs">
						{displayBreadcrumbs.map((item, index) => {
							const isLast = index === displayBreadcrumbs.length - 1;
							return (
								<Fragment key={`${item.label}-${index}`}>
									{index > 0 ? (
										<ChevronRight
											aria-hidden="true"
											className="size-4 shrink-0"
										/>
									) : null}
									{isLast ? (
										<span
											aria-current="page"
											className="font-medium text-foreground"
										>
											{item.label}
										</span>
									) : item.path ? (
										<Link to={item.path as never}>{item.label}</Link>
									) : (
										<span>{item.label}</span>
									)}
								</Fragment>
							);
						})}
					</nav>
					<div className="app-shell-topbar-actions">
						<ThemeToggle />
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
