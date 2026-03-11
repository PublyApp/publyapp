import { redirect } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { Route } from './+types/account-fallback-tab-page';

export const clientLoader = (args: Route.ClientLoaderArgs) => {
	const url = new URL(args.request.url);
	url.pathname = FRONT_PATH_NAMES.tenant(args.params.tenantId).account.root;

	return redirect(url.toString());
};

const AccountNotFoundPage = () => {
	return null;
};

export default AccountNotFoundPage;
