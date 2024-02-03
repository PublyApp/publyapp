import { useContext, type ReactNode } from 'react';

import { withEmotionCache } from '@emotion/react';
import { unstable_useEnhancedEffect as useEnhancedEffect, useTheme } from '@mui/material';
import {
	isRouteErrorResponse,
	Links,
	LiveReload,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useRouteError,
} from '@remix-run/react';

import MotionLazyContainer from '@devist/ui-react/components/MotionLazyContainer';
import SnackbarProvider from '@devist/ui-react/providers/SnackbarProvider';

import Error404 from './components/Error404';
import Error500 from './components/Error500';
import ClientStyleContext from './contexts/ClientStyleContext';
import CompactLayout from './layouts/compact/CompactLayout';
import MainLayout from './layouts/main/MainLayout';

// import { initParse } from './lib/parse/legacy';

interface DocumentProps {
	children: React.ReactNode;
	title?: string;
}

// initParse();

const Document = withEmotionCache(({ children, title }: DocumentProps, emotionCache) => {
	const clientStyleData = useContext(ClientStyleContext);
	const theme = useTheme();

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
		<html lang="en">
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
				<LiveReload />
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
