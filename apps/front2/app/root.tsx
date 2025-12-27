import { CssBaseline, ThemeProvider } from '@mui/material';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import type { LinksFunction, MetaFunction } from 'react-router';
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from 'react-router';

import { theme } from '@/front2/theme';

import '@fontsource-variable/inter';
import '@fontsource-variable/public-sans';

export const links: LinksFunction = () => [
	{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
	{
		rel: 'preconnect',
		href: 'https://fonts.gstatic.com',
		crossOrigin: 'anonymous',
	},
];

export const meta: MetaFunction = () => [
	{ charSet: 'utf-8' },
	{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
	{ title: 'Front2 App' },
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<Meta />
				<Links />
			</head>
			<body>
				<InitColorSchemeScript attribute="class" />
				<ThemeProvider theme={theme}>
					<CssBaseline />
					{children}
				</ThemeProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
	let message = 'Oops!';
	let details = 'An unexpected error occurred.';
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? '404' : 'Error';
		details =
			error.status === 404
				? 'The requested page could not be found.'
				: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre
					style={{
						width: '100%',
						padding: '1rem',
						overflow: 'auto',
						background: '#f5f5f5',
					}}
				>
					{stack}
				</pre>
			)}
		</main>
	);
}
