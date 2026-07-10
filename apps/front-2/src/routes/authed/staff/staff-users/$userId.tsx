import {
	IconAlertCircle,
	IconChevronLeft,
	IconLock,
	IconMail,
	IconPencil,
	IconTrash,
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
import { DataTableRowActions } from '~/components/table/row-actions';
import { Button, buttonVariants } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { Input } from '~/components/ui/input';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
	STAFF_USERS_QUERY_KEY,
	STAFF_USER_DETAILS_QUERY_KEY,
	toAssignedStaffProfiles,
	toStaffUserDetails,
	useDeleteStaffUserMutation,
	useReactivateStaffUserMutation,
	useStaffUserDetailsQuery,
	useStaffUserProfilesQuery,
	useSuspendStaffUserMutation,
} from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import {
	StaffUserOverviewContext,
	type StaffUserOverviewContextValue,
} from './$userId/-overview-context';

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

const getSuspendLabel = (status: string | null): 'Suspend' | 'Reactivate' => {
	const normalized = normalizeStatus(status);
	if (normalized === STAFF_STATUS_ACTIVE) {
		return 'Suspend';
	}

	if (normalized === STAFF_STATUS_SUSPENDED) {
		return 'Reactivate';
	}

	return 'Suspend';
};

const getSuspendDescription = (
	status: string | null,
): { title: string; description: string } => {
	const normalized = normalizeStatus(status);

	if (normalized === STAFF_STATUS_ACTIVE) {
		return {
			title: 'Suspend staff user',
			description:
				'Suspending this user revokes access to staff-level tools. You can reactivate this account at any time.',
		};
	}

	if (normalized === STAFF_STATUS_SUSPENDED) {
		return {
			title: 'Reactivate staff user',
			description:
				'Reactivating this user restores staff-level access and permissions.',
		};
	}

	return {
		title: 'Suspend staff user',
		description: 'This action updates this staff user status.',
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
}) => (
	<div className="space-y-1.5">
		<p className="text-xs text-muted-foreground">
			To delete this account, type <span className="font-mono">delete</span> in
			the field below.
		</p>
		<Input
			aria-label="Confirm delete"
			value={value}
			placeholder="Type delete to confirm"
			onChange={(event) => onChange(event.target.value)}
			className="h-9"
		/>
	</div>
);

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
	const { i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [detailActionError, setDetailActionError] = useState('');
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
					<span>Loading staff user…</span>
				</div>
			</div>
		);
	}

	if (detailQuery.isError) {
		if (isProblemStatus(detailQuery.error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
			return (
				<AppErrorView
					icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
					code="400 — Bad Request"
					title="Invalid staff user link"
					description={getFailureDescription(
						detailQuery.error,
						'This staff user link is malformed or incomplete.',
					)}
					testId="staff-user-details-invalid"
				/>
			);
		}

		if (isProblemStatus(detailQuery.error, 403)) {
			return <View403 />;
		}

		if (isProblemStatus(detailQuery.error, 404)) {
			return (
				<AppErrorView
					icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
					code="404 — Not Found"
					title="Staff user not found"
					description={getFailureDescription(
						detailQuery.error,
						'The requested staff user does not exist or is no longer available.',
					)}
					testId="staff-user-details-not-found"
				/>
			);
		}

		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="500 — Server Error"
				title="Unable to load this staff user"
				description="There was a problem loading the staff user details."
				testId="staff-user-details-error"
			/>
		);
	}

	const user = toStaffUserDetails(detailQuery.data);
	const profiles = toAssignedStaffProfiles(profilesQuery.data);
	if (!user) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title="Staff user not found"
				description="The staff user payload was empty."
				testId="staff-user-details-empty"
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
			if (canSuspend) {
				await suspendUser.mutateAsync({ userId });
			} else if (canReactivate) {
				await reactivateUser.mutateAsync({ userId });
			}

			await queryClient.invalidateQueries({
				queryKey: ['staff', 'staff-users'],
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setDetailActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: canSuspend
						? 'Unable to suspend this staff user.'
						: 'Unable to reactivate this staff user.',
				}),
			);
		} finally {
			setSuspendDialogOpen(false);
		}
	};

	const handleDeleteAction = async () => {
		try {
			setDetailActionError('');
			await deleteUser.mutateAsync({ userId });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setDetailActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: 'Unable to delete this staff user.',
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

		queryClient.removeQueries({
			queryKey: ['staff', ...STAFF_USER_DETAILS_QUERY_KEY],
		});
		void queryClient.invalidateQueries({
			queryKey: ['staff', ...STAFF_USERS_QUERY_KEY],
		});
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
		profilesHasError,
		maxProfilesPerUser: maxProfilesPerUser ?? 0,
		canSuspend,
		canReactivate,
		suspendLabel: getSuspendLabel(user.status),
		suspendDescription: getSuspendDescription(user.status).description,
		isDeletePending: deleteUser.isPending,
		onOpenSuspendDialog: () => {
			setSuspendDialogOpen(true);
		},
		onOpenDeleteDialog: () => {
			setDeleteDialogOpen(true);
		},
	};

	return (
		<div className="space-y-5" data-testid="staff-user-details-page">
			<div className="space-y-3">
				<Link
					to="/staff/staff-users"
					className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<IconChevronLeft className="size-3" />
					Back to staff users
				</Link>
			</div>
			<div className="space-y-1">
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
									<StatusPill tone="neutral">{user.accountLevel}</StatusPill>
								) : null}
								{user.status ? (
									<StatusPill tone={statusPillTone(user.status)}>
										{user.status}
									</StatusPill>
								) : null}
							</div>
							<p className="max-w-3xl text-[13px] text-muted-foreground">
								{user.email || 'No email address'}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{/* TODO(contract): wire reset-invite endpoint when available */}
						<Button type="button" variant="outline" size="sm" disabled>
							<IconMail className="size-4" />
							Reset invite
						</Button>
						<Link
							to="/staff/staff-users/$userId/edit"
							params={{ userId }}
							className={buttonVariants({ variant: 'outline', size: 'sm' })}
						>
							<IconPencil className="size-4" />
							Edit
						</Link>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							onClick={() => {
								if (canSuspend || canReactivate) {
									setSuspendDialogOpen(true);
								}
							}}
							disabled={!canSuspend && !canReactivate}
						>
							<IconLock className="size-4" />
							{getSuspendLabel(user.status)}
						</Button>
						<ConfirmDialog
							isOpen={isSuspendDialogOpen}
							title={getSuspendDescription(user.status).title}
							description={getSuspendDescription(user.status).description}
							confirmLabel={getSuspendLabel(user.status)}
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
								email={user.email || 'No email'}
								avatarSeed={user.displayName}
							/>
						</ConfirmDialog>
						<DataTableRowActions
							ariaLabel="User actions"
							testId="staff-user-actions-menu"
						>
							<DropdownMenuItem
								variant="destructive"
								onClick={() => {
									setDeleteDialogOpen(true);
								}}
							>
								<IconTrash className="size-4" />
								Delete
							</DropdownMenuItem>
						</DataTableRowActions>
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
							Overview
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
							Permissions
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
							Activity
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
							Settings
						</TabsTrigger>
					</TabsList>

					<div className="mt-5">
						<StaffUserOverviewContext.Provider value={overviewContextValue}>
							<Outlet />
						</StaffUserOverviewContext.Provider>

						{detailActionError ? (
							<div className="mt-2 text-sm text-destructive" role="alert">
								{detailActionError}
							</div>
						) : null}
					</div>
				</Tabs>
			</div>

			<ConfirmDialog
				isOpen={isDeleteDialogOpen}
				title="Delete staff user"
				description="Deleting this staff user is permanent and can’t be undone. Reassign ownership and project responsibilities first."
				confirmLabel="Delete"
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
