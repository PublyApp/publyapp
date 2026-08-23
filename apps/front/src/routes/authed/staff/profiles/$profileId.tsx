import { IconArrowLeft, IconSearchOff } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import {
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import {
	useStaffProfileUsersQuery,
	toStaffProfileUserRows,
} from '~/lib/query/staff-profile-users';
import {
	selectStaffProfileCrumbName,
	staffProfileCrumbQuery,
	type StaffPermissionCatalog,
	toStaffProfileDetails,
	useStaffPermissionCatalogQuery,
	useStaffProfileDetailsQuery,
	useStaffProfilePermissionKeysQuery,
} from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	ProfileDetailsError,
	ProfileDetailsLoading,
} from './$profileId/_detail-views';
import { StaffProfileIdentityHeader } from './$profileId/_identity-header';
import { renderStaffProfileMembersCard } from './$profileId/_members-card-content';
import { PermissionMatrix } from './$profileId/_permission-matrix';

const StaffProfileDetailsPage = () => {
	const { profileId } = Route.useParams();
	const { t, i18n } = useTranslation('common');

	const detailQuery = useStaffProfileDetailsQuery({ profileId });
	const permissionKeysQuery = useStaffProfilePermissionKeysQuery({ profileId });
	const permissionCatalogQuery = useStaffPermissionCatalogQuery({
		language: i18n.language,
	});
	const usersQuery = useStaffProfileUsersQuery({ profileId, size: 5 });

	// Hoisted so the fatal-error gates read plain locals, not query flags.
	const detailError = detailQuery.error;
	if (detailError !== null && shouldLogoutForFailure(detailError)) {
		return <LogoutRedirect />;
	}

	const permissionKeysError = permissionKeysQuery.error;
	if (
		permissionKeysError !== null &&
		shouldLogoutForFailure(permissionKeysError)
	) {
		return <LogoutRedirect />;
	}

	const permissionCatalogError = permissionCatalogQuery.error;
	if (
		permissionCatalogError !== null &&
		shouldLogoutForFailure(permissionCatalogError)
	) {
		return <LogoutRedirect />;
	}

	const usersError = usersQuery.error;
	if (usersError !== null && shouldLogoutForFailure(usersError)) {
		return <LogoutRedirect />;
	}

	const detailIsPending = detailQuery.isPending;
	if (detailIsPending) {
		return <ProfileDetailsLoading />;
	}

	const detailIsError = detailQuery.isError;
	if (detailIsError) {
		return (
			<ProfileDetailsError
				error={detailError}
				onRetry={() => void detailQuery.refetch()}
			/>
		);
	}

	const permissionKeysIsPending = permissionKeysQuery.isPending;
	if (permissionKeysIsPending) {
		return <ProfileDetailsLoading />;
	}

	const permissionKeysIsError = permissionKeysQuery.isError;
	if (permissionKeysIsError) {
		return (
			<ProfileDetailsError
				error={permissionKeysError}
				onRetry={() => void permissionKeysQuery.refetch()}
			/>
		);
	}

	const permissionCatalogIsError = permissionCatalogQuery.isError;
	if (permissionCatalogIsError) {
		return (
			<ProfileDetailsError
				error={permissionCatalogError}
				onRetry={() => void permissionCatalogQuery.refetch()}
			/>
		);
	}

	const details = toStaffProfileDetails(detailQuery.data);
	if (!details) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code={t('error-404-code')}
				title={t('staff-profile-not-found')}
				description={t('staff-profile-payload-empty')}
				testId="staff-profile-details-empty"
				actions={
					<Link
						to="/staff/profiles"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-profiles')}
					</Link>
				}
			/>
		);
	}

	const assignedKeys = permissionKeysQuery.data.permissionKeys ?? [];
	const catalog = (permissionCatalogQuery.data?.additionalData ?? undefined) as
		| StaffPermissionCatalog
		| undefined;
	const userRows = toStaffProfileUserRows(usersQuery.data?.users);
	const usersFailure = usersQuery.isError
		? toApiFailure(usersQuery.error)
		: null;
	const userCount = details.userAccountCount;
	const membersCardContent = renderStaffProfileMembersCard({
		t,
		userRows,
		usersPending: usersQuery.isPending,
		usersFailureStatus:
			usersFailure?.kind === 'problem' ? usersFailure.status : null,
		onRetry: () => void usersQuery.refetch(),
	});

	let catalogPermCount = 0;
	if (catalog) {
		for (const module of Object.values(catalog)) {
			catalogPermCount += Object.keys(module).length;
		}
	}

	return (
		<div
			className="publy-detail-page publy-page-fill"
			data-testid="staff-profile-details-page"
		>
			<div className="mb-4">
				<Link to="/staff/profiles" className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-profiles')}
				</Link>
			</div>

			<StaffProfileIdentityHeader
				details={details}
				profileId={profileId}
				assignedCount={assignedKeys.length}
			/>

			<DetailGrid>
				<DetailMain>
					{/* Permissions in this profile */}
					<Card className="publy-detail-card">
						<div className="publy-detail-card-header">
							<span className="text-[14px] font-semibold">
								{t('permissions-in-this-profile')}
							</span>
						</div>
						{assignedKeys.length === 0 ? (
							<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
								{t('no-permissions-assigned-to-profile')}
							</div>
						) : (
							<PermissionMatrix assignedKeys={assignedKeys} catalog={catalog} />
						)}
					</Card>
				</DetailMain>

				<DetailAside className="flex flex-col gap-5">
					{/* About Card */}
					<Card className="publy-detail-card">
						<div className="publy-detail-card-header">
							<span className="text-[14px] font-semibold">{t('about')}</span>
						</div>
						<div className="publy-detail-card-body">
							<div className="publy-detail-row">
								<span className="publy-type-metadata-label">
									{t('profile-id')}
								</span>
								<span className="font-mono text-[12px] text-[var(--publy-foreground-secondary)]">
									{details.id}
								</span>
							</div>
							<div className="publy-detail-row">
								<span className="publy-type-metadata-label">
									{t('permissions')}
								</span>
								<span className="text-[12px] font-medium">
									{catalogPermCount > 0
										? t('permissions-of-total-granted', {
												count: assignedKeys.length,
												total: catalogPermCount,
											})
										: assignedKeys.length}
								</span>
							</div>
						</div>
					</Card>

					{/* Members Card */}
					<Card className="publy-detail-card">
						<div className="publy-detail-card-header">
							<span className="text-[14px] font-semibold">
								{t('members')}
								{userCount === null ? null : (
									<span className="font-normal text-[var(--publy-foreground-subtle)]">
										{' '}
										· {userCount}
									</span>
								)}
							</span>
							<Link
								to="/staff/profiles/$profileId/users"
								params={{ profileId }}
								className="text-[12px] no-underline text-[var(--publy-foreground-muted)]"
							>
								{t('view-all')}
							</Link>
						</div>
						<div className="flex flex-col">{membersCardContent}</div>
					</Card>
				</DetailAside>
			</DetailGrid>
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/profiles/$profileId',
)({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-staff-profiles', to: '/staff/profiles' },
			{
				kind: 'entity',
				query: staffProfileCrumbQuery,
				select: selectStaffProfileCrumbName,
			},
		],
	},
	component: StaffProfileDetailsPage,
});
