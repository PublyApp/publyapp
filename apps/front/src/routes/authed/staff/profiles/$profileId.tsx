import { IconArrowLeft, IconSearchOff } from '@tabler/icons-react';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { buttonVariants } from '~/components/ui/button.variants';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
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

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	ProfileDetailsError,
	ProfileDetailsLoading,
} from './$profileId/_detail-views';
import { StaffProfileIdentityHeader } from './$profileId/_identity-header';
import { renderStaffProfileMembersCard } from './$profileId/_members-card-content';
import { PermissionMatrix } from './$profileId/_permission-matrix';
import { StaffProfileEditDetailsDrawer } from './$profileId/_profile-edit-details-drawer';

/** Search state for the staff-profile detail page (#819): the edit drawer's
 * open flag, mirroring the tenant profile detail layout's `?edit=1`. */
type StaffProfileDetailsSearchParams = {
	edit?: 1;
};

/** The flag round-trips as the NUMBER 1; a raw string "1" is accepted, and
 * anything else drops the key instead of persisting a default. */
const parseStaffProfileDetailsSearchParams = (
	search: Record<string, unknown>,
): StaffProfileDetailsSearchParams => ({
	edit:
		search.edit === 1 ||
		(typeof search.edit === 'string' && search.edit.trim() === '1')
			? 1
			: undefined,
});

const StaffProfileDetailsPage = () => {
	const { profileId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t, i18n } = useTranslation('common');

	const detailQuery = useStaffProfileDetailsQuery({ profileId });
	const permissionKeysQuery = useStaffProfilePermissionKeysQuery({ profileId });
	const permissionCatalogQuery = useStaffPermissionCatalogQuery({
		language: i18n.language,
	});
	const usersQuery = useStaffProfileUsersQuery({ profileId, size: 5 });

	// #819 — the edit drawer's open flag lives in the URL (`?edit=1`), the way
	// the tenant profile detail page hosts its own drawer.
	const [isEditFormDirty, setIsEditFormDirty] = useState(false);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	// An app-initiated close/save navigation is the page closing its OWN
	// drawer; the guard below must never block that transition even while the
	// drawer's dirty flag is being flushed asynchronously (W8-DRAWER).
	const editDrawerNavBypassRef = useRef(false);
	const isEditDrawerOpen = search.edit === 1;
	const setEditDrawerOpen = (isOpen: boolean): void => {
		// Opening re-arms the guard for the new draft; every close here is
		// either a clean close or an already-confirmed discard/save.
		editDrawerNavBypassRef.current = !isOpen;
		void navigate({
			search: (
				previous: StaffProfileDetailsSearchParams,
			): StaffProfileDetailsSearchParams => ({
				...previous,
				edit: isOpen ? 1 : undefined,
			}),
			replace: true,
		});
	};

	// Only an OPEN drawer holding a DIRTY draft is work the user can lose; the
	// bypass ref keeps the app's own close/save transition unblocked.
	const hasUnsavedWork = isEditDrawerOpen && isEditFormDirty;
	const editDrawerBlocker = useBlocker({
		enableBeforeUnload: hasUnsavedWork,
		shouldBlockFn: () =>
			isEditDrawerOpen && isEditFormDirty && !editDrawerNavBypassRef.current,
		withResolver: true,
	});

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

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
	// Hoisted: the fatal gate and members card read plain locals, not flags.
	const usersIsError = usersQuery.isError;
	const usersFailure = usersIsError ? toApiFailure(usersError) : null;
	const usersPending = usersQuery.isPending;
	const userCount = details.userAccountCount;
	const membersCardContent = renderStaffProfileMembersCard({
		t,
		userRows,
		usersPending,
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
				onEdit={() => setEditDrawerOpen(true)}
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

			<StaffProfileEditDetailsDrawer
				isOpen={isEditDrawerOpen}
				profile={details}
				onOpenChange={setEditDrawerOpen}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
				onDirtyChange={setIsEditFormDirty}
				onSaved={() => setEditDrawerOpen(false)}
			/>
			<ConfirmDialog
				isOpen={editDrawerBlocker.status === 'blocked'}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				cancelLabel={t('cancel')}
				tone="danger"
				onConfirm={() => editDrawerBlocker.proceed?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						editDrawerBlocker.reset?.();
					}
				}}
			/>
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
		// #819: the edit drawer reads its scope-neutral picker labels from the
		// shared `staff-tenant-profiles` catalogue.
		i18nNamespaces: ['staff-tenant-profiles'],
	},
	validateSearch: (search) =>
		parseStaffProfileDetailsSearchParams(search as Record<string, unknown>),
	component: StaffProfileDetailsPage,
});
