import Parse from 'parse';
import { lazy, Suspense } from 'react';

import { Box, Button } from '@mui/material';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { defer, Navigate, Outlet, redirect, useRevalidator, useRouteError, type RouteObject } from 'react-router-dom';

import parseApi from '@devist/api/parse/ParseApi';

import AuthGuard from '@/office/components/AuthGuard';
import ErrorDisplay from '@/office/components/ErrorDisplay';
import LoadingScreen from '@/office/components/LoadingScreen';
import SplashScreen from '@/office/components/SplashScreen';
import Login from '@/office/modules/auth/login/Login';
import { BO_PATH_NAMES, roleSet, SESSION_TOKEN_LOCAL_STORAGE_KEY } from '@/shared/lib/constants';
import { ClientException } from '@/ui-react/exceptions/ClientException';
import { getUserAuthDataQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import { getBlogPostBoEditFormQuery } from '@/ui-react/lib/react-query/features/blogPost/blogPost.actions';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';
import { localStorageUnsetItem } from '@/ui-react/utils/storage.utils';

import { getLastPath, getRouteLoader } from '../utils';

const DashboardLayout = lazy(() => {
	return import('@/office/layouts/dashboard/DashBoardLayout');
});
const Home = lazy(() => {
	return import('@/office/containers/home/Home');
});
const BlogSettings = lazy(() => {
	return import('@/office/modules/blog/settings/BlogSettings');
});
const FileManager = lazy(() => {
	return import('@/office/containers/fileManager/FileManager');
});
const NotFound = lazy(() => {
	return import('@/office/components/NotFound');
});
const NewPost = lazy(() => {
	return import('@/office/modules/blog/new-post/NewPost');
});
const PostsList = lazy(() => {
	return import('@/office/modules/blog/posts-list/PostsList');
});
const EditPost = lazy(() => {
	return import('@/office/modules/blog/edit-post/EditPost');
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

	if (error instanceof ParseRestError) {
		if (error.code === Parse.Error.INVALID_SESSION_TOKEN) {
			localStorageUnsetItem(SESSION_TOKEN_LOCAL_STORAGE_KEY);

			const searchParams = new URLSearchParams({
				[Login.queryParamKeys.redirectCause]: Login.redirectCause.INVALID_SESSION,
			});

			return <Navigate to={`${BO_PATH_NAMES.auth.login}?${searchParams.toString()}`} />;
			// return redirect(BO_PATH_NAMES.auth.login);
		}
	}

	return (
		<Box sx={{ p: 3 }}>
			<ErrorDisplay error={error as never} title="Something went wrong!! (Dash)" />
			<Button
				type="button"
				onClick={() => {
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

			const cachedAuthData = defaultQueryClient.getQueryData(getUserAuthDataQuery.queryKey);

			const authData = cachedAuthData
				? Promise.resolve(cachedAuthData)
				: defaultQueryClient.fetchQuery(getUserAuthDataQuery);

			return defer({
				authData,
			});
		}),
		element: (
			<Suspense fallback={<SplashScreen />}>
				<AuthGuard allowedRoles={roleSet.ABOVE_STAFF_CONTRIBUTOR}>
					<DashboardLayout />
				</AuthGuard>
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
											const getPostByIdQuery = getBlogPostBoEditFormQuery({ id: params.postId ?? '' });

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
									{
										path: getLastPath(BO_PATH_NAMES.dashboard.posts.settings),
										element: <BlogSettings />,
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
