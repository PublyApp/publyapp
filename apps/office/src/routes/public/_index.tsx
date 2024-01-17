import { Suspense } from 'react';

import Button from '@mui/material/Button';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Outlet, type RouteObject } from 'react-router-dom';

import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { ClientException } from '@/ui-react/exceptions/ClientException';

import PublicOnly from '../../components/PublicOnly';
import SplashScreen from '../../components/SplashScreen';
import LogIn from '../../containers/logIn/LogIn';
import { getLastPath } from '../utils';

const FallBackComponent = ({ error, resetErrorBoundary }: FallbackProps) => {
	if (error instanceof ClientException) {
		if (error.code === ClientException.AUTH_REQUIRED) {
			return <Outlet />;
		}
	}

	return (
		<div role="alert">
			<h1>Something went wrong!!</h1>
			<Button onClick={resetErrorBoundary}>Retry loading</Button>
			{/* <pre style={{ color: 'red' }}>{error.message}</pre> */}
		</div>
	);
};

export const publicRoutes: RouteObject[] = [
	// auth
	{
		path: getLastPath(BO_PATH_NAMES.auth.root),
		element: (
			<QueryErrorResetBoundary>
				{({ reset }) => {
					return (
						<ErrorBoundary FallbackComponent={FallBackComponent} onReset={reset}>
							<Suspense fallback={<SplashScreen />}>
								<PublicOnly />
							</Suspense>
						</ErrorBoundary>
					);
				}}
			</QueryErrorResetBoundary>
		),
		children: [
			{
				path: getLastPath(BO_PATH_NAMES.auth.login),
				element: <LogIn />,
				index: true,
				// element: null,
			},
			{ path: getLastPath(BO_PATH_NAMES.auth.register), element: <h1>Register form</h1> },
		],
	},
];
