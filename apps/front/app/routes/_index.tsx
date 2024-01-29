import { redirect, type LoaderFunction } from '@remix-run/node';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

// example of how to use env variables
const a = import.meta.env.VITE_TEST_ENV;
console.log('🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀', a);

export const loader: LoaderFunction = async () => {
	return redirect(FRONT_PATH_NAMES.posts.page(1), 301);
};

const Page = () => {
	return null;
};

export default Page;
