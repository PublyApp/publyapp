import Typography from '@mui/material/Typography';
import { isServer } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';

import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME } from '@org/shared-ts/lib/constants';

import type { Route } from './+types/posts-drafts-page';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('drafts'));

	if (seo) {
		str = `${str} | ${APP_NAME}`;
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

const PostsDraftsPage = () => {
	return (
		<DashboardContent>
			<Typography variant="h1">TODO: Posts Drafts 🌤️🌤️🌤️</Typography>
		</DashboardContent>
	);
};

export default PostsDraftsPage;
