import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/new-staff-invitations-page';
import NewStaffInvitationsForm from './parts/new-staff-invitations-form';

const getPageTitle = (t: TFunction, seo?: true) => {
	let str: string = _.capitalize(
		t('new-item', { item: _.toLower(t('staff-invitations')) }),
	);

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

const NewStaffInvitationPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				maxWidth: '800px',
			}}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-invitations')),
						href: FRONT_PATH_NAMES.staff.invitations.root,
					},
					{ name: _.capitalize(t('new')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
			<NewStaffInvitationsForm />
		</DashboardContent>
	);
};

export default NewStaffInvitationPage;
