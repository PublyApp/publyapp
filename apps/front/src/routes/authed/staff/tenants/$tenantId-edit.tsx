import { IconAlertCircle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useBlocker } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Form, FormPageLayout } from '~/components/field';
import QueryDisplay from '~/components/query-display';
import { useLanguageKeyedZodResolver } from '~/lib/hooks/use-language-keyed-zod-resolver';
import {
	invalidateStaffTenants,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
	useUpdateStaffTenantMutation,
} from '~/lib/query/staff-tenants';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	useTenantLocaleOptions,
	useTenantTimezoneOptions,
} from '../_tenant-form-shared';
import { UnsavedChangesDialog } from '../_unsaved-changes-dialog';
import {
	getRelativeTimeParts,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantRetryActions,
} from './$tenantId/_tenant-details-shell';
import { TenantEditPreviewAside } from './_tenantId-edit-preview';
import {
	TenantEditActionBar,
	TenantEditContactSection,
	TenantEditHeader,
	TenantEditIdentitySection,
	TenantEditNotesSection,
	TenantEditOrganizationSection,
	TenantEditRegionalSection,
} from './_tenantId-edit-sections';
import {
	buildTenantUpdatePayload,
	planTenantEditFieldErrors,
	resolvePreviewMaxUsers,
} from './_tenantId-edit-submit';
import {
	buildEditTenantSchema,
	EMPTY_FORM_VALUES,
	toEditTenantFormValues,
	type EditTenantFormValues,
} from './_tenantId-edit-types';
import { getWebsiteHostname } from './tenant-organization-profile-fields';

const StaffTenantEditRoute = () => {
	const { tenantId } = Route.useParams() as { tenantId: string };
	const { t, i18n } = useTranslation('common');
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const hasSavedRef = useRef(false);
	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const updateTenant = useUpdateStaffTenantMutation();
	// Memoized on data identity: toStaffTenantDetails returns a fresh object
	// every render, which would invalidate the form-values memo below each
	// render and re-trigger the reset() effect in a loop.
	const tenant = useMemo(
		() => toStaffTenantDetails(detailsQuery.data),
		[detailsQuery.data],
	);
	const tenantFormValues = useMemo(
		() => toEditTenantFormValues(tenant),
		[tenant],
	);

	// Language-keyed resolver: rebuilds when translations change so error
	// messages stay localized; see use-language-keyed-zod-resolver.
	const resolver = useLanguageKeyedZodResolver<EditTenantFormValues>(
		buildEditTenantSchema,
		'common',
	);

	const methods = useForm<EditTenantFormValues>({
		resolver,
		defaultValues: EMPTY_FORM_VALUES,
	});
	const {
		formState: { dirtyFields, isDirty, isSubmitting },
		control,
		handleSubmit,
		reset,
	} = methods;
	const isPending = isSubmitting || updateTenant.isPending;
	const watchedName = useWatch({ control, name: 'name' }) ?? '';
	const watchedMaxUsers = useWatch({ control, name: 'maxUsers' });
	const watchedLogoUrl = useWatch({ control, name: 'logoUrl' }) ?? '';
	const watchedWebsiteUrl = useWatch({ control, name: 'websiteUrl' }) ?? '';

	const blocker = useBlocker({
		shouldBlockFn: () => isDirty && !hasSavedRef.current,
		withResolver: true,
	});

	const localeOptions = useTenantLocaleOptions(t);
	const timezoneOptions = useTenantTimezoneOptions(t);

	useEffect(() => {
		if (tenantFormValues === null) {
			return;
		}

		// keepDirtyValues preserves any field the user has already edited while
		// still applying server changes to fields that are still pristine — a
		// plain reset() would silently overwrite in-progress edits on every
		// background refetch (r5-tenants-F2).
		reset(tenantFormValues, { keepDirtyValues: true });
	}, [reset, tenantFormValues]);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// QueryDisplay owns the loading/error/data rendering below.
	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	const renderTenantMissingSlot = (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('tenant-details-error-title')}
			description={t('tenant-response-incomplete')}
			testId="staff-tenant-edit-not-found"
			actions={
				<TenantRetryActions onRetry={() => void detailsQuery.refetch()} />
			}
		/>
	);

	return (
		<QueryDisplay
			query={detailsQuery}
			LoadingSlot={<TenantDetailsLoading />}
			ErrorSlot={
				<TenantDetailsError
					error={detailsError}
					onRetry={() => void detailsQuery.refetch()}
				/>
			}
		>
			{() => {
				if (!tenant) {
					return renderTenantMissingSlot;
				}

				const onSubmit = handleSubmit(async (values) => {
					const payload = buildTenantUpdatePayload({
						tenantId,
						values,
						dirtyFields,
					});

					try {
						methods.clearErrors('root.server');
						await updateTenant.mutateAsync(payload);
					} catch (error) {
						if (shouldLogoutForFailure(error)) {
							setShouldLogout(true);
							return;
						}

						const failure = toApiFailure(error);
						if (failure.kind === 'validation') {
							const plan = planTenantEditFieldErrors(
								failure.fieldErrors,
								getFailureMessage(failure, {
									fallback: t('tenant-update-failed'),
								}),
							);
							for (const fieldError of plan.fieldErrors) {
								methods.setError(fieldError.field, {
									type: 'server',
									message: fieldError.message,
								});
							}
							if (plan.rootMessage !== null) {
								methods.setError('root.server', {
									type: 'server',
									message: plan.rootMessage,
								});
							}
						}
						return;
					}

					await invalidateStaffTenants(queryClient);
					hasSavedRef.current = true;
					void navigate({
						to: '/staff/tenants/$tenantId',
						params: { tenantId },
					});
				});

				const previewName =
					watchedName.trim().length > 0 ? watchedName : tenant.name;
				const previewMaxUsers = resolvePreviewMaxUsers(
					watchedMaxUsers,
					tenant.maxUsers,
				);
				// data-honesty-ignore: tenant code is a documented OPTIONAL field — a tenant without an assigned workspace slug has none, this is not fabricated identity data
				const slugFieldCode = tenant.code ?? '—';
				// data-honesty-ignore: tenant code is a documented OPTIONAL field — a tenant without an assigned workspace slug has none, this is not fabricated identity data
				const previewCode = tenant.code ?? '—';

				const formatLastActive = (value: Date | null): string => {
					const parts = getRelativeTimeParts(value);
					// data-honesty-ignore: relative-time "never active" fallback, not a fabricated identity
					if (parts) {
						return t(parts.key, { count: parts.count });
					}
					return '—';
				};

				return (
					<FormPageLayout width={960} data-testid="staff-tenant-edit-page">
						<TenantEditHeader t={t} tenantId={tenantId} />

						<Form methods={methods} onSubmit={onSubmit}>
							{methods.formState.errors.root?.server?.message ? (
								<p className="text-sm text-destructive" role="alert">
									{methods.formState.errors.root.server.message}
								</p>
							) : null}
							<div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:gap-9">
								<div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
									<TenantEditOrganizationSection
										t={t}
										isPending={isPending}
										code={slugFieldCode}
										previewName={previewName}
										usersCount={tenant.usersCount}
										previewMaxUsers={previewMaxUsers}
									/>
									<TenantEditIdentitySection t={t} isPending={isPending} />
									<TenantEditContactSection t={t} isPending={isPending} />
									<TenantEditRegionalSection
										t={t}
										isPending={isPending}
										localeOptions={localeOptions}
										timezoneOptions={timezoneOptions}
									/>
									<TenantEditNotesSection t={t} isPending={isPending} />
								</div>

								<TenantEditPreviewAside
									t={t}
									language={i18n.language}
									tenant={tenant}
									previewName={previewName}
									previewLogoUrl={
										watchedLogoUrl.trim().length > 0
											? watchedLogoUrl.trim()
											: null
									}
									previewCode={previewCode}
									previewMaxUsers={previewMaxUsers}
									websiteHostname={getWebsiteHostname(watchedWebsiteUrl)}
									lastActiveLabel={formatLastActive(tenant.lastActivityAt)}
								/>
							</div>

							<TenantEditActionBar
								t={t}
								isPending={isPending}
								isDirty={isDirty}
								onReset={() => {
									if (tenantFormValues) {
										reset(tenantFormValues);
									}
								}}
								onCancel={() => {
									void navigate({
										to: '/staff/tenants/$tenantId',
										params: { tenantId },
									});
								}}
							/>
						</Form>

						<UnsavedChangesDialog t={t} blocker={blocker} />
					</FormPageLayout>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/edit',
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
			{ kind: 'label', labelKey: 'common:edit' },
		],
	},
	component: StaffTenantEditRoute,
});
