import { Suspense } from 'react';

// import Button from '@mui/material/Button';
// import { type FallbackProps } from 'react-error-boundary';
import { useNavigation /* Outlet, */, useRouteError, type RouteObject } from 'react-router-dom';

// import ErrorBoundary from '@/office/components/ErrorBoundary';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { ClientException } from '@/ui-react/exceptions/ClientException';

import PublicOnly from '../../components/PublicOnly';
import SplashScreen from '../../components/SplashScreen';
import LogIn from '../../containers/logIn/LogIn';
import { getLastPath } from '../utils';

// const PublicRootFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
// 	if (error instanceof ClientException) {
// 		if (error.code === ClientException.AUTH_REQUIRED) {
// 			return <Outlet />;
// 		}
// 	}

// 	return (
// 		<div role="alert">
// 			<h1>Something went wrong!!</h1>
// 			<Button onClick={resetErrorBoundary}>Retry loading</Button>
// 			{/* <pre style={{ color: 'red' }}>{error.message}</pre> */}
// 		</div>
// 	);
// };

const PublicRootError = () => {
	const error = useRouteError();
	const navigation = useNavigation();

	if (navigation.state === 'loading') {
		return <SplashScreen />;
	}

	if (error instanceof ClientException) {
		if (error.code === ClientException.AUTH_REQUIRED) {
			// return <Outlet />;
			// return <Navigate to={BO_PATH_NAMES.auth.login} />;
			return <LogIn />;
		}
	}

	return (
		<div role="alert">
			<h1>Something went wrong!!</h1>
			{/* <pre style={{ color: 'red' }}>{error.message}</pre> */}
		</div>
	);
};

export const publicRoutes: RouteObject[] = [
	// auth
	{
		path: getLastPath(BO_PATH_NAMES.auth.root),
		element: (
			// <ErrorBoundary FallbackComponent={PublicRootFallback}>
			<Suspense fallback={<SplashScreen />}>
				<PublicOnly />
			</Suspense>
			// </ErrorBoundary>
		),
		errorElement: <PublicRootError />,
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
