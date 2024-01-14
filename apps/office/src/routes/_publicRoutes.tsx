import { Suspense } from 'react';

import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Navigate, type RouteObject } from 'react-router-dom';

import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { AUTH_REQUIRED_ERROR_MSG } from '@/ui-react/lib/react-query/features/auth/auth.actions';

import PublicOnly from '../components/PublicOnly';
import LogIn from '../containers/logIn/LogIn';
import usePathname from '../hooks/usePathname';

import { getLastPath } from './utils';

const FallBackComponent = ({ error, resetErrorBoundary }: FallbackProps) => {
	// Call resetErrorBoundary() to reset the error boundary and retry the render.
	const pathname = usePathname();

	if (error.message === AUTH_REQUIRED_ERROR_MSG) {
		if (pathname !== BO_PATH_NAMES.auth.login) {
			resetErrorBoundary();
			return <Navigate to={BO_PATH_NAMES.auth.login} />;
		}

		// resetErrorBoundary();
		return <LogIn />;
	}

	return (
		<div role="alert">
			<h1>Something went wrong!!</h1>
			{/* <p>Something went wrong:</p> */}
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
							<Suspense fallback={<h1>Public Suspense</h1>}>
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
				// element: null,
			},
			{ path: 'random', element: <h1>Random Test</h1> },
		],
	},
];
