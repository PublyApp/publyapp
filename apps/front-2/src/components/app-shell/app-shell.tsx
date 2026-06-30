import { Button, Card, CardBody, Spacer } from '@heroui/react';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';

import {
	toggleSidebarOpen,
	useUiStore,
} from '../../lib/store/ui-store';
import { ThemeToggle } from './theme/theme-toggle';

type AppShellMode = 'auth' | 'authed' | 'marketing';

type NavItem = {
	label: string;
	path: string;
};

type AppShellProps = {
	children: ReactNode;
	mode?: AppShellMode;
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
			path: '/staff',
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

const getVisiblePath = (path: string) => {
	if (!path) {
		return '/';
	}

	if (path === '/') {
		return '/';
	}

	return path;
};

const appShellShellClass = 'app-shell-shell';

const AppShellHeader = ({
	mode,
	onNavigate,
	isActivePath,
}: {
	isActivePath: (target: string) => boolean;
	mode: AppShellMode;
	onNavigate: (path: string) => void;
}) => {
	const navItems = useMemo(() => NAV_ITEMS[mode], [mode]);

	return (
		<header className="app-shell-header">
			<div className="app-shell-brand-wrap">
				<div>
					<h1 className="text-lg font-bold tracking-wide text-slate-900 dark:text-slate-50">
						PublyApp
					</h1>
					<p className="text-xs text-slate-500 dark:text-slate-400">
						front-2 shell
					</p>
				</div>
				<div className="flex items-center gap-2">
					{navItems.map((item) => {
						const path = getVisiblePath(item.path);
						const isActive = isActivePath(path);
						return (
							<Button
								key={item.label}
								size="sm"
								variant={isActive ? 'solid' : 'flat'}
								color="primary"
								onPress={() => {
									void onNavigate(item.path);
								}}
							>
								{item.label}
							</Button>
						);
					})}
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
};

const AppShellNavigation = ({
	children,
	mode,
	onNavigate,
	isActivePath,
}: {
	children: ReactNode;
	isActivePath: (target: string) => boolean;
	mode: AppShellMode;
	onNavigate: (path: string) => void;
}) => {
	const showSidebar = mode === 'authed';
	const sidebarOpen = useUiStore((state) => state.sidebarOpen);

	if (!showSidebar) {
		return (
			<main className="app-shell-main">
				<Card className="app-shell-main-card" shadow="sm">
					<CardBody>{children}</CardBody>
				</Card>
			</main>
		);
	}

	const sidebarWidthClass = sidebarOpen ? 'w-64' : 'w-20';

	return (
		<div className="app-shell-content-wrap">
			<aside
				className={`app-shell-sidebar ${sidebarWidthClass}`}
				data-testid="app-shell-sidebar"
			>
				<div className="app-shell-sidebar-title">Navigation</div>
				{NAV_ITEMS.authed.map((item) => {
					const path = getVisiblePath(item.path);
					const isActive = isActivePath(path);

					return (
						<Button
							key={item.label}
							className="app-shell-sidebar-link w-full justify-start"
							variant={isActive ? 'solid' : 'light'}
							color={isActive ? 'primary' : 'default'}
							onPress={() => {
								void onNavigate(item.path);
							}}
						>
							{item.label}
						</Button>
					);
				})}
				<Button
					size="sm"
					variant="flat"
					color="primary"
					className="mt-4"
					onPress={() => {
						toggleSidebarOpen();
					}}
				>
					Toggle sidebar
				</Button>
			</aside>
			<main className="app-shell-main">
				<Card className="app-shell-main-card" shadow="sm">
					<CardBody>{children}</CardBody>
				</Card>
			</main>
		</div>
	);
};

export const AppShell = ({ children, mode = 'marketing' }: AppShellProps) => {
	const navigate = useNavigate();
	const pathname =
		typeof window === 'undefined' ? '/' : window.location.pathname;

	const isActivePath = (target: string) =>
		pathname === target || pathname.startsWith(`${target}/`);

	return (
		<div className={appShellShellClass} data-mode={mode} data-testid="app-shell-shell">
			<AppShellHeader
				mode={mode}
				onNavigate={(path) => {
					void navigate({ to: path });
				}}
				isActivePath={isActivePath}
			/>
			<Spacer y={6} />
			<AppShellNavigation
				mode={mode}
				onNavigate={(path) => {
					void navigate({ to: path });
				}}
				isActivePath={isActivePath}
			>
				{children}
			</AppShellNavigation>
		</div>
	);
};
