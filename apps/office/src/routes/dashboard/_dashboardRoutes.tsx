import { Suspense } from 'react';

import loadable from '@loadable/component';
import { Box, Button } from '@mui/material';
import { defer, Navigate, Outlet, redirect, useRevalidator, useRouteError, type RouteObject } from 'react-router-dom';

// import clients from '@/office/api/clients';
import Home from '@/office/containers/home/Home';
import DashboardLayout from '@/office/layouts/dashboard/DashBoardLayout';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import parseApi from '@/ui-react/api/parse/ParseApi';
import { ClientException } from '@/ui-react/exceptions/ClientException';
import AuthActions from '@/ui-react/lib/react-query/features/auth/auth.actions';
import PostActions from '@/ui-react/lib/react-query/features/posts/post.actions';
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

const DashboardRootError = () => {
	const error = useRouteError();
	const { revalidate, state } = useRevalidator();

	if (state === 'loading') {
		return <SplashScreen />;
	}

	if (error instanceof ClientException) {
		if (error.code === ClientException.AUTH_REQUIRED) {
			return <Navigate to={BO_PATH_NAMES.auth.login} />;
		}
	}

	// if (error instanceof Parse.Error) {
	// 	if (error.code === Parse.Error.INVALID_SESSION_TOKEN) {
	// 		if (Parse.User.current()) {
	// 			Parse.User.logOut();
	// 		}

	// 		return <Navigate to={BO_PATH_NAMES.auth.login} />;
	// 	}
	// }

	return (
		<Box role="alert" sx={{ px: 3 }}>
			<h1>Something went wrong!! (Dash)</h1>
			<pre
				css={{
					color: 'red',
					maxWidth: '100%',
					background: '#f7f7f7',
					overflowX: 'auto',
					margin: '0 auto',
					borderRadius: '6px',
					padding: '12px',
					marginBottom: '12px',
				}}
			>
				{JSON.stringify(error, Object.getOwnPropertyNames(error), 2).replaceAll('\\n', '\n\t\t')}
			</pre>
			<Button
				type="button"
				onClick={() => {
					// defaultQueryClient.invalidateQueries(getClientAuthQuery.queryKey);
					revalidate();
				}}
				sx={(theme) => {
					return { margin: '0 auto', background: theme.palette.common.black };
				}}
				variant="contained"
			>
				retry
			</Button>
		</Box>
	);
};

const DashboardPageError = () => {
	const error = useRouteError();

	// if (error instanceof Parse.Error) {
	// 	if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
	// 		return <NotFound />;
	// 	}
	// }

	// console.trace(error);

	return (
		<div role="alert">
			<h1>Something went wrong!! (Page)</h1>
			<pre style={{ color: 'red' }}>
				{JSON.stringify(error, Object.getOwnPropertyNames(error), 2).replaceAll('\\n', '\n\t\t')}
			</pre>
		</div>
	);
};

export const dashboardRoutes: RouteObject[] = [
	{
		loader: getRouteLoader(async () => {
			if (!parseApi.parseRestClient.getSessionToken()) {
				return redirect(BO_PATH_NAMES.auth.login);
			}

			const authActions = new AuthActions(parseApi);
			const cachedAuthData = defaultQueryClient.getQueryData(authActions.getUserAuthDataQuery.queryKey);

			const authData = cachedAuthData
				? Promise.resolve(cachedAuthData)
				: defaultQueryClient.fetchQuery(authActions.getUserAuthDataQuery);

			return defer({
				authData,
			});
		}),
		element: (
			<Suspense fallback={<SplashScreen />}>
				<RequireAuth>
					<DashboardLayout>
						<Outlet />
					</DashboardLayout>
				</RequireAuth>
			</Suspense>
		),
		errorElement: <DashboardRootError />,
		children: [
			{
				element: (
					<Suspense fallback={<LoadingScreen />}>
						<Outlet />
					</Suspense>
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
									},
									{
										path: getLastPath(BO_PATH_NAMES.dashboard.posts.edit(':postId'), 2),
										loader: getRouteLoader(async ({ params }) => {
											const postActions = new PostActions(parseApi);
											const getPostByIdQuery = postActions.getPostByIdQuery({ id: params.postId ?? '' });

											const cachedPost = defaultQueryClient.getQueryData(getPostByIdQuery.queryKey);

											const post = cachedPost
												? Promise.resolve(cachedPost)
												: defaultQueryClient.fetchQuery(getPostByIdQuery);

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
