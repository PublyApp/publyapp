import { IconAlertCircle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { buttonVariants } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	invalidateStaffUsers,
	removeStaffUserDetails,
	toAssignedStaffProfiles,
	toStaffUserDetails,
	useDeleteStaffUserMutation,
	useReactivateStaffUserMutation,
	useStaffUserDetailsQuery,
	useStaffUserProfilesQuery,
	useSuspendStaffUserMutation,
} from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import {
	DeleteConfirmField,
	ConfirmHeaderInfo,
} from '../_staff-user-delete-confirm';
import { StaffUserErrorViews } from '../_staff-user-error-views';
import { StaffUserIdentityHeader } from '../_staff-user-identity-header';
import { staffUserCrumbsBase } from './$userId/_crumbs';
import type { StaffUserOverviewContextValue } from './$userId/_overview-context';

const TAB_ROUTE_SUFFIXES = ['permissions', 'activity', 'settings'] as const;
type TabSection = 'overview' | (typeof TAB_ROUTE_SUFFIXES)[number];

const STAFF_STATUS_ACTIVE = 'active';
const STAFF_STATUS_SUSPENDED = 'suspended';

const normalizeStatus = (value: string | null | undefined): string =>
	value?.trim().toLowerCase() ?? '';

const getSuspendLabelKey = (
	status: string | null,
): 'suspend' | 'reactivate' => {
	const normalized = normalizeStatus(status);

	return normalized === STAFF_STATUS_SUSPENDED ? 'reactivate' : 'suspend';
};

const getSuspendDialogKeys = (
	status: string | null,
): { titleKey: string; descriptionKey: string } => {
	const normalized = normalizeStatus(status);

	if (normalized === STAFF_STATUS_SUSPENDED) {
		return {
			titleKey: 'reactivate-staff-user',
			descriptionKey: 'reactivate-staff-user-confirm',
		};
	}

	return {
		titleKey: 'suspend-staff-user',
		descriptionKey: 'suspend-staff-user-confirm',
	};
};

const getActiveSection = (pathname: string): TabSection => {
	const match = TAB_ROUTE_SUFFIXES.find((suffix) =>
		pathname.endsWith(`/${suffix}`),
	);

	return match ?? 'overview';
};

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

	if (
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) ||
		(profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending) {
		return (
			<div className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<div className="h-2 w-2 rounded-full bg-primary" />
					<span>{t('loading-staff-user')}</span>
				</div>
			</div>
		);
	}

	if (detailQuery.isError) {
		return (
			<StaffUserErrorViews
				error={detailQuery.error}
				onRetry={() => {
					void detailQuery.refetch();
				}}
			/>
		);
	}

	if (!user) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('common:error-404-code')}
				title={t('staff-user-not-found-title')}
				description={t('staff-user-payload-empty')}
				testId="staff-user-details-empty"
				actions={
					<Link
						to="/staff/staff-users"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-users')}
					</Link>
				}
			/>
		);
	}
	if (shouldLogout) {
		return <LogoutRedirect />;
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
	const profilesHasError =
		profilesQuery.isError && !shouldLogoutForFailure(profilesQuery.error);

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
		suspendDescription: t(getSuspendDialogKeys(user.status).descriptionKey),
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
	},
	component: StaffUserDetailsPage,
});
