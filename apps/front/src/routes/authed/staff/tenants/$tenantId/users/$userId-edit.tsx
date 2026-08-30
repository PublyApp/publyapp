import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useBlocker } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import type { FieldSelectOption } from '~/components/field';
import QueryDisplay from '~/components/query-display';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import {
	selectStaffTenantUserCrumbName,
	staffTenantUserCrumbQuery,
	staffTenantUserDetailsQueryOptions,
	toStaffTenantUserDetails,
	useStaffTenantUserDetailsQuery,
	useUpdateStaffTenantUserMutation,
} from '~/lib/query/staff-tenant-users';
import {
	invalidateAllStaffTenantScopes,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	staffTenantDetailsQueryOptions,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	formatTenantUserLevelLabel,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from '../_tenant-details-shell';
import {
	MissingTenantUserPayloadView,
	TenantDetailsIncompleteView,
	TenantUserEditError,
	TenantUserEditLoading,
} from './_edit-error-views';
import {
	TenantUserEditFormCard,
	TenantUserEditHeader,
} from './_edit-form-section';
import {
	buildTenantUserEditPayload,
	buildTenantUserEditSchema,
	EDIT_ACCOUNT_LEVEL_OPTIONS,
	normalizeAccountLevel,
	type TenantUserEditValues,
} from './_edit-schema';
import { applyTenantUserUpdateFailure } from './_edit-submit-handler';

const StaffTenantUserEditPage = () => {
	const { tenantId, userId } = Route.useParams();
	const navigate = Route.useNavigate();
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [rootValidationError, setRootValidationError] = useState('');
	const hasSavedRef = useRef(false);

	const tenantQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	// Hoisted locals keep raw query flags out of the chained-query gate.
	const tenantQueryIsPending = tenantQuery.isPending;
	const tenantQueryIsError = tenantQuery.isError;
	const detailsQuery = useStaffTenantUserDetailsQuery(
		{ tenantId, userId },
		{
			enabled:
				tenantId.length > 0 &&
				userId.length > 0 &&
				!tenantQueryIsPending &&
				!tenantQueryIsError,
		},
	);
	const updateTenantUser = useUpdateStaffTenantUserMutation();
	const user = toStaffTenantUserDetails(detailsQuery.data);
	const resolver = useLanguageKeyedZodResolver<TenantUserEditValues>(
		buildTenantUserEditSchema,
		'common',
	);
	const accountLevelOptions: FieldSelectOption[] = useMemo(
		() =>
			EDIT_ACCOUNT_LEVEL_OPTIONS.map((option) => ({
				value: option,
				label: formatTenantUserLevelLabel(option, t),
			})),
		[t],
	);
	const methods = useForm<TenantUserEditValues>({
		resolver,
		defaultValues: {
			firstName: '',
			lastName: '',
			avatarUrl: '',
			accountLevel: 'User',
		},
	});
	const { handleSubmit, reset, formState } = methods;
	const { isSubmitting, isDirty } = formState;
	const tenant = toStaffTenantDetails(tenantQuery.data);

	const blocker = useBlocker({
		shouldBlockFn: () => isDirty && !hasSavedRef.current,
		withResolver: true,
	});

	const userFormValues = useMemo<TenantUserEditValues | null>(
		() =>
			user === null
				? null
				: {
						firstName: user.firstName ?? '',
						lastName: user.lastName ?? '',
						avatarUrl: user.avatarUrl ?? '',
						accountLevel: normalizeAccountLevel(user.accountLevel),
					},
		[user],
	);

	useEffect(() => {
		if (userFormValues === null) {
			return;
		}

		// keepDirtyValues preserves any field the user has already edited while
		// still applying server changes to fields that are still pristine — a
		// plain reset() would silently overwrite in-progress edits on every
		// background refetch (r5-tenants-F2).
		reset(userFormValues, { keepDirtyValues: true });
	}, [reset, userFormValues]);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	// Hoisted so the fatal-error gates read plain locals, not query flags —
	// QueryDisplay owns the loading/error/data rendering below.
	const tenantError = tenantQuery.error;
	if (tenantError !== null && shouldLogoutForFailure(tenantError)) {
		return <LogoutRedirect />;
	}

	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	const renderUserMissingSlot = (
		<TenantDetailsIncompleteView onRetry={() => void tenantQuery.refetch()} />
	);

	return (
		<QueryDisplay
			query={tenantQuery}
			LoadingSlot={<TenantDetailsLoading />}
			ErrorSlot={
				<TenantDetailsError
					error={tenantError}
					onRetry={() => void tenantQuery.refetch()}
				/>
			}
		>
			{() => {
				if (!tenant) {
					return renderUserMissingSlot;
				}

				return (
					<QueryDisplay
						query={detailsQuery}
						LoadingSlot={<TenantUserEditLoading />}
						ErrorSlot={({ error }) => (
							<TenantUserEditError
								error={error}
								onRetry={() => void detailsQuery.refetch()}
							/>
						)}
						EmptySlot={renderUserMissingSlot}
					>
						{() => {
							if (!user) {
								return <MissingTenantUserPayloadView />;
							}

							const onSubmit = handleSubmit(async (values) => {
								const payload = buildTenantUserEditPayload({
									tenantId,
									userId,
									values,
									dirtyFields: formState.dirtyFields,
								});

								try {
									setRootValidationError('');
									await updateTenantUser.mutateAsync(payload);
								} catch (error) {
									if (shouldLogoutForFailure(error)) {
										setShouldLogout(true);
										return;
									}

									applyTenantUserUpdateFailure({
										failure: toApiFailure(error),
										fallback: t('tenant-user-update-failed'),
										setError: methods.setError,
										setRootValidationError,
									});
									return;
								}

								await invalidateAllStaffTenantScopes(queryClient);
								hasSavedRef.current = true;
								void navigate({
									to: '/staff/tenants/$tenantId/users/$userId',
									params: { tenantId, userId },
								});
							});

							const isSubmittingForm =
								isSubmitting || updateTenantUser.isPending;
							const saveDisabled =
								isSubmittingForm ||
								!formState.isDirty ||
								!tenantId.length ||
								!userId.length;

							return (
								<TenantDetailsPageShell
									tenant={tenant}
									activeSection="users"
									summary={t('edit-tenant-user-summary')}
									testId="staff-tenant-user-edit-page"
								>
									<TenantUserEditHeader tenantId={tenantId} userId={userId} />

									<TenantUserEditFormCard
										methods={methods}
										onSubmit={onSubmit}
										accountLevelOptions={accountLevelOptions}
										isSubmittingForm={isSubmittingForm}
										rootValidationError={rootValidationError}
										saveDisabled={saveDisabled}
									/>

									<ConfirmDialog
										isOpen={blocker.status === 'blocked'}
										title={t('unsaved-changes-dialog-title')}
										description={t('unsaved-changes-dialog-description')}
										confirmLabel={t('leave-page')}
										cancelLabel={t('cancel')}
										tone="danger"
										onConfirm={() => blocker.proceed?.()}
										onOpenChange={(isOpen) => {
											if (!isOpen) {
												blocker.reset?.();
											}
										}}
									/>
								</TenantDetailsPageShell>
							);
						}}
					</QueryDisplay>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users/$userId/edit',
)({
	staticData: {
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}`,
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
			{
				kind: 'label',
				labelKey: 'common:users',
				to: `/staff/tenants/${params.tenantId}/users`,
			},
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}/users/${params.userId}`,
				query: staffTenantUserCrumbQuery,
				select: selectStaffTenantUserCrumbName,
			},
			{ kind: 'label', labelKey: 'common:edit' },
		],
		preload: ({ params }) => [
			{
				options: staffTenantDetailsQueryOptions,
				variables: { tenantId: params.tenantId },
			},
			{
				options: staffTenantUserDetailsQueryOptions,
				variables: { tenantId: params.tenantId, userId: params.userId },
			},
		],
	},
	component: StaffTenantUserEditPage,
});
