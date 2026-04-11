import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import toStr from 'lodash/toString';
import { useMemo } from 'react';
import { data, useParams } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';

import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import View400 from '#app/components/error/400-view.tsx';
import { NotFoundView } from '#app/components/error/not-found-view.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import type { SettingsNavItem } from '#app/components/settings/settings-nav.tsx';
import { SidebarSettingsLayout } from '#app/components/settings/sidebar-settings-layout.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useGetStaffProfileById } from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/staff-profile-details-layout';

export type StaffProfileDetailsOutletContext = {
	profileId: string;
	profileName: string;
};

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = capitalize(t('profile-details'));

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

const StaffProfileDetailsLayout = () => {
	const { t } = useTranslate();
	const { profileId } = useParams();

	const getProfileQuery = useGetStaffProfileById({
		variables: { profileId: toStr(profileId) },
		enabled: !!profileId,
	});

	const navItems: SettingsNavItem[] = useMemo(() => {
		const profileDetailPaths =
			FRONT_PATH_NAMES.staff.profiles.details(profileId);

		return [
			{
				label: t('basics-and-permissions'),
				href: profileDetailPaths.tabs.basicsAndPermissions,
			},
			{
				label: t('users'),
				href: profileDetailPaths.tabs.users,
				deep: true,
			},
		];
	}, [t, profileId]);

	if (!profileId) {
		return <View400 title="Bad Request" description="Profile ID is required" />;
	}

	return (
		<QueryDisplay
			query={getProfileQuery}
			LoadingSlot={<StaffProfileDetailsLayoutSkeleton />}
			ErrorSlot={({ error }) => <LayoutErrorView error={error} />}
		>
			{({ data }) => {
				// Defensive: the generated client marks nested payloads as optional.
				// Treat a missing profile payload as not-found at the UI level.
				if (!data.profile) {
					return (
						<NotFoundView
							withLayout={false}
							title={capitalize(t('not-found'))}
							description={t('please-try-again-or-contact-support')}
						/>
					);
				}

				return (
					<SidebarSettingsLayout
						items={navItems}
						maxWidth="lg"
						breadcrumbs={null}
						outletContext={
							{
								profileId: toStr(profileId),
								profileName: data.profile.name ?? t('un-named'),
							} satisfies StaffProfileDetailsOutletContext
						}
					/>
				);
			}}
		</QueryDisplay>
	);
};

export default StaffProfileDetailsLayout;

const StaffProfileDetailsLayoutSkeleton = () => (
	<DashboardContent maxWidth="lg" compact>
		<Box
			sx={{
				display: 'flex',
				gap: 4,
				flexDirection: { xs: 'column', md: 'row' },
			}}
		>
			<Box
				sx={{
					display: { xs: 'none', md: 'block' },
					flexShrink: 0,
					width: 200,
				}}
			>
				<Box sx={{ display: 'grid', gap: 0.75 }}>
					<Skeleton variant="rounded" height={36} />
					<Skeleton variant="rounded" height={36} />
				</Box>
			</Box>

			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Skeleton variant="text" width={220} height={32} sx={{ mb: 2 }} />
				<Skeleton variant="rounded" height={260} sx={{ borderRadius: 2 }} />
			</Box>
		</Box>
	</DashboardContent>
);

const LayoutErrorView = ({ error }: { error: unknown }) => {
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
				title={capitalize(t('not-found'))}
				description={t('please-try-again-or-contact-support')}
			/>
		);
	}

	return (
		<DashboardContent maxWidth="lg" compact>
			<Box sx={{ py: 10 }}>
				<ErrorContent
					title={t('something-went-wrong')}
					description={t('error-500-description')}
				/>
			</Box>
		</DashboardContent>
	);
};
