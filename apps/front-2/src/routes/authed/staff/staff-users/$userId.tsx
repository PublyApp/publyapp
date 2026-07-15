import {
	IconAlertCircle,
	IconArrowLeft,
	IconPencil,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
	createFileRoute,
	Link,
	Outlet,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { Button, buttonVariants } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { Input } from '~/components/ui/input';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
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

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import {
	StaffUserOverviewContext,
	type StaffUserOverviewContextValue,
} from './$userId/_overview-context';
import {
	formatAccountLevelLabel,
	formatStaffStatusLabel,
} from './status-labels';

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';
const STAFF_STATUS_ACTIVE = 'active';
const STAFF_STATUS_SUSPENDED = 'suspended';

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);

	if (failure.kind !== 'problem' || failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

const getFailureDescription = (error: unknown, fallback: string): string => {
	const failure = toApiFailure(error);

	if (failure.kind === 'problem' && failure.detail) {
		return failure.detail;
	}

	return fallback;
};

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

const ConfirmHeaderInfo = ({
	name,
	email,
	avatarSeed,
}: {
	name: string;
	email: string;
	avatarSeed: string;
}) => (
	<div className="rounded-[var(--publy-radius-card)] border border-[var(--publy-row-border)] bg-[var(--publy-surface-raised)] p-3">
		<div className="flex items-center gap-2.5">
			<InitialsAvatar name={avatarSeed} size="sm" />
			<div className="min-w-0">
				<p className="text-sm font-medium text-foreground">{name}</p>
				<p className="truncate text-xs text-muted-foreground">{email}</p>
			</div>
		</div>
	</div>
);

const DeleteConfirmField = ({
	value,
	onChange,
}: {
	value: string;
	onChange: (next: string) => void;
}) => {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-1.5">
			<p className="text-xs text-muted-foreground">
				{t('delete-confirm-instructions')}
			</p>
			<Input
				aria-label={t('confirm-delete-field-label')}
				value={value}
				placeholder={t('type-delete-to-confirm-placeholder')}
				onChange={(event) => onChange(event.target.value)}
				className="h-9"
			/>
		</div>
	);
};

const TAB_ROUTE_SUFFIXES = ['permissions', 'activity', 'settings'] as const;
type TabSection = 'overview' | (typeof TAB_ROUTE_SUFFIXES)[number];

const getActiveSection = (pathname: string): TabSection => {
	const match = TAB_ROUTE_SUFFIXES.find((suffix) =>
		pathname.endsWith(`/${suffix}`),
	);

	return match ?? 'overview';
};

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId',
)({
	component: StaffUserDetailsPage,
});

function StaffUserDetailsPage() {
	const { userId } = Route.useParams();
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [detailActionError, setDetailActionError] = useState('');
	const [deleteConfirmText, setDeleteConfirmText] = useState('');
	const [isSuspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [shouldLogout, setShouldLogout] = useState(false);
	const [detailActionSuccess, setDetailActionSuccess] = useState('');
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
		if (
			isProblemStatus(detailQuery.error, 404) ||
			isProblemStatus(detailQuery.error, 400, MALFORMED_ID_TRANSLATION_KEY)
		) {
			return (
				<AppErrorView
					icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
					code={t('error-404-code')}
					title={t('staff-user-not-found-title')}
					description={getFailureDescription(
						detailQuery.error,
						t('staff-user-not-found-description'),
					)}
					testId="staff-user-details-not-found"
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

		if (isProblemStatus(detailQuery.error, 403)) {
			return <View403 />;
		}

		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-500-code')}
				title={t('unable-to-load-staff-user')}
				description={t('problem-loading-staff-user-details')}
				testId="staff-user-details-error"
				actions={
					<>
						<Button
							variant="default"
							onClick={() => void detailQuery.refetch()}
							type="button"
						>
							{t('try-again')}
						</Button>
						<Link
							to="/staff/staff-users"
							className={buttonVariants({ variant: 'outline' })}
						>
							{t('back-to-staff-users')}
						</Link>
					</>
				}
			/>
		);
	}

	const user = toStaffUserDetails(detailQuery.data);
	const profiles = toAssignedStaffProfiles(profilesQuery.data);
	if (!user) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-404-code')}
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
			setDetailActionError('');
			setDetailActionSuccess('');
			if (canSuspend) {
				await suspendUser.mutateAsync({ userId });
			} else if (canReactivate) {
				await reactivateUser.mutateAsync({ userId });
			}

			await invalidateStaffUsers(queryClient);
			setDetailActionSuccess(
				canSuspend
					? t('staff-user-suspended-success')
					: t('staff-user-reactivated-success'),
			);
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setDetailActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: canSuspend
						? t('unable-to-suspend-staff-user')
						: t('unable-to-reactivate-staff-user'),
				}),
			);
		} finally {
			setSuspendDialogOpen(false);
		}
	};

	const handleDeleteAction = async () => {
		try {
			setDetailActionError('');
			setDetailActionSuccess('');
			await deleteUser.mutateAsync({ userId });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setDetailActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('unable-to-delete-staff-user'),
				}),
			);
			return;
		} finally {
			setDeleteDialogOpen(false);
			setDeleteConfirmText('');
		}

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
			<div className="space-y-3">
				<Link to="/staff/staff-users" className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-staff-users')}
				</Link>
			</div>
			<div className="space-y-1" data-testid="staff-user-details-heading">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="h-14 w-14">
							<InitialsAvatar name={user.displayName} size="lg" />
						</div>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
									{user.displayName}
								</h1>
								{user.accountLevel ? (
									<StatusPill tone="neutral">
										{formatAccountLevelLabel(user.accountLevel, t)}
									</StatusPill>
								) : null}
								{user.status ? (
									<StatusPill tone={statusPillTone(user.status)}>
										{formatStaffStatusLabel(user.status, t)}
									</StatusPill>
								) : null}
							</div>
							<p className="max-w-3xl text-[13px] text-muted-foreground">
								{user.email || t('no-email-address')}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Link
							to="/staff/staff-users/$userId/edit"
							params={{ userId }}
							className={buttonVariants({ variant: 'outline', size: 'sm' })}
						>
							<IconPencil className="size-4" />
							{t('edit')}
						</Link>
						<ConfirmDialog
							isOpen={isSuspendDialogOpen}
							title={t(getSuspendDialogKeys(user.status).titleKey)}
							description={t(getSuspendDialogKeys(user.status).descriptionKey)}
							confirmLabel={t(getSuspendLabelKey(user.status))}
							isPending={pendingAction}
							onConfirm={() => {
								void handleLifecycleAction();
							}}
							onOpenChange={(nextOpen) => {
								setSuspendDialogOpen(nextOpen);
							}}
						>
							<ConfirmHeaderInfo
								name={user.displayName}
								email={user.email || t('no-email-address')}
								avatarSeed={user.displayName}
							/>
						</ConfirmDialog>
					</div>
				</div>

				<Tabs value={activeSection}>
					<TabsList variant="line">
						<TabsTrigger
							value="overview"
							render={
								<Link to="/staff/staff-users/$userId" params={{ userId }} />
							}
						>
							{t('overview')}
						</TabsTrigger>
						<TabsTrigger
							value="permissions"
							render={
								<Link
									to="/staff/staff-users/$userId/permissions"
									params={{ userId }}
								/>
							}
						>
							{t('permissions')}
						</TabsTrigger>
						<TabsTrigger
							value="activity"
							render={
								<Link
									to="/staff/staff-users/$userId/activity"
									params={{ userId }}
								/>
							}
						>
							{t('activity')}
						</TabsTrigger>
						<TabsTrigger
							value="settings"
							render={
								<Link
									to="/staff/staff-users/$userId/settings"
									params={{ userId }}
								/>
							}
						>
							{t('settings')}
						</TabsTrigger>
					</TabsList>

					<TabsContent value={activeSection} className="mt-5">
						<StaffUserOverviewContext.Provider value={overviewContextValue}>
							<Outlet />
						</StaffUserOverviewContext.Provider>

						{detailActionSuccess ? (
							<div className="mt-2 text-sm text-success" role="status">
								{detailActionSuccess}
							</div>
						) : null}
						{detailActionError ? (
							<div className="mt-2 text-sm text-destructive" role="alert">
								{detailActionError}
							</div>
						) : null}
					</TabsContent>
				</Tabs>
			</div>

			<ConfirmDialog
				isOpen={isDeleteDialogOpen}
				title={t('confirm-delete-staff-user-title')}
				description={t('confirm-delete-staff-user-message')}
				confirmLabel={t('delete')}
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
						avatarSeed={user.displayName}
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
}
