import _ from 'lodash';
import { type RouteObject } from 'react-router-dom';

import { initParse } from '../lib/parse';

export const getLastPath = (path: string, n = 1) => {
	const last = _.takeRight(path.split('/'), n).join('/');
	// const splittedPath = path.split('/');
	// const last= splittedPath.slice()

	return last;
};

export const getRouteLoader = (loader: RouteObject['loader']): RouteObject['loader'] => {
	initParse();

	return loader;
};
