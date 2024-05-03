import { useContext, type ReactNode } from 'react';

import { withEmotionCache } from '@emotion/react';
import { unstable_useEnhancedEffect as useEnhancedEffect, useTheme } from '@mui/material';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
	useRouteError,
} from '@remix-run/react';
import { useTranslation } from 'react-i18next';
import { useChangeLanguage } from 'remix-i18next/react';

import MotionLazyContainer from '@devist/ui-react/components/MotionLazyContainer';
import SnackbarProvider from '@devist/ui-react/providers/SnackbarProvider';

import { defaultNS } from '@/shared/lib/i18n/resources';

import Error404 from './components/Error404';
import Error500 from './components/Error500';
import ClientStyleContext from './contexts/ClientStyleContext';
import CompactLayout from './layouts/compact/CompactLayout';
import MainLayout from './layouts/main/MainLayout';
import i18next from './lib/i18n/i18next.server';
import { initParse } from './lib/parse/client';

// import { initParse } from './lib/parse/legacy';

interface DocumentProps {
	children: React.ReactNode;
	title?: string;
}

initParse();

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const locale = await i18next.getLocale(request);
	return json({ locale });
	// return { locale };
};

export const handle = {
	// In the handle export, we can add a i18n key with namespaces our route
	// will need to load. This key can be a single string or an array of strings.
	// TIP: In most cases, you should set this to your defaultNS from your i18n config
	// or if you did not set one, set it to the i18next default namespace "translation"
	i18n: defaultNS,
};

const Document = withEmotionCache(({ children, title }: DocumentProps, emotionCache) => {
	const { locale } = useLoaderData<typeof loader>();
	const { i18n } = useTranslation();

	const clientStyleData = useContext(ClientStyleContext);
	const theme = useTheme();

	// This hook will change the i18n instance language to the current locale
	// detected by the loader, this way, when we do something to change the
	// language, this locale will change and i18next will load the correct
	// translation files
	useChangeLanguage(locale);

	// Only executed on client
	useEnhancedEffect(() => {
		// re-link sheet container
		// eslint-disable-next-line no-param-reassign
		emotionCache.sheet.container = document.head;
		// re-inject tags
		const { tags } = emotionCache.sheet;
		emotionCache.sheet.flush();
		tags.forEach((tag) => {
			// eslint-disable-next-line no-underscore-dangle, @typescript-eslint/no-explicit-any
			(emotionCache.sheet as any)._insertTag(tag);
		});
		// reset cache to reapply global styles
		clientStyleData.reset();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<html lang={locale} dir={i18n.dir()}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<meta name="theme-color" content={theme.palette.primary.main} />
				{title ? <title>{title}</title> : null}
				<Meta />
				<Links />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
				<link
					rel="stylesheet"
					href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&display=swap"
				/>
				<meta name="emotion-insertion-point" content="emotion-insertion-point" />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
				{/* <LiveReload /> */} {/* ! obsolete if using vite */}
			</body>
		</html>
	);
});

// https://remix.run/docs/en/main/route/component
// https://remix.run/docs/en/main/file-conventions/routes
const App = () => {
	return (
		<Document>
			<MotionLazyContainer>
				<SnackbarProvider>
					<MainLayout>
						<Outlet />
					</MainLayout>
				</SnackbarProvider>
			</MotionLazyContainer>
		</Document>
	);
};

export default App;

// https://remix.run/docs/en/main/route/error-boundary
export const ErrorBoundary = () => {
	const error = useRouteError();

	if (isRouteErrorResponse(error)) {
		let message: ReactNode;

		switch (error.status) {
			case 401: {
				message = <p>Oops! Looks like you tried to visit a page that you do not have access to.</p>;
				break;
			}

			case 404: {
				message = <Error404 />;
				break;
			}

			default: {
				throw new Error(error.data || error.statusText);
			}
		}

		return (
			<Document title={`${error.status} ${error.statusText}`}>
				<CompactLayout>{message}</CompactLayout>
			</Document>
		);
	}

	if (error instanceof Error) {
		return (
			<Document title="Error!">
				<CompactLayout>
					<Error500 />
				</CompactLayout>
			</Document>
		);
	}

	return <h1>Unknown Error</h1>;
};
