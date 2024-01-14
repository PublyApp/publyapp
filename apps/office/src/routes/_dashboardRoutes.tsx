import { Suspense } from 'react';

import loadable from '@loadable/component';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Navigate, type RouteObject } from 'react-router-dom';

import Home from '@/office/containers/home/Home';
import DashboardLayout from '@/office/layouts/dashboard/DashBoardLayout';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { AUTH_REQUIRED_ERROR_MSG } from '@/ui-react/lib/react-query/features/auth/auth.actions';

import RequireAuth from '../components/RequireAuth';
import FileManager from '../containers/fileManager/FileManager';
import NotFound from '../containers/notFound/NotFound';
import NewPost from '../containers/posts/NewPost';
import PostsList from '../containers/posts/PostsList';

import { getLastPath } from './utils';

const EditPost = loadable(() => {
	return import('../containers/posts/EditPost');
});

const FallBackComponent = ({ error /* , resetErrorBoundary */ }: FallbackProps) => {
	if (error.message === AUTH_REQUIRED_ERROR_MSG) {
		return <Navigate to={BO_PATH_NAMES.auth.login} />;
	}

	return (
		<div role="alert">
			<h1>Something went wrong!!</h1>
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
							<Suspense fallback={<h1>Dashboard Suspense</h1>}>
								<RequireAuth>
									<DashboardLayout />
								</RequireAuth>
							</Suspense>
						</ErrorBoundary>
					);
				}}
			</QueryErrorResetBoundary>
		),
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
								element: <EditPost fallback={<h1>😎😎😎😎</h1>} />,
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
