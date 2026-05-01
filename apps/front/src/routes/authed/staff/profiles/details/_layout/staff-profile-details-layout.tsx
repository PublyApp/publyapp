import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import toStr from 'lodash/toString';
import { removeLastSlash } from 'minimal-shared/utils';
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
import { usePathname } from '#app/hooks/use-pathname.ts';
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
	const pathname = usePathname();
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

	const activeTab = useMemo(() => {
		const value = removeLastSlash(pathname);
		const profileDetailPaths =
			FRONT_PATH_NAMES.staff.profiles.details(profileId);
		return value === profileDetailPaths.tabs.users ? 'users' : 'basics';
	}, [pathname, profileId]);

	if (!profileId) {
		return <View400 title="Bad Request" description="Profile ID is required" />;
	}

	return (
		<QueryDisplay
			query={getProfileQuery}
			LoadingSlot={<StaffProfileDetailsLayoutSkeleton tab={activeTab} />}
			ErrorSlot={LayoutErrorView}
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

const StaffProfileDetailsLayoutSkeleton = ({
	tab,
}: {
	tab: 'basics' | 'users';
}) => (
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
				{/* Breadcrumbs are rendered inside the tab pages; still show a representative header skeleton here. */}
				<Box sx={{ mb: { xs: 3, md: 5 } }}>
					<Skeleton variant="text" width="44%" height={38} />
					<Skeleton variant="text" width="58%" height={18} />
				</Box>

				{tab === 'basics' ? <BasicsTabSkeleton /> : <UsersTabSkeleton />}
			</Box>
		</Box>
	</DashboardContent>
);

const BasicsTabSkeleton = () => (
	<Box
		sx={{
			display: 'grid',
			gap: 3,
			alignItems: 'start',
			gridTemplateColumns: {
				xs: '1fr',
				lg: 'minmax(0, 1fr) 280px',
			},
		}}
	>
		{/* Main content (basic infos + permissions) */}
		<Box sx={{ display: 'grid', gap: 3 }}>
			<Skeleton variant="rounded" height={220} sx={{ borderRadius: 2 }} />
			<Skeleton variant="rounded" height={440} sx={{ borderRadius: 2 }} />
		</Box>

		{/* Right ToC rail hint (no card aesthetic on lg+) */}
		<Box sx={{ display: { xs: 'none', lg: 'block' } }}>
			<Skeleton variant="text" width={120} height={18} sx={{ mb: 1 }} />
			<Box
				sx={{
					borderLeft: 1,
					borderColor: 'divider',
					pl: 1.5,
					display: 'grid',
					gap: 1,
				}}
			>
				<Skeleton variant="text" width="82%" height={18} />
				<Skeleton variant="text" width="92%" height={18} />
				<Skeleton variant="text" width="74%" height={18} />
				<Skeleton variant="text" width="88%" height={18} />
				<Skeleton variant="text" width="70%" height={18} />
			</Box>
		</Box>
	</Box>
);

const UsersTabSkeleton = () => (
	<Box>
		{/* CTA placeholder (Assign user) */}
		<Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
			<Skeleton variant="rounded" width={148} height={36} />
		</Box>

		{/* Table header */}
		<Skeleton variant="rounded" height={52} sx={{ borderRadius: 2, mb: 1 }} />

		{/* Table rows */}
		{Array.from({ length: 6 }).map((_, idx) => (
			<Box
				// oxlint-disable-next-line react/no-array-index-key -- skeleton rows are static placeholders with no item identity
				key={idx}
				sx={{
					display: 'grid',
					gridTemplateColumns: '1fr 120px 88px',
					gap: 2,
					alignItems: 'center',
					py: 1.25,
					borderBottom: 1,
					borderColor: 'divider',
				}}
			>
				<Box
					sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}
				>
					<Skeleton variant="circular" width={40} height={40} />
					<Box sx={{ minWidth: 0, flex: 1 }}>
						<Skeleton variant="text" width="38%" height={18} />
						<Skeleton variant="text" width="54%" height={16} />
					</Box>
				</Box>
				<Skeleton
					variant="rounded"
					width={86}
					height={28}
					sx={{ borderRadius: 999 }}
				/>
				<Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
					<Skeleton variant="circular" width={32} height={32} />
					<Skeleton variant="circular" width={32} height={32} />
				</Box>
			</Box>
		))}
	</Box>
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
