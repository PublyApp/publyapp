import type { QueryClient } from '@tanstack/react-query';
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useLocation,
} from '@tanstack/react-router';

import appCss from '../styles/app.css?url';
import { AuthLayout } from '../layouts/auth-layout';
import { AuthedLayout } from '../layouts/authed-layout';
import { MarketingLayout } from '../layouts/marketing-layout';

type RouteSurface = 'auth' | 'authed' | 'marketing';

const resolveRouteSurface = (pathname: string): RouteSurface => {
	if (pathname.startsWith('/staff') || pathname.startsWith('/tenant')) {
		return 'authed';
	}

	if (pathname.startsWith('/login') || pathname.startsWith('/auth')) {
		return 'auth';
	}

	return 'marketing';
};

const RoutedShell = () => {
	const location = useLocation();
	const pathname = location.pathname;
	const surface = resolveRouteSurface(pathname);

	if (surface === 'authed') {
		return (
			<AuthedLayout pathname={pathname}>
				<Outlet />
			</AuthedLayout>
		);
	}

	if (surface === 'auth') {
		return (
			<AuthLayout pathname={pathname}>
				<Outlet />
			</AuthLayout>
		);
	}

	return (
		<MarketingLayout pathname={pathname}>
			<Outlet />
		</MarketingLayout>
	);
};

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		title: 'front-2',
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
		],
		links: [{ rel: 'stylesheet', href: appCss }],
	}),
	component: () => (
		<html lang="en" className="front-2-shell">
			<head>
				<HeadContent />
			</head>
			<body>
				<RoutedShell />
				<Scripts />
			</body>
		</html>
	),
});
