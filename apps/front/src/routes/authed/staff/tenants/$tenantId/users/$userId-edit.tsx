import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconAlertCircle,
	IconArrowLeft,
	IconLock,
	IconSearchOff,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import type { FieldSelectOption } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import {
	selectStaffTenantUserCrumbName,
	staffTenantUserCrumbQuery,
	toStaffTenantUserDetails,
	useStaffTenantUserDetailsQuery,
	useUpdateStaffTenantUserMutation,
} from '~/lib/query/staff-tenant-users';
import {
	invalidateAllStaffTenantScopes,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import { isAbsoluteHttpUrl } from '../../tenant-organization-profile-fields';
import {
	BackToTenantsLink,
	formatTenantUserLevelLabel,
	MALFORMED_ID_TRANSLATION_KEY,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from '../_tenant-details-shell';

const EDIT_ACCOUNT_LEVEL_OPTIONS = ['Admin', 'User'] as const;

const normalizeOptionalUpdateString = (
	value: string | undefined,
): string | null => {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	return trimmed;
};

const buildTenantUserEditSchema = (t: (key: string) => string) =>
	z.object({
		firstName: z
			.string()
			.trim()
			.max(128, { message: t('firstname-too-long') })
			.optional(),
		lastName: z
			.string()
			.trim()
			.max(128, { message: t('lastname-too-long') })
			.optional(),
		avatarUrl: z
			.string()
			.trim()
			.max(1024, { message: t('avatar-url-too-long') })
			.optional()
			.refine((value) => !value || isAbsoluteHttpUrl(value), {
				message: t('avatar-url-invalid'),
			}),
		accountLevel: z.enum(EDIT_ACCOUNT_LEVEL_OPTIONS),
	});

type TenantUserEditValues = z.infer<
	ReturnType<typeof buildTenantUserEditSchema>
>;

type TenantUserEditPayload = {
	tenantId: string;
	userId: string;
	firstName?: string | null;
	lastName?: string | null;
	avatarUrl?: string | null;
	accountLevel?: string | null;
};

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

const normalizeAccountLevel = (
	value: string | null,
): TenantUserEditValues['accountLevel'] => {
	return value === 'Admin' ? 'Admin' : 'User';
};

const TenantUserEditLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-3xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-user-edit-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-tenant-user')}</span>
			</div>
		</div>
	);
};

const MissingTenantUserView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-user-not-found-title')}
			description={getFailureDescription(
				error,
				t('tenant-user-not-found-description'),
			)}
			testId="staff-tenant-user-edit-not-found"
			actions={<BackToTenantsLink />}
		/>
	);
};

const TenantUserEditError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation('common');

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)
	) {
		return <MissingTenantUserView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return (
			<AppErrorView
				icon={<IconLock aria-hidden="true" className="size-7" />}
				code={t('error-403-code')}
				title={t('no-access-title')}
				description={t('tenant-user-edit-forbidden-description')}
				testId="forbidden-view"
			/>
		);
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('unable-to-load-tenant-user')}
			description={t('tenant-user-load-error-description')}
			testId="staff-tenant-user-edit-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

const StaffTenantUserEditPage = () => {
	const { tenantId, userId } = Route.useParams();
	const navigate = Route.useNavigate();
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [rootValidationError, setRootValidationError] = useState('');
	const hasSavedRef = useRef(false);

	const tenantQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const detailsQuery = useStaffTenantUserDetailsQuery(
		{ tenantId, userId },
		{
			enabled:
				tenantId.length > 0 &&
				userId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError,
		},
	);
	const updateTenantUser = useUpdateStaffTenantUserMutation();
	const user = toStaffTenantUserDetails(detailsQuery.data);
	const resolver = useMemo(
		() => zodResolver(buildTenantUserEditSchema(t)),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on language change so messages stay localized
		[i18n.language],
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
		[
			user?.id,
			user?.firstName,
			user?.lastName,
			user?.avatarUrl,
			user?.accountLevel,
		],
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

	if (tenantQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (tenantQuery.isError) {
		if (shouldLogoutForFailure(tenantQuery.error)) {
			return <LogoutRedirect />;
		}

		return (
			<TenantDetailsError
				error={tenantQuery.error}
				onRetry={() => void tenantQuery.refetch()}
			/>
		);
	}

	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-500-code')}
				title={t('tenant-details-error-title')}
				description={t('tenant-response-incomplete')}
				testId="staff-tenant-details-error"
				actions={
					<TenantRetryActions onRetry={() => void tenantQuery.refetch()} />
				}
			/>
		);
	}

	if (detailsQuery.isError && shouldLogoutForFailure(detailsQuery.error)) {
		return <LogoutRedirect />;
	}

	if (detailsQuery.isPending) {
		return <TenantUserEditLoading />;
	}

	if (detailsQuery.isError) {
		return (
			<TenantUserEditError
				error={detailsQuery.error}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	if (!user) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code={t('error-404-code')}
				title={t('tenant-user-not-found-title')}
				description={t('tenant-user-payload-empty')}
				testId="staff-tenant-user-edit-not-found"
				actions={<BackToTenantsLink />}
			/>
		);
	}

	const onSubmit = handleSubmit(async (values) => {
		const payload: TenantUserEditPayload = {
			tenantId,
			userId,
		};

		if (formState.dirtyFields.firstName) {
			payload.firstName = normalizeOptionalUpdateString(values.firstName);
		}

		if (formState.dirtyFields.lastName) {
			payload.lastName = normalizeOptionalUpdateString(values.lastName);
		}

		if (formState.dirtyFields.avatarUrl) {
			payload.avatarUrl = normalizeOptionalUpdateString(values.avatarUrl);
		}

		if (formState.dirtyFields.accountLevel) {
			payload.accountLevel = values.accountLevel;
		}

		try {
			setRootValidationError('');
			await updateTenantUser.mutateAsync(payload);
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				const hasAvatarUrlError =
					(failure.fieldErrors.avatarUrl?.length ?? 0) > 0;
				if (hasAvatarUrlError) {
					methods.setError('avatarUrl', {
						type: 'server',
						message: getFailureMessage(failure, {
							fallback: t('tenant-user-update-failed'),
						}),
					});
				}

				const hasUnmappedError = Object.keys(failure.fieldErrors).some(
					(field) => field !== 'avatarUrl',
				);
				if (!hasAvatarUrlError || hasUnmappedError) {
					setRootValidationError(
						getFailureMessage(failure, {
							fallback: t('tenant-user-update-failed'),
						}),
					);
				}
			}
			return;
		}

		await invalidateAllStaffTenantScopes(queryClient);
		hasSavedRef.current = true;
		void navigate({
			to: '/staff/tenants/$tenantId/users/$userId',
			params: { tenantId, userId },
		});
	});

	const isSubmittingForm = isSubmitting || updateTenantUser.isPending;
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
			<div className="space-y-2">
				<div className="flex items-center justify-between gap-2">
					<Link
						to="/staff/tenants/$tenantId/users/$userId"
						params={{ tenantId, userId }}
						className="publy-back-link"
					>
						<IconArrowLeft aria-hidden="true" className="size-3" />
						{t('back-to-user')}
					</Link>
					<h2 className="text-2xl font-semibold text-foreground">
						{t('edit-tenant-user')}
					</h2>
				</div>
				<p className="text-sm text-muted-foreground">
					{t('edit-tenant-user-description')}
				</p>
			</div>

			<Card className="space-y-4 p-5">
				<Form methods={methods} onSubmit={onSubmit}>
					<Field.Text
						name="firstName"
						label={t('first-name')}
						fullWidth
						isDisabled={isSubmittingForm}
					/>
					<Field.Text
						name="lastName"
						label={t('last-name')}
						fullWidth
						isDisabled={isSubmittingForm}
					/>
					<Field.Text
						name="avatarUrl"
						label={t('avatar-url')}
						fullWidth
						isDisabled={isSubmittingForm}
					/>
					<Field.Select
						name="accountLevel"
						label={t('account-level')}
						options={accountLevelOptions}
						isDisabled={isSubmittingForm}
					/>

					{rootValidationError ? (
						<p className="text-sm text-destructive" role="alert">
							{rootValidationError}
						</p>
					) : null}

					<div className="flex justify-end">
						<Button type="submit" variant="default" disabled={saveDisabled}>
							{t('save-changes')}
						</Button>
					</div>
				</Form>
			</Card>

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
	},
	component: StaffTenantUserEditPage,
});
