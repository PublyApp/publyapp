import '@mantine/core/styles.css'; // import Mantine V7 styles needed by MRT
import '@mantine/dates/styles.css'; // if using mantine date picker features
import '@pigment-css/react/styles.css'; // import Pigment CSS styles/variables

import 'mantine-react-table/styles.css'; // import MRT styles

import './styles/main.css';
import './styles/mantine.css';
import './styles/tailwind.css';

import { Button, MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ErrorBoundaryProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { useChangeLanguage } from 'remix-i18next/react';

import type { Route } from './+types/root';
import QueryBoundary from './components/QueryBoundary';
import { shadcnCssVariableResolver } from './lib/mantine/css-vars-reslover';
import { shadcnTheme } from './lib/mantine/theme';
import { defaultQueryClient } from './lib/react-query/queryClient';
import { getServerLoader } from './lib/react-router/server.data';

export const loader = getServerLoader({
	loader: async ({ locale }) => {
		return { locale };
	},
});

export const links: Route.LinksFunction = () => {
	return [
		{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
		{
			rel: 'preconnect',
			href: 'https://fonts.gstatic.com',
			crossOrigin: 'anonymous',
		},
		{
			rel: 'stylesheet',
			href: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap',
		},
	];
};

const FallbackComponent: ErrorBoundaryProps['FallbackComponent'] = ({ error, resetErrorBoundary }) => {
	console.log('❌❌', error);
	return (
		<div>
			<h1>Oops! Something went wrong</h1>
			<Button
				onClick={() => {
					resetErrorBoundary();
				}}
			>
				retry
			</Button>
		</div>
	);
};

const suspenseFallback = <h1>Auth loading, please wait....</h1>;

export const Layout = ({ children }: { children: React.ReactNode }) => {
	const { i18n } = useTranslation();

	return (
		// add suppressHydrationWarning to avoid mantine hydration error:
		// https://github.com/mantinedev/mantine/issues/7008#issuecomment-2432733026
		<html lang={i18n.language} dir={i18n.dir()} suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				<QueryClientProvider client={defaultQueryClient}>
					<MantineProvider theme={shadcnTheme} cssVariablesResolver={shadcnCssVariableResolver}>
						<QueryBoundary FallbackComponent={FallbackComponent} suspenseFallback={suspenseFallback}>
							{children}
						</QueryBoundary>
					</MantineProvider>
				</QueryClientProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
};

const App = ({ loaderData }: Route.ComponentProps) => {
	const { locale } = loaderData;

	// This hook will change the i18n instance language to the current locale
	// detected by the loader, this way, when we do something to change the
	// language, this locale will change and i18next will load the correct
	// translation files
	useChangeLanguage(locale);

	return <Outlet />;
};

export default App;

export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	let message = 'Oops!';
	let details = 'An unexpected error occurred.';
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? '404' : 'Error';
		details = error.status === 404 ? 'The requested page could not be found.' : error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main>
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre>
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
};
