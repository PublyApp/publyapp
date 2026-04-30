import interLatinExtFontUrl from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url';
import interLatinFontUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import GlobalStyles from '@mui/material/GlobalStyles';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { QueryClientProvider } from '@tanstack/react-query';
import i18next, { type TFunction } from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useNavigate,
} from 'react-router';
import { useChangeLanguage } from 'remix-i18next/react';

import {
	APP_NAME,
	isServer,
	queryParamValue,
} from '@org/shared-ts/lib/constants';

import { NotFoundView, View403, View500 } from '#app/components/error/index.ts';
import {
	COLOR_SCHEME_STORAGE_KEY,
	defaultSettings,
	SETTINGS_STORAGE_KEY,
	SettingsDrawer,
} from '#app/components/settings/index.ts';

import './styles/main.css';
import type { Route } from './+types/root';
import { MotionLazy } from './components/animate/motion-lazy';
import View400 from './components/error/400-view';
import { ProgressBar } from './components/progress-bar';
import { Snackbar } from './components/snackbar/snackbar';
import { useNonce } from './hooks/use-nonce-context';
import { logout } from './lib/cookies/logout.utils';
import { LocalizationProvider } from './lib/locales/localization-provider';
import { createTheme } from './lib/mui/theme/create-theme';
import { themeConfig } from './lib/mui/theme/theme-config';
import { MuiThemeProvider } from './lib/mui/theme/theme-provider';
import { getQueryClient } from './lib/react-query/query-client';
import { setGlobalNavigate } from './lib/react-router/navigation-helper';
import { getServerLoader } from './lib/react-router/server-data.server';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = capitalize(t('social-media-management-platform'));

	if (seo) {
		str = `${APP_NAME} | ${str}`;
	}

	return str;
};

const firstPaintTheme = createTheme({ settingsState: defaultSettings });
const firstPaintMuiCssVariables = firstPaintTheme.generateStyleSheets();

export const links: Route.LinksFunction = () => {
	return [
		// The theme uses Inter Variable. Preload the primary latin subsets so the
		// first paint does not swap from fallback text into the final app font.
		{
			rel: 'preload',
			href: interLatinFontUrl,
			as: 'font',
			type: 'font/woff2',
			crossOrigin: 'anonymous',
		},
		{
			rel: 'preload',
			href: interLatinExtFontUrl,
			as: 'font',
			type: 'font/woff2',
			crossOrigin: 'anonymous',
		},
	];
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{ title: getPageTitle(t, true) },
		{
			name: 'description',
			content: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ locale, z }) => {
		const t = z.t;

		return {
			locale,
			meta: [
				{ title: getPageTitle(t, true) },
				{
					name: 'description',
					content: getPageTitle(t, true),
				},
			],
		};
	},
});

/**
 * Get QueryClient with proper SSR/browser handling.
 * - Server: creates fresh client per request (no onAuthError - logout doesn't make sense on server)
 * - Browser: singleton with onAuthError for centralized 401 handling
 */
const getRootQueryClient = () => {
	// On server, getQueryClient() creates a fresh client per call (no caching)
	if (isServer) {
		return getQueryClient();
	}

	// On browser, use singleton with auth error handling
	return getQueryClient({
		onAuthError: () => {
			logout({
				redirectCause:
					queryParamValue.login_page.redirect_cause.invalid_session,
			});
		},
	});
};

const getColorSchemeBootstrapScript = () => {
	// MUI's InitColorSchemeScript can only read a flat mode key. The app's full
	// settings are stored as a Zustand payload, so this tiny pre-MUI bridge copies
	// the validated color scheme into the flat key before the first paint.
	return `
(function() {
  try {
    var settingsRaw = window.localStorage.getItem(${JSON.stringify(SETTINGS_STORAGE_KEY)});
    if (!settingsRaw) return;
    var parsed = JSON.parse(settingsRaw);
    var colorScheme = parsed &&
      parsed.state &&
      parsed.state.settingsSlice &&
      parsed.state.settingsSlice.state &&
      parsed.state.settingsSlice.state.colorScheme;
    if (colorScheme !== 'light' && colorScheme !== 'dark') return;
    window.localStorage.setItem(${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)}, colorScheme);
    document.documentElement.dataset.colorScheme = colorScheme;
  } catch (error) {}
})();
	`;
};

export const Layout = ({ children }: { children: React.ReactNode }) => {
	const { i18n } = useTranslation();
	const nonce = useNonce();
	const queryClient = getRootQueryClient();

	return (
		<html lang={i18n.language} dir={i18n.dir()} suppressHydrationWarning>
			<head>
				{/* <script src="https://unpkg.com/react-scan/dist/auto.global.js" /> */}
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="csp-nonce" content={nonce} />
				<Meta />
				<Links />
				{/* Stream MUI variables in the head so component CSS that uses
				var(--palette-*) and var(--spacing) is valid before body chunks paint. */}
				<GlobalStyles styles={firstPaintMuiCssVariables} />
			</head>
			<body>
				<script
					nonce={nonce}
					// This must run before InitColorSchemeScript. The nonce is required
					// by CSP; suppressHydrationWarning avoids React comparing the
					// browser-hidden nonce attribute during hydration.
					suppressHydrationWarning
				>
					{getColorSchemeBootstrapScript()}
				</script>
				<InitColorSchemeScript
					attribute="[data-color-scheme='%s']"
					defaultMode={themeConfig.defaultMode}
					modeStorageKey={COLOR_SCHEME_STORAGE_KEY}
					nonce={nonce}
				/>
				<QueryClientProvider client={queryClient}>
					<LocalizationProvider>
						<MuiThemeProvider>
							<MotionLazy>
								<Snackbar />
								<ProgressBar />
								<SettingsDrawer defaultSettings={defaultSettings} />
								{children}
							</MotionLazy>
						</MuiThemeProvider>
					</LocalizationProvider>
				</QueryClientProvider>
				<ScrollRestoration nonce={nonce} />
				<Scripts nonce={nonce} />
			</body>
		</html>
	);
};

const App = ({ loaderData }: Route.ComponentProps) => {
	const { locale } = loaderData;
	const navigate = useNavigate();

	// Set up global navigate for use outside React components (e.g., logout)
	// Use effect to avoid side-effects during render + avoid SSR global mutations.
	useEffect(() => {
		if (isServer) return;
		setGlobalNavigate(navigate);
	}, [navigate]);

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
					title={get(error.data, 'title')}
					description={get(error.data, 'description')}
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

	// if (import.meta.env.DEV) {
	// 	return <TemplateErrorBoundary error={error} />;
	// }

	return <View500 />;
};
