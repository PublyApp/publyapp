import { type RouteObject } from 'react-router-dom';

import { BO_PATH_NAMES } from '@/shared/lib/constants';

import PublicOnly from '../components/PublicOnly';
import LogIn from '../containers/logIn/LogIn';

import { getLastPath } from './utils';

export const publicRoutes: RouteObject[] = [
	// auth
	{
		path: getLastPath(BO_PATH_NAMES.auth.root),
		element: <PublicOnly />,
		children: [
			{
				path: getLastPath(BO_PATH_NAMES.auth.login),
				element: <LogIn />,
			},
		],
	},
];
