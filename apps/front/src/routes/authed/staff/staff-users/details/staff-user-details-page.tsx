import Box from '@mui/material/Box';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import type { FC } from 'react';
import { data, useParams } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import View400 from '#app/components/error/400-view.tsx';
import { NotFoundView } from '#app/components/error/not-found-view.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useGetStaffUserById } from '#app/lib/react-query/features/staff/staff-user.hooks.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import { UserNewEditFormSkeleton } from '../components/user-new-edit-form-skeleton';
import type { Route } from './+types/staff-user-details-page';
import StaffUserUpdateForm, {
	type StaffUserUpdateData,
} from './components/staff-user-update-form';

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
		<QueryDisplay
			query={getByIdQuery}
			LoadingSlot={
				<DashboardContent
					sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
					compact
					maxWidth="lg"
				>
					<UserNewEditFormSkeleton />
				</DashboardContent>
			}
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
						<StaffUserUpdateForm currentUser={currentUser} />
					</DashboardContent>
				);
			}}
		</QueryDisplay>
	);
};

export default StaffUserDetailsPage;

const ErrorView: FC<{ error: unknown }> = ({ error }) => {
	const { t } = useTranslate();

	const failure = toApiFailure(error);

	if (
		isProblemFailure(failure) &&
		(failure.status === 404 ||
			(failure.status === 400 && failure.translationKey === 'malformed-id'))
	) {
		return (
			<NotFoundView
				withLayout={false}
				title={_.capitalize(t('staff-user-not-found-title'))}
				description={t('staff-user-not-found-description')}
			/>
		);
	}

	return (
		<Box sx={{ py: 10 }}>
			<ErrorContent
				title={t('staff-user-details-error-title')}
				description={t('staff-user-details-error-description')}
			/>
		</Box>
	);
};
