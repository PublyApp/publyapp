import {
	IconChevronRight,
	IconLayoutSidebar,
	IconMenu2,
} from '@tabler/icons-react';
import { Link, useMatches } from '@tanstack/react-router';
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
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import logoSvg from '../../assets/gray-ui/logo.svg';
import { useMediaQuery } from '../../lib/hooks/use-media-query';
import type {
	CrumbSpec,
	MatchForBreadcrumbs,
} from '../../lib/navigation/breadcrumbs';
import { deriveBreadcrumbTrail } from '../../lib/navigation/breadcrumbs';
import { EntityCrumb } from '../../lib/navigation/entity-crumb';
import {
	getActiveRailItem,
	getRailItemsForPath,
	getSecondaryPanelItems,
	getShellScope,
	isSecondaryPanelItemActive,
	shouldShowSecondaryPanel,
} from '../../lib/navigation/route-metadata';
import type {
	AppRouteMetadata,
	SecondaryPanelItem,
} from '../../lib/navigation/route-metadata';
import { useUiStore } from '../../lib/store/ui-store';
import { NeedsReconnectBanner } from './_needs-reconnect-banner';
import { ThemeToggle } from './theme/theme-toggle';
import { AppShellUserMenu } from './user-menu';

type AppShellMode = 'authed';

/** Only the keys secondary-panel items can filter on (e.g. tenants' status). */
type AppShellSearch = Record<string, unknown>;

type AppShellProps = {
	children: ReactNode;
	mode?: AppShellMode;
	pathname?: string;
	search?: AppShellSearch;
};

const AppShellNavigation = ({
	children,
	pathname,
	search,
}: {
	children: ReactNode;
	pathname: string;
	search: AppShellSearch;
}) => (
	<AuthedWorkspaceShell pathname={pathname} search={search}>
		{children}
	</AuthedWorkspaceShell>
);

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

// Pre-existing size finding (~310 lines before C3 added two). Splitting the
// workspace shell is a standalone maintainability change with its own
// regression surface — deliberately NOT bundled into the C3 feature.
// react-doctor-disable-next-line react-doctor/no-giant-component -- tracked for a dedicated split PR
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
	const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
	const [isPanelMotionReady, setIsPanelMotionReady] = useState(false);
	const workspaceTenantId = useResolvedWorkspaceTenantId();
	const isTenantSurface = getShellScope(pathname) === 'tenant';
	const activeRoute = getActiveRailItem(pathname);
	const railItems = getRailItemsForPath(pathname);
	const secondaryItems = getSecondaryPanelItems(pathname);
	// The logo is the scope home: a tenant user must never land on a staff
	// destination (review #1131 round 2 — MAJOR). `/tenant` re-resolves the
	// workspace (or shows the picker), so it is the tenant scope's root.
	const homePath =
		getShellScope(pathname) === 'tenant' ? '/tenant' : '/staff/staff-users';
	// The trail is a pure function of the current matches (i.e. of the URL),
	// never of fetched data — every dynamic path param the deepest match's
	// route declares MUST resolve to a named entity crumb (#973), and the
	// crumb COUNT here is final on the first frame regardless of whether any
	// entity name has loaded yet (see `EntityCrumb`).
	const breadcrumbMatches = useMatches({
		select: (matches): MatchForBreadcrumbs[] =>
			matches.map((match) => ({
				pathname: match.pathname,
				params: match.params as Record<string, string>,
				staticData: match.staticData,
			})),
	});
	const {
		root: breadcrumbRoot,
		tail: breadcrumbTail,
		params: breadcrumbParams,
	} = deriveBreadcrumbTrail(breadcrumbMatches);
	const breadcrumbs: readonly CrumbSpec[] = [
		{
			kind: 'label',
			labelKey: breadcrumbRoot.labelKey,
			to: breadcrumbRoot.path,
		},
		...breadcrumbTail,
	];
	// Stable per-position identity: kind + destination (or entity-query
	// marker) + ordinal. Index alone is not a key; content alone could collide
	// when a trail legitimately repeats a label at different depths.
	const breadcrumbKeys = breadcrumbs.map((item, index) => {
		const discriminator =
			item.kind === 'label' ? item.labelKey : `entity:${item.select.length}`;
		return `${discriminator}-${index}-${item.to ?? ''}`;
	});
	const isDesktop = useMediaQuery('(min-width: 1024px)');
	const showSecondaryPanel = shouldShowSecondaryPanel(pathname, {
		sidebarOpen,
		viewportWidth: isDesktop ? 1024 : 0,
	});
	// The secondary panel can only ever show at desktop width (see
	// shouldShowSecondaryPanel's viewportWidth >= 1024 requirement) — below
	// that, toggling the panel changes nothing visible. Gate the toggle button
	// on the same condition so it isn't rendered lying about its own effect
	// between 768px and 1023px. Panel state is driven by `sidebarOpen` for all
	// route classes, and route-type state switching is intentionally gone.
	const hasSecondaryPanel = isDesktop && secondaryItems.length >= 2;
	const isSecondaryPanelOpenForToggle = sidebarOpen;
	const handleToggleSecondaryPanel = toggleSidebarOpen;

	useEffect(() => {
		// Deliberate prop-change reset: closing the mobile nav drawer whenever
		// the URL changes IS the desired behaviour (a navigation must not
		// reopen into a stale drawer). An imperative close, not derived state.
		// react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change -- deliberate navigation-triggered reset
		setIsMobileNavOpen(false);
	}, [pathname]);

	useEffect(() => {
		let readyFrameId: number | null = null;
		const hydrationFrameId = window.requestAnimationFrame(() => {
			readyFrameId = window.requestAnimationFrame(() => {
				setIsPanelMotionReady(true);
			});
		});

		return () => {
			window.cancelAnimationFrame(hydrationFrameId);
			if (readyFrameId !== null) {
				window.cancelAnimationFrame(readyFrameId);
			}
		};
	}, []);

	const closeMobileNav = () => setIsMobileNavOpen(false);

	return (
		<div
			className="app-shell-workspace"
			data-testid="app-shell-shell"
			data-mode="authed"
			data-has-secondary-panel={hasSecondaryPanel ? 'true' : undefined}
			data-panel-open={showSecondaryPanel ? 'true' : 'false'}
			data-motion-ready={isPanelMotionReady ? 'true' : undefined}
		>
			<nav
				className="app-shell-rail"
				aria-label={t('nav-rail-primary')}
				data-testid="app-shell-rail"
			>
				<Link
					to={homePath}
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
			{hasSecondaryPanel ? (
				<aside
					className="app-shell-secondary-panel"
					data-testid="app-shell-secondary-panel"
					aria-labelledby="app-shell-secondary-heading"
					aria-hidden={showSecondaryPanel ? undefined : true}
					inert={showSecondaryPanel ? undefined : true}
				>
					<div className="app-shell-secondary-panel-inner">
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
					</div>
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
						{hasSecondaryPanel ? (
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
								const label: ReactNode =
									item.kind === 'entity' ? (
										<EntityCrumb spec={item} params={breadcrumbParams} />
									) : (
										t(item.labelKey)
									);
								const path = item.to;
								let content: ReactNode;
								if (isLast) {
									content = (
										<span
											aria-current="page"
											className="app-shell-breadcrumb-current"
										>
											{label}
										</span>
									);
								} else if (path) {
									content = (
										<Link to={path} className="app-shell-breadcrumb-link">
											{label}
										</Link>
									);
								} else {
									content = (
										<span className="app-shell-breadcrumb-muted">{label}</span>
									);
								}
								return (
									<Fragment key={breadcrumbKeys[index]}>
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
				{isTenantSurface && workspaceTenantId !== null ? (
					<NeedsReconnectBanner tenantId={workspaceTenantId} />
				) : null}
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
	pathname = '/',
	search = {},
}: AppShellProps) => (
	<AppShellNavigation pathname={pathname} search={search}>
		{children}
	</AppShellNavigation>
);
