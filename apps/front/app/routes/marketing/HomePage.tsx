import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

import type { Route } from './+types/HomePage';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

const HomePage = ({ loaderData: _ }: Route.ComponentProps) => {
	const { t } = useTranslation();
	return (
		<div>
			<h1>{t('hello')}!!</h1>
			<h2>The product is coming soon!</h2>
			<Link to={{ pathname: FRONT_PATH_NAMES.auth.login }} className="text-blue-500 underline">
				Log in
			</Link>
			<br />
			<Link to={{ pathname: FRONT_PATH_NAMES.staff.root }} className="text-blue-500 underline">
				Go to staff dashboard
			</Link>
		</div>
	);
};

export default HomePage;
