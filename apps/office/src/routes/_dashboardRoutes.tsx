import loadable from '@loadable/component';
import { type RouteObject } from 'react-router-dom';

import Home from '@/office/containers/home/Home';
import DashboardLayout from '@/office/layouts/dashboard/DashBoardLayout';
import { BO_PATH_NAMES } from '@/shared/lib/constants';

import RequireAuth from '../components/RequireAuth';
import FileManager from '../containers/fileManager/FileManager';
import NotFound from '../containers/notFound/NotFound';
import NewPost from '../containers/posts/NewPost';
import PostsList from '../containers/posts/PostsList';

import { getLastPath } from './utils';

const EditPost = loadable(() => {
	return import('../containers/posts/EditPost');
});

export const dashboardRoutes: RouteObject[] = [
	{
		element: (
			<RequireAuth>
				<DashboardLayout />
			</RequireAuth>
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
