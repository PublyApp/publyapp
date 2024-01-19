import { Suspense } from 'react';

import loadable from '@loadable/component';
// import Button from '@mui/material/Button';
// import type { FallbackProps } from 'react-error-boundary';
import { defer, Navigate, Outlet, useRouteError, type RouteObject } from 'react-router-dom';

// import ErrorBoundary from '@/office/components/ErrorBoundary';
import Home from '@/office/containers/home/Home';
import DashboardLayout from '@/office/layouts/dashboard/DashBoardLayout';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { ClientException } from '@/ui-react/exceptions/ClientException';
import { getPostByIdQuery } from '@/ui-react/lib/react-query/features/posts/post.hooks';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';

import LoadingScreen from '../../components/LoadingScreen';
import RequireAuth from '../../components/RequireAuth';
import SplashScreen from '../../components/SplashScreen';
import FileManager from '../../containers/fileManager/FileManager';
import NotFound from '../../containers/notFound/NotFound';
import NewPost from '../../containers/posts/NewPost';
import PostsList from '../../containers/posts/PostsList';
import { getLastPath, getRouteLoader } from '../utils';

const EditPost = loadable(() => {
	return import('../../containers/posts/EditPost');
});

// const DashboardRootFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
// 	if (error instanceof ClientException) {
// 		if (error.code === ClientException.AUTH_REQUIRED) {
// 			return <Navigate to={BO_PATH_NAMES.auth.login} />;
// 		}
// 	}

// 	return (
// 		<div role="alert">
// 			<h1>Something went wrong!!</h1>
// 			<Button onClick={resetErrorBoundary}>Retry loading</Button>
// 			<pre style={{ color: 'red' }}>{JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}</pre>
// 		</div>
// 	);
// };

// const DashboardPageFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
// 	if (error instanceof Parse.Error) {
// 		if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
// 			return <NotFound />;
// 		}
// 	}

// 	return (
// 		<div role="alert">
// 			<h1>Something went wrong!! (Page)</h1>
// 			<Button onClick={resetErrorBoundary}>Retry loading</Button>
// 			<pre style={{ color: 'red' }}>{JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}</pre>
// 		</div>
// 	);
// };

const DashboardRootError = () => {
	const error = useRouteError();

	if (error instanceof ClientException) {
		if (error.code === ClientException.AUTH_REQUIRED) {
			return <Navigate to={BO_PATH_NAMES.auth.login} />;
		}
	}

	return (
		<div role="alert">
			<h1>Something went wrong!!</h1>
			<pre style={{ color: 'red' }}>{JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}</pre>
		</div>
	);
};

const DashboardPageError = () => {
	const error = useRouteError();

	if (error instanceof Parse.Error) {
		if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
			return <NotFound />;
		}
	}

	return (
		<div role="alert">
			<h1>Something went wrong!! (Page)</h1>
			<pre style={{ color: 'red' }}>{JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}</pre>
		</div>
	);
};

export const dashboardRoutes: RouteObject[] = [
	{
		element: (
			// <ErrorBoundary FallbackComponent={DashboardRootFallback}>
			<Suspense fallback={<SplashScreen />}>
				<RequireAuth>
					<DashboardLayout>
						<Outlet />
					</DashboardLayout>
				</RequireAuth>
			</Suspense>
			// </ErrorBoundary>
		),
		errorElement: <DashboardRootError />,
		children: [
			{
				element: (
					// <ErrorBoundary FallbackComponent={DashboardPageFallback}>
					<Suspense fallback={<LoadingScreen />}>
						<Outlet />
					</Suspense>
					// </ErrorBoundary>
				),
				errorElement: <DashboardPageError />,
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
										loader: getRouteLoader(async ({ params }) => {
											// eslint-disable-next-line @typescript-eslint/naming-convention
											const _getPostByIdQuery = getPostByIdQuery({ id: params.postId ?? '' });
											const cachedPost = defaultQueryClient.getQueryData(_getPostByIdQuery.queryKey);
											const post = cachedPost
												? Promise.resolve(cachedPost)
												: defaultQueryClient.fetchQuery(_getPostByIdQuery);

											return defer({
												post,
											});
										}),
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
		],
	},
];
