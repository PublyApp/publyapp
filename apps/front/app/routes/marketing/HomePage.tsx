import { css } from '@pigment-css/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { cx } from '@/front/components/tremor/tremor.utils';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

import type { Route } from './+types/HomePage';

export const meta = (_: Route.MetaArgs) => {
	return [{ title: 'New React Router App' }, { name: 'description', content: 'Welcome to React Router!' }];
};

const styles = css({
	'& .test': {
		color: 'red',
	},
});

const HomePage = ({ loaderData: _ }: Route.ComponentProps) => {
	const { t } = useTranslation();

	return (
		<div className={cx(styles)}>
			<h1>{t('hello')}!!</h1>
			<h2 className="test">The product is coming soon!</h2>
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
