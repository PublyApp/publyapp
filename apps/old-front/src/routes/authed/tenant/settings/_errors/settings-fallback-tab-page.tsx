import { redirect } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { Route } from './+types/settings-fallback-tab-page';

export const clientLoader = ({ params, url }: Route.ClientLoaderArgs) => {
	const nextUrl = new URL(url);
	nextUrl.pathname = FRONT_PATH_NAMES.tenant(params.tenantId).settings.root;

	return redirect(nextUrl.toString());
};

const SettingsNotFoundPage = () => {
	return null;
};

export default SettingsNotFoundPage;
