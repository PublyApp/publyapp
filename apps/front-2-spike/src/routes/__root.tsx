import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
/// <reference types="vite/client" />
import {
	HeadContent,
	Link,
	Outlet,
	Scripts,
	createRootRouteWithContext,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary';
import { NotFound } from '~/components/NotFound';
import { seo } from '~/utils/seo';

import appCss from '~/styles/app.css?url';

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			...seo({
				title:
					'TanStack Start | Type-Safe, Client-First, Full-Stack React Framework',
				description: `TanStack Start is a type-safe, client-first, full-stack React framework. `,
			}),
		],
		links: [
			{ rel: 'stylesheet', href: appCss },
			{
				rel: 'apple-touch-icon',
				sizes: '180x180',
				href: '/apple-touch-icon.png',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/favicon-32x32.png',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon-16x16.png',
			},
			{ rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
			{ rel: 'icon', href: '/favicon.ico' },
		],
	}),
	errorComponent: (props) => {
		return (
			<RootDocument>
				<DefaultCatchBoundary {...props} />
			</RootDocument>
		);
	},
	notFoundComponent: () => <NotFound />,
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html>
			<head>
				<HeadContent />
			</head>
			<body>
				<div className="p-2 flex gap-2 text-lg">
					<Link
						to="/"
						activeProps={{
							className: 'font-bold',
						}}
						activeOptions={{ exact: true }}
					>
						Home
					</Link>{' '}
					<Link
						to="/login"
						activeProps={{
							className: 'font-bold',
						}}
					>
						Login
					</Link>{' '}
					<Link
						to="/staff/staff-users"
						activeProps={{
							className: 'font-bold',
						}}
					>
						Staff Users
					</Link>
				</div>
				<hr />
				{children}
				{/* Dev-only: devtools expose router/query state, so they must never
				    ship to a deployed/prod build. import.meta.env.DEV is statically
				    `false` in prod, so this branch is dead-code-eliminated. */}
				{import.meta.env.DEV ? (
					<>
						<TanStackRouterDevtools position="bottom-right" />
						<ReactQueryDevtools buttonPosition="bottom-left" />
					</>
				) : null}
				<Scripts />
			</body>
		</html>
	);
}
