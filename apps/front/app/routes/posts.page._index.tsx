import { redirect, type LoaderFunction } from '@remix-run/node';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

export const loader: LoaderFunction = async () => {
	return redirect(FRONT_PATH_NAMES.posts.page(1), 301);
};

const Page = () => {
	return null;
};

export default Page;
