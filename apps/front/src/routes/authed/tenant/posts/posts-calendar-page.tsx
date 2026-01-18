import Typography from '@mui/material/Typography';
import { isServer } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';

import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME } from '@/shared/lib/constants';

import type { Route } from './+types/posts-calendar-page';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('posts-calendar'));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [{ title: getPageTitle(t, true) }];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [{ title: getPageTitle(t, true) }],
		});
	},
});

const PostsCalendarPage = () => {
	return <Typography variant="h1">PostsCalendarPage</Typography>;
};

export default PostsCalendarPage;
