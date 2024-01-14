import { Suspense } from 'react';

import loadable from '@loadable/component';
import Button from '@mui/material/Button';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';

import Home from '@/office/containers/home/Home';
import DashboardLayout from '@/office/layouts/dashboard/DashBoardLayout';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { AUTH_REQUIRED_ERROR_MSG } from '@/ui-react/lib/react-query/features/auth/auth.actions';

import LoadingScreen from '../components/LoadingScreen';
import RequireAuth from '../components/RequireAuth';
import SplashScreen from '../components/SplashScreen';
import FileManager from '../containers/fileManager/FileManager';
import NotFound from '../containers/notFound/NotFound';
import NewPost from '../containers/posts/NewPost';
import PostsList from '../containers/posts/PostsList';

import { getLastPath } from './utils';

const EditPost = loadable(() => {
	return import('../containers/posts/EditPost');
});

const FallBackComponent = ({ error, resetErrorBoundary }: FallbackProps) => {
	if (error.message === AUTH_REQUIRED_ERROR_MSG) {
		return <Navigate to={BO_PATH_NAMES.auth.login} />;
	}

	return (
		<div role="alert">
			<h1>Something went wrong!!</h1>
			<Button onClick={resetErrorBoundary}>Retry loading</Button>
			{/* <pre style={{ color: 'red' }}>{error.message}</pre> */}
		</div>
	);
};

export const dashboardRoutes: RouteObject[] = [
	{
		element: (
			<QueryErrorResetBoundary>
				{({ reset }) => {
					return (
						<ErrorBoundary FallbackComponent={FallBackComponent} onReset={reset}>
							<Suspense fallback={<SplashScreen />}>
								<RequireAuth>
									<DashboardLayout>
										<Suspense fallback={<LoadingScreen />}>
											<Outlet />
										</Suspense>
									</DashboardLayout>
								</RequireAuth>
							</Suspense>
						</ErrorBoundary>
					);
				}}
			</QueryErrorResetBoundary>
		),
		// loader: async (/* { params, request, context } */) => {
		// 	try {
		// 		console.log('😋😋😋😋');
		// 		const cachedAuthData = defaultQueryClient.getQueryData([getClientAuthQueryKeyBase]);

		// 		if (!cachedAuthData) {
		// 			const authData = await getClientAuthAction();
		// 			defaultQueryClient.setQueryData([getClientAuthQueryKeyBase], authData);
		// 		}

		// 		return null;
		// 	} catch (error) {
		// 		if (error instanceof Error) {
		// 			if (error.message === AUTH_REQUIRED_ERROR_MSG) {
		// 				redirect(BO_PATH_NAMES.auth.login);
		// 			}
		// 		}

		// 		return Promise.reject(error);
		// 		// redirect(); redirect to page 500
		// 	}
		// },
		children: [
			{
				path: getLastPath(BO_PATH_NAMES.dashboard.root),
				children: [
					{
						element: <Home />,
						index: true,
					},
					// posts
					{
						path: getLastPath(BO_PATH_NAMES.dashboard.posts.root),
						children: [
							{
								element: <PostsList />,
								index: true,
							},
							{
								path: getLastPath(BO_PATH_NAMES.dashboard.posts.create),
								element: <NewPost />,
								// element: <h1>This is temporary</h1>,
							},
							{
								path: getLastPath(BO_PATH_NAMES.dashboard.posts.edit(':postId'), 2),
								element: <EditPost />,
							},
						],
					},
					// file manager
					{
						path: getLastPath(BO_PATH_NAMES.dashboard.fileManager.root),
						element: <FileManager />,
					},
				],
			},

			// any other path will require auth too
			// if authenticated, a 404 pag will be rendered
			{
				path: '*',
				element: <NotFound />,
			},
		],
	},
];
