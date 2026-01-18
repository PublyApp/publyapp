import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import type { FC } from 'react';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import View400 from '@/front/components/error/400-view';
import { View500 } from '@/front/components/error/500-view';
import QueryDisplay from '@/front/components/query-display';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { useGetStaffUserById } from '@/front/lib/react-query/features/staff/staff-user.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@/shared/lib/constants';
import { logger } from '@/shared/lib/logger/iso-logger';

import { UserNewEditFormSkeleton } from '../components/user-new-edit-form-skeleton';
import type { Route } from './+types/staff-user-details-page';
import StaffUserUpdateForm, {
	type StaffUserUpdateData,
} from './components/staff-user-update-form';

// import { UserNewEditForm } from '../components/user-new-edit-form';
// import ParseRestError from 'packages/parse-rest-client/ParseRestError';
// import { NotFoundView } from '@/front/components/error/not-found-view';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('edit-item', { item: _.toLower(t('staff-user')) }),
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

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

export const clientLoader = async ({
	serverLoader,
}: Route.ClientLoaderArgs) => {
	i18next.loadNamespaces([I18N_NAMESPACES.ZOD]).catch((error) => {
		logger.error('Failed to load namespaces', error);
	});
	const serverData = await serverLoader();
	return data(serverData);
};
clientLoader.hydrate = true as const;

const StaffUserDetailsPage = () => {
	const { t } = useTranslate();
	const { userId } = useParams();
	const getByIdQuery = useGetStaffUserById({
		variables: { userId: userId ?? '' },
		enabled: !!userId,
	});

	if (!userId) {
		return <View400 title="Bad Request" description="User ID is required" />;
	}

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('staff-users')),
						href: FRONT_PATH_NAMES.staff.staffUsers.root,
					},
					{ name: _.capitalize(t('details')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<QueryDisplay
				query={getByIdQuery}
				LoadingSlot={<UserNewEditFormSkeleton />}
				ErrorSlot={ErrorView}
			>
				{({ data }) => {
					const currentUser: StaffUserUpdateData = {
						id: _.toString(data?.id),
						firstName: data?.firstName ?? undefined,
						lastName: data?.lastName ?? undefined,
						email: data?.email ?? undefined,
						avatar: data?.avatarUrl ?? undefined,
						accountLevel: data?.accountLevel ?? undefined,
						status: data?.status ?? undefined,
					};
					return <StaffUserUpdateForm currentUser={currentUser} />;
				}}
			</QueryDisplay>
		</DashboardContent>
	);
};

export default StaffUserDetailsPage;

const ErrorView: FC<{ error: unknown }> = ({ error }) => {
	logger.debug('ErrorView', { error });
	// const { t } = useTranslate();

	// if (error instanceof ParseRestError) {
	// 	if (error.code === X_CODE.USER_NOT_FOUND) {
	// 		return (
	// 			<NotFoundView
	// 				withLayout={false}
	// 				title={t('item-not-found', { item: t('user') })}
	// 				description={t('user-not-found-description')}
	// 			/>
	// 		);
	// 	}

	// 	if (_.toString(error.httpStatusCode).startsWith('4')) {
	// 		return <View400 withLayout={false} />;
	// 	}
	// }

	return <View500 withLayout={false} />;
};
