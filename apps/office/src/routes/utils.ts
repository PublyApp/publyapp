import _ from 'lodash';
import type { LoaderFunction } from 'react-router-dom';

import { initParse } from '../lib/parse/client';

// import { initParse } from '../lib/parse/legacy';

export const getLastPath = (path: string, n = 1) => {
	const last = _.takeRight(path.split('/'), n).join('/');
	return last;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getRouteLoader = <Context = any>(loader: LoaderFunction<Context>): LoaderFunction<Context> => {
	return async (args) => {
		initParse();
		return loader?.(args);
	};
};
