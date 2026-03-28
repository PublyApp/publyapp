import { isServer } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';

import { APP_NAME } from '@org/shared-ts/lib/constants';
import { View403 } from '#app/components/error/403-view.tsx';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/unauthorized-page';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('unauthorized'));

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

const UnauthorizedPage = () => {
	return <View403 />;
};

export default UnauthorizedPage;
