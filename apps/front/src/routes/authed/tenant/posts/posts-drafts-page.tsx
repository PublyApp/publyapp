import Typography from '@mui/material/Typography';
import { isServer } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import { data } from 'react-router';

import { APP_NAME } from '@org/shared-ts/lib/constants';

import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/posts-drafts-page';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = capitalize(t('drafts'));

	if (seo) {
		str = `${str} | ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return get(args.loaderData, 'meta', []);
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
