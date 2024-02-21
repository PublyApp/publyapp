import _ from 'lodash';
import { type RouteObject } from 'react-router-dom';

import { initParse } from '../lib/parse/legacy';

export const getLastPath = (path: string, n = 1) => {
	const last = _.takeRight(path.split('/'), n).join('/');
	return last;
};

export const getRouteLoader = (loader: RouteObject['loader']): RouteObject['loader'] => {
	return async (args) => {
		initParse();
		return loader?.(args);
	};
};
