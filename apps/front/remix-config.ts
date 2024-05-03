/* eslint-disable import/no-extraneous-dependencies */
import path from 'path';

import { glob } from 'glob';
import { ensureRootRouteExists, getRouteIds, getRouteManifest } from 'remix-custom-routes';

export const routes = async () => {
	const appDirectory = path.join(process.cwd(), 'app');
	ensureRootRouteExists(appDirectory);
	const files = glob.sync('routes/*.{js,jsx,ts,tsx,md,mdx}', {
		cwd: appDirectory,
	});
	const routeIds = getRouteIds(files, {
		indexNames: ['index', 'route', '_index', '_route'],
	}).map(([id, filePath]) => {
		return [`($lang).${id}`, filePath];
	}) as [string, string][];

	return getRouteManifest(routeIds);
};
