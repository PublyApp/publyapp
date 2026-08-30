import { useQueryClient } from '@tanstack/react-query';
import {
	createFileRoute,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	invalidateStaffUsers,
	removeStaffUserDetails,
	staffUserDetailsQueryOptions,
	toAssignedStaffProfiles,
	toStaffUserDetails,
	useDeleteStaffUserMutation,
	useReactivateStaffUserMutation,
	useStaffUserDetailsQuery,
	useStaffUserProfilesQuery,
	useSuspendStaffUserMutation,
} from '~/lib/query/staff-users';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	DeleteConfirmField,
	ConfirmHeaderInfo,
} from '../_staff-user-delete-confirm';
import { StaffUserErrorViews } from '../_staff-user-error-views';
import { StaffUserIdentityHeader } from '../_staff-user-identity-header';
import { staffUserCrumbsBase } from './$userId/_crumbs';
import { StaffUserDetailsEmptyPayload } from './$userId/_detail-views';
import {
	getActiveSection,
	getSuspendDialogKeys,
	getSuspendLabelKey,
	normalizeStatus,
	STAFF_STATUS_ACTIVE,
	STAFF_STATUS_SUSPENDED,
} from './$userId/_lifecycle';
import type { StaffUserOverviewContextValue } from './$userId/_overview-context';

const StaffUserDetailsPage = () => {
	const { userId } = Route.useParams();
	const { t, i18n } = useTranslation(['staff-users', 'common']);
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [deleteConfirmText, setDeleteConfirmText] = useState('');
	const [isSuspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [shouldLogout, setShouldLogout] = useState(false);
	const suspendUser = useSuspendStaffUserMutation();
	const reactivateUser = useReactivateStaffUserMutation();
	const deleteUser = useDeleteStaffUserMutation();

	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activeSection = getActiveSection(pathname);

	const detailQuery = useStaffUserDetailsQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);
	const profilesQuery = useStaffUserProfilesQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);
	const user = toStaffUserDetails(detailQuery.data);
	const profiles = toAssignedStaffProfiles(profilesQuery.data);

	// Hoisted so the fatal-error gates read plain locals, not query flags —
	// QueryDisplay owns the loading/error/data rendering below.
	const detailError = detailQuery.error;
	const profilesError = profilesQuery.error;
	if (
		(detailError !== null && shouldLogoutForFailure(detailError)) ||
		(profilesError !== null && shouldLogoutForFailure(profilesError))
	) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const renderDetailErrorSlot = (
		<StaffUserErrorViews
			error={detailError}
			onRetry={() => {
				void detailQuery.refetch();
			}}
		/>
	);

	return (
		<QueryDisplay query={detailQuery} ErrorSlot={renderDetailErrorSlot}>
			{() => {
				if (!user) {
					return <StaffUserDetailsEmptyPayload />;
				}

				const normalizedStatus = normalizeStatus(user.status);
				const isActive = normalizedStatus === STAFF_STATUS_ACTIVE;
				const canSuspend = isActive;
				const canReactivate = normalizedStatus === STAFF_STATUS_SUSPENDED;
				const pendingAction = suspendUser.isPending || reactivateUser.isPending;

				const handleLifecycleAction = async () => {
					if (!canSuspend && !canReactivate) {
						setSuspendDialogOpen(false);

						return;
					}

					try {
						if (canSuspend) {
							await suspendUser.mutateAsync({ userId });
						} else if (canReactivate) {
							await reactivateUser.mutateAsync({ userId });
						}
					} catch (error) {
						// Close the dialog on every exit path — no try/finally, which the
						// React Compiler cannot lower yet and would skip this component.
						if (shouldLogoutForFailure(error)) {
							setShouldLogout(true);
							setSuspendDialogOpen(false);
							return;
						}
						setSuspendDialogOpen(false);
						return;
					}
					setSuspendDialogOpen(false);

					try {
						await invalidateStaffUsers(queryClient);
					} catch (error) {
						logger.warn('Staff user lifecycle invalidation failed', error);
					}
				};

				const handleDeleteAction = async () => {
					try {
						await deleteUser.mutateAsync({ userId });
					} catch (error) {
						// Close the dialog on every exit path — no try/finally, which the
						// React Compiler cannot lower yet and would skip this component.
						if (shouldLogoutForFailure(error)) {
							setShouldLogout(true);
							setDeleteDialogOpen(false);
							setDeleteConfirmText('');
							return;
						}
						setDeleteDialogOpen(false);
						setDeleteConfirmText('');
						return;
					}
					setDeleteDialogOpen(false);
					setDeleteConfirmText('');

					try {
						await navigate({ to: '/staff/staff-users' });
					} catch (error) {
						// navigation rejection after successful delete — don't reuse failure message
						logger.warn('Staff user delete navigation failed', error);
					}

					removeStaffUserDetails(queryClient);
					void invalidateStaffUsers(queryClient);
				};

				const isDeleteConfirmReady =
					deleteConfirmText.trim().toLowerCase() === 'delete';
				const maxProfilesPerUser = profilesQuery.data?.maxProfilesPerUser;
				// Reads the hoisted fatal-error local, not raw query flags.
				const profilesHasError =
					profilesError !== null && !shouldLogoutForFailure(profilesError);

				// Memoizing this literal would require hoisting it above the early returns,
				// breaking conditional hook order on this page. The Provider re-renders only
				// with this page, and the overview tab consumes the same query data, so the
				// extra renders are local and bounded.
				const overviewContextValue: StaffUserOverviewContextValue = {
					user,
					locale: i18n.language,
					profiles,
					// `detailQuery.isPending` alone gates the page's own loading screen —
					// profiles is a separate query that can still be pending once details
					// resolve, so the overview tab must model this explicitly instead of
					// treating "not yet loaded" the same as "loaded, zero assignments"
					// (r5-F6).
					profilesIsPending: profilesQuery.isPending,
					profilesHasError,
					onRetryProfiles: () => void profilesQuery.refetch(),
					maxProfilesPerUser: maxProfilesPerUser ?? 0,
					canSuspend,
					canReactivate,
					suspendLabelKey: getSuspendLabelKey(user.status),
					suspendDescription: t(
						getSuspendDialogKeys(user.status).descriptionKey,
					),
					isDeletePending: deleteUser.isPending,
					onOpenSuspendDialog: () => {
						setSuspendDialogOpen(true);
					},
					onOpenDeleteDialog: () => {
						setDeleteDialogOpen(true);
					},
				};

				return (
					<div
						className="publy-detail-page space-y-5"
						data-testid="staff-user-details-page"
					>
						<StaffUserIdentityHeader
							user={user}
							userId={userId}
							suspendDialogOpen={isSuspendDialogOpen}
							onSuspendDialogOpenChange={(open) => setSuspendDialogOpen(open)}
							onConfirmLifecycle={() => {
								void handleLifecycleAction();
							}}
							isLifecyclePending={pendingAction}
							getSuspendDialogKeys={getSuspendDialogKeys}
							getSuspendLabelKey={getSuspendLabelKey}
							activeSection={activeSection}
							overviewContextValue={overviewContextValue}
						/>

						<ConfirmDialog
							isOpen={isDeleteDialogOpen}
							title={t('confirm-delete-staff-user-title')}
							description={t('confirm-delete-staff-user-message')}
							confirmLabel={t('common:delete')}
							tone="danger"
							isPending={deleteUser.isPending}
							isConfirmDisabled={!isDeleteConfirmReady}
							onConfirm={() => {
								if (isDeleteConfirmReady) {
									void handleDeleteAction();
								}
							}}
							onOpenChange={(isOpen) => {
								setDeleteDialogOpen(isOpen);
								if (!isOpen) {
									setDeleteConfirmText('');
								}
							}}
						>
							<div className="space-y-2">
								<ConfirmHeaderInfo
									name={user.displayName}
									email={user.email}
									avatarUrl={user.avatarUrl}
								/>
								<DeleteConfirmField
									value={deleteConfirmText}
									onChange={(next) => {
										setDeleteConfirmText(next);
									}}
								/>
							</div>
						</ConfirmDialog>
					</div>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId',
)({
	staticData: {
		i18nNamespaces: ['staff-users'],
		// Always matched alongside an index/permissions/activity/settings
		// child (never the deepest match on its own — see
		// `deriveBreadcrumbTrail`), but the contract requires every route to
		// declare its own trail. The overview base is the correct value for
		// this route's own path.
		crumbs: staffUserCrumbsBase,
		preload: ({ params }) => [
			{
				options: staffUserDetailsQueryOptions,
				variables: { userId: params.userId },
			},
		],
	},
	component: StaffUserDetailsPage,
});
