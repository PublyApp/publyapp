import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Form, FormActionBar, FormPageLayout } from '~/components/field';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	useUpdateStaffUserMutation,
	useUpdateStaffUserProfilesMutation,
} from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { staffUserCrumbsBase } from './$userId/_crumbs';
import { ChangeStaffUserEmailDialog } from './_change-email-dialog';
import { EditAccessSection } from './_edit-access-section';
import { EditIdentitySection } from './_edit-identity-section';
import { staffUserEditHasUnsavedChanges } from './_edit-nav-guard';
import {
	computeActionBarStatus,
	submitStaffUserEdit,
} from './_edit-submit-handler';
import { useEditFormData } from './_use-edit-form-data';
import { StaffUserDetailsError } from './_user-details-error';

const StaffUserEditLoading = () => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-3xl items-center justify-center px-4 py-12"
			data-testid="staff-user-edit-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<span
					role="status"
					aria-label={t('common:loading')}
					className="size-4 animate-spin rounded-[var(--publy-radius-sm)] border-2 border-muted-foreground/30 border-t-foreground"
				/>
				<span>{t('loading-staff-user')}</span>
			</div>
		</div>
	);
};

const StaffUserEditPage = () => {
	const { userId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { t } = useTranslation(['staff-users', 'common']);
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');
	const [isChangeEmailOpen, setIsChangeEmailOpen] = useState(false);

	const {
		detailsQuery,
		assignedProfilesQuery,
		profilesQuery,
		profilePagination,
		user,
		methods,
		formState,
		errors,
		isSubmitting,
		profileOptions,
		hasNoServerProfileRows,
		isProfileSearchSettled,
		deferredProfileSearch,
		profileSearch,
		setProfileSearch,
		hasLoadedProfiles,
	} = useEditFormData(userId);

	const updateStaffUser = useUpdateStaffUserMutation();
	const updateStaffUserProfiles = useUpdateStaffUserProfilesMutation();

	const blocker = useBlocker({
		// Decides from the LIVE form values compared against the pristine
		// (hydration-time) or last-saved snapshot — never from a
		// render-frozen copy. Every closure `history.block` has stacked is
		// consulted at navigation time, so a state-based `hasSaved` flag can
		// never answer synchronously here without reading stale data exactly
		// on the post-save redirect (#1314-r1 MAJOR).
		shouldBlockFn: () =>
			staffUserEditHasUnsavedChanges(userId, methods.getValues()),
		withResolver: true,
	});

	if (
		(detailsQuery.isError && shouldLogoutForFailure(detailsQuery.error)) ||
		(assignedProfilesQuery.isError &&
			shouldLogoutForFailure(assignedProfilesQuery.error)) ||
		(profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	if (
		detailsQuery.isPending ||
		assignedProfilesQuery.isPending ||
		(profilesQuery.isPending && !hasLoadedProfiles)
	) {
		return <StaffUserEditLoading />;
	}

	if (detailsQuery.isError) {
		return (
			<StaffUserDetailsError
				error={detailsQuery.error}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	if (assignedProfilesQuery.isError) {
		return (
			<StaffUserDetailsError
				error={assignedProfilesQuery.error}
				onRetry={() => void assignedProfilesQuery.refetch()}
			/>
		);
	}

	if (profilesQuery.isError) {
		return (
			<StaffUserDetailsError
				error={profilesQuery.error}
				onRetry={() => void profilesQuery.refetch()}
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
				testId="staff-user-edit-not-found"
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

	const onSubmit = methods.handleSubmit(async (values) => {
		const outcome = await submitStaffUserEdit({
			userId,
			values,
			dirtyFields: formState.dirtyFields,
			methods,
			updateStaffUserAsync: updateStaffUser.mutateAsync,
			updateStaffUserProfilesAsync: updateStaffUserProfiles.mutateAsync,
			queryClient,
			setShouldLogout,
			setServerError,
			t,
		});
		if (outcome === 'navigate') {
			await navigate({
				to: '/staff/staff-users/$userId',
				params: { userId },
			});
		}
	});

	const isSubmittingForm =
		isSubmitting ||
		updateStaffUser.isPending ||
		updateStaffUserProfiles.isPending;
	const attentionCount = Object.keys(errors).length;
	const status = computeActionBarStatus(formState.isDirty, attentionCount, t);

	return (
		<FormPageLayout data-testid="staff-user-edit-page">
			<div className="space-y-2">
				<Link
					to="/staff/staff-users/$userId"
					params={{ userId }}
					className="publy-back-link"
				>
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('common:back-to-user')}
				</Link>
				<div>
					<h1 className="text-xl font-semibold tracking-[-0.01em]">
						{t('edit-staff-user')}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{t('edit-staff-user-description')}
					</p>
				</div>
			</div>

			<Form methods={methods} onSubmit={onSubmit}>
				<EditIdentitySection
					isSubmittingForm={isSubmittingForm}
					onChangeEmailClick={() => setIsChangeEmailOpen(true)}
				/>

				<EditAccessSection
					isSubmittingForm={isSubmittingForm}
					profiles={{
						isFetching: profilesQuery.isFetching,
						isPending: profilesQuery.isPending,
						hasNoServerRows: hasNoServerProfileRows,
						isSearchSettled: isProfileSearchSettled,
					}}
					profileOptions={profileOptions}
					deferredProfileSearch={deferredProfileSearch}
					profileSearch={profileSearch}
					onProfileSearchChange={setProfileSearch}
					pagination={{
						hasPagination:
							profilePagination.hasPreviousPage ||
							Boolean(profilesQuery.data?.nextCursor),
						pageIndex: profilePagination.pageIndex,
						hasPreviousPage: profilePagination.hasPreviousPage,
						hasNextCursor: Boolean(profilesQuery.data?.nextCursor),
						onPreviousPage: profilePagination.retreat,
						onNextPage: () =>
							profilePagination.advance(
								profilesQuery.data?.nextCursor ?? undefined,
							),
					}}
				/>

				{serverError ? (
					<p className="text-sm text-destructive" role="alert">
						{serverError}
					</p>
				) : null}

				<FormActionBar status={status}>
					<Button
						type="button"
						variant="ghost"
						onClick={() => {
							void navigate({
								to: '/staff/staff-users/$userId',
								params: { userId },
							});
						}}
						disabled={isSubmittingForm}
					>
						{t('common:cancel')}
					</Button>
					<Button
						type="submit"
						disabled={isSubmittingForm || !formState.isDirty}
					>
						{t('common:save-changes')}
					</Button>
				</FormActionBar>
			</Form>
			<ChangeStaffUserEmailDialog
				userId={userId}
				currentEmail={user?.email ?? ''}
				isOpen={isChangeEmailOpen}
				onOpenChange={setIsChangeEmailOpen}
				onUpdated={() => setIsChangeEmailOpen(false)}
				onSessionExpired={() => setShouldLogout(true)}
			/>
			<ConfirmDialog
				isOpen={blocker.status === 'blocked'}
				title={t('common:unsaved-changes-dialog-title')}
				description={t('common:unsaved-changes-dialog-description')}
				confirmLabel={t('common:leave-page')}
				cancelLabel={t('common:cancel')}
				tone="danger"
				onConfirm={() => blocker.proceed?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						blocker.reset?.();
					}
				}}
			/>
		</FormPageLayout>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId/edit',
)({
	staticData: {
		i18nNamespaces: ['staff-users'],
		crumbs: (params) => [
			...staffUserCrumbsBase(params),
			{ kind: 'label', labelKey: 'common:edit' },
		],
	},
	component: StaffUserEditPage,
});
