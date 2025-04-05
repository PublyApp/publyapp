import '@pigment-css/react/styles.css'; // import Pigment CSS styles/variables

import './styles/main.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { useChangeLanguage } from 'remix-i18next/react';

import { ErrorBoundary as TemplateErrorBoundary } from '@/front/components/error-boundary';
import { APP_NAME } from '@/shared/lib/constants';

import type { Route } from './+types/root';
import { MotionLazy } from './components/animate/motion-lazy';
import { View500 } from './components/error/500-view';
import { SettingsDrawer } from './components/settings/drawer';
import { defaultSettings } from './components/settings/settings-config';
import { MuiThemeProvider } from './lib/mui/theme/theme-provider';
import { defaultQueryClient } from './lib/react-query/queryClient';
import { getServerLoader } from './lib/react-router/server.data';

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
			href: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
		},
	];
};

export const meta = (_: Route.MetaArgs) => {
	return [
		{ title: `${APP_NAME}: The PDF API` },
		{ name: 'description', content: 'The API for converting your HTML into PDF that just works!!' },
	];
};

export const loader = getServerLoader({
	loader: async ({ locale }) => {
		return { locale };
	},
});

export const Layout = ({ children }: { children: React.ReactNode }) => {
	const { i18n } = useTranslation();

	return (
		<html lang={i18n.language} dir={i18n.dir()}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				<QueryClientProvider client={defaultQueryClient}>
					<MuiThemeProvider>
						<MotionLazy>
							<SettingsDrawer defaultSettings={defaultSettings} />
							{children}
						</MotionLazy>
					</MuiThemeProvider>
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
	// return <View500 />;

	// eslint-disable-next-line turbo/no-undeclared-env-vars
	if (import.meta.env.PROD) {
		return <View500 />;
	}

	return <TemplateErrorBoundary error={error} />;

	// let message = 'Oops!';
	// let details = 'An unexpected error occurred.';
	// let stack: string | undefined;

	// if (isRouteErrorResponse(error)) {
	// 	message = error.status === 404 ? '404' : 'Error';
	// 	details = error.status === 404 ? 'The requested page could not be found.' : error.statusText || details;
	// } else if (import.meta.env.DEV && error && error instanceof Error) {
	// 	details = error.message;
	// 	stack = error.stack;
	// }

	// return (
	// 	<main>
	// 		<h1>{message}</h1>
	// 		<p>{details}</p>
	// 		{stack && (
	// 			<pre>
	// 				<code>{stack}</code>
	// 			</pre>
	// 		)}
	// 	</main>
	// );
};
