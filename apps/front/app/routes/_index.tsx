import { redirect, type LoaderFunction } from '@remix-run/node';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

import { getServerLoader } from '../lib/remix/getServerLoader';

export const loader: LoaderFunction = getServerLoader(async ({ _locale }) => {
	const prefix = _locale ? `/${_locale}` : '';
	return redirect(prefix + FRONT_PATH_NAMES.posts.page(1), 301);
});

const Page = () => {
	return null;
};

export default Page;
