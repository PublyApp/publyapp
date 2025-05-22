import './styles/main.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from 'react-router';
import { useChangeLanguage } from 'remix-i18next/react';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';

import { ErrorBoundary as TemplateErrorBoundary } from '@/front/components/error-boundary';
import { APP_NAME } from '@/shared/lib/constants';

import type { Route } from './+types/root';
import { MotionLazy } from './components/animate/motion-lazy';
import { NotFoundView, View403, View500 } from '@/front/components/error';
import { SettingsDrawer } from '@/front/components/settings';
import { defaultSettings } from '@/front/components/settings';
import { MuiThemeProvider } from './lib/mui/theme/theme-provider';
import { defaultQueryClient } from './lib/react-query/query-client';
import { getServerLoader } from './lib/react-router/server-data.server';
import { Snackbar } from './components/snackbar/snackbar';
import View400 from './components/error/400-view';
import _ from 'lodash';

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
		{
			name: 'description',
			content: 'The API for converting your HTML into PDF that just works!!',
		},
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
				{/* <script src="https://unpkg.com/react-scan/dist/auto.global.js" /> */}
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				<QueryClientProvider client={defaultQueryClient}>
					<MuiThemeProvider>
						<MotionLazy>
							<Snackbar />
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

	return (
		<NuqsAdapter>
			<Outlet />
		</NuqsAdapter>
	);
};

export default App;

export const ErrorBoundary = ({ error }: Route.ErrorBoundaryProps) => {
	if (isRouteErrorResponse(error)) {
		if (error.status === 400) {
			return (
				<View400
					title={_.get(error.data, 'title')}
					description={_.get(error.data, 'description')}
				/>
			);
		}
		if (error.status === 403) {
			return <View403 />;
		}
		if (error.status === 404) {
			return <NotFoundView />;
		}
	}

	if (import.meta.env.PROD) {
		return <View500 />;
	}

	return <TemplateErrorBoundary error={error} />;
};
