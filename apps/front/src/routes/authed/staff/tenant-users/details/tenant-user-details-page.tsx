import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import toLower from 'lodash/toLower';
import type { FC } from 'react';
import { data, useParams } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	I18N_NAMESPACES,
	isServer,
} from '@org/shared-ts/lib/constants';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import View400 from '#app/components/error/400-view.tsx';
import { NotFoundView } from '#app/components/error/not-found-view.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useGetTenantUserById } from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/tenant-user-details-page';
import { TenantUserDetailsPageSkeleton } from './_components/tenant-user-details-page-skeleton';
import TenantUserCompaniesTable from './_parts/tenant-user-companies-table';
import TenantUserUpdateForm, {
	type TenantUserUpdateData,
} from './_parts/tenant-user-update-form';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = capitalize(
		t('edit-item', { item: toLower(t('tenant-user')) }),
	);

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return get(args.loaderData, 'meta', []);
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

const TenantUserDetailsPage = () => {
	const { t } = useTranslate();
	const { userId } = useParams();
	const getTenantUserQuery = useGetTenantUserById({
		variables: { userId: userId ?? '' },
		enabled: !!userId,
	});

	if (!userId) {
		return <View400 title="Bad Request" description="User ID is required" />;
	}

	return (
		<QueryDisplay
			query={getTenantUserQuery}
			LoadingSlot={<TenantUserDetailsPageSkeleton />}
			ErrorSlot={ErrorView}
		>
			{({ data }) => {
				const fullName = getUserFullName(data);
				const title = fullName || data?.email || t('un-named');

				const currentUser: TenantUserUpdateData = {
					firstName: data?.firstName ?? undefined,
					lastName: data?.lastName ?? undefined,
					email: data?.email ?? undefined,
					avatar: data?.avatarUrl ?? undefined,
					status: data?.status ?? undefined,
					companyCount: data?.companyCount ?? 0,
					createdAt: data?.createdAt ?? undefined,
					updatedAt: data?.updatedAt ?? undefined,
				};

				return (
					<DashboardContent
						sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
						maxWidth="md"
						compact
					>
						<CustomBreadcrumbs
							heading={title}
							links={[
								{
									name: capitalize(t('tenants')),
									href: FRONT_PATH_NAMES.staff.tenants.root,
								},
								{ name: capitalize(t('tenant-users')) },
								{ name: capitalize(t('details')) },
							]}
							sx={{ mb: { xs: 3, md: 5 } }}
						/>

						<Stack
							spacing={3}
							sx={{
								flexGrow: 1,
								minHeight: 0,
								display: 'flex',
								flexDirection: 'column',
							}}
						>
							<TenantUserUpdateForm currentUser={currentUser} />
							<TenantUserCompaniesTable />
						</Stack>
					</DashboardContent>
				);
			}}
		</QueryDisplay>
	);
};

export default TenantUserDetailsPage;

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
				title={capitalize(t('tenant-user-not-found-title'))}
				description={t('tenant-user-not-found-description')}
			/>
		);
	}

	return (
		<Box sx={{ py: 10 }}>
			<ErrorContent
				title={t('tenant-user-details-error-title')}
				description={t('tenant-user-details-error-description')}
			/>
		</Box>
	);
};
