import { Button, Card } from '@heroui/react';
import type { QueryClient } from '@tanstack/react-query';
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router';

import appCss from '../styles/app.css?url';

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		links: [{ rel: 'stylesheet', href: appCss }],
	}),
	component: () => (
		<html lang="en" className="front-2-shell">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>front-2</title>
				<HeadContent />
			</head>
			<body>
				<div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-100 p-8">
					<header className="mb-8 flex items-center justify-between rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
						<strong className="text-lg font-semibold">front-2 shell</strong>
						<Button variant="primary">Hello</Button>
					</header>
					<Card className="mx-auto max-w-3xl p-4">
						<Outlet />
					</Card>
				</div>
				<Scripts />
			</body>
		</html>
	),
});
