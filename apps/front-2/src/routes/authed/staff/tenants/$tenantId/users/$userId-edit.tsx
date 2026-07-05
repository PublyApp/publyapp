import { Button, Card, Spinner } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import {
	STAFF_TENANT_USER_DETAILS_QUERY_KEY,
	STAFF_TENANT_USERS_QUERY_KEY,
	toStaffTenantUserDetails,
	useStaffTenantUserDetailsQuery,
	useUpdateStaffTenantUserMutation,
} from '~/lib/query/staff-tenant-users';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	MALFORMED_ID_TRANSLATION_KEY,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from '../_tenant-details-shell';

const EDIT_ACCOUNT_LEVEL_OPTIONS = ['Admin', 'User'] as const;

const normalizeOptionalUpdateString = (
	value: string | undefined,
): string | null | undefined => {
	const trimmed = value?.trim();
	if (!trimmed) {
		return undefined;
	}

	return trimmed;
};

const tenantUserEditSchema = z.object({
	firstName: z.string().trim().max(128).optional(),
	lastName: z.string().trim().max(128).optional(),
	avatarUrl: z.string().trim().max(1024).optional(),
	accountLevel: z.enum(EDIT_ACCOUNT_LEVEL_OPTIONS),
});

type TenantUserEditValues = z.infer<typeof tenantUserEditSchema>;

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

const TenantUserEditLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-3xl items-center justify-center px-4 py-12"
		data-testid="staff-tenant-user-edit-loading"
	>
		<div className="flex items-center gap-3 text-sm text-foreground-500">
			<Spinner size="sm" />
			<span>Loading tenant user…</span>
		</div>
	</div>
);

const InvalidTenantUserView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="!"
		code="400 — Bad Request"
		title="Invalid tenant user edit link"
		description={getFailureDescription(
			error,
			'This tenant user edit link is malformed or incomplete.',
		)}
		testId="staff-tenant-user-edit-invalid"
	/>
);

const MissingTenantUserView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="🔎"
		code="404 — Not Found"
		title="Tenant user not found"
		description={getFailureDescription(
			error,
			'The requested tenant user does not exist or is no longer available.',
		)}
		testId="staff-tenant-user-edit-not-found"
	/>
);

const TenantUserEditError = ({ error }: { error: unknown }) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidTenantUserView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return (
			<AppErrorView
				icon="⛔"
				code="403 — Forbidden"
				title="You don't have access"
				description="Your account does not have permission to edit this tenant user."
				testId="forbidden-view"
			/>
		);
	}

	if (isProblemStatus(error, 404)) {
		return <MissingTenantUserView error={error} />;
	}

	return (
		<AppErrorView
			icon="!"
			code="500 — Server Error"
			title="Unable to load this tenant user"
			description="There was a problem loading the tenant user details."
			testId="staff-tenant-user-edit-error"
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users/$userId/edit',
)({
	component: StaffTenantUserEditPage,
});

function StaffTenantUserEditPage() {
	const { tenantId, userId } = Route.useParams();
	const navigate = Route.useNavigate();
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');

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
	const methods = useForm<TenantUserEditValues>({
		resolver: zodResolver(tenantUserEditSchema),
		defaultValues: {
			firstName: '',
			lastName: '',
			avatarUrl: '',
			accountLevel: 'User',
		},
	});
	const { register, handleSubmit, reset, formState } = methods;
	const { errors, isSubmitting } = formState;
	const tenant = toStaffTenantDetails(tenantQuery.data);

	useEffect(() => {
		if (!user) {
			return;
		}

		reset({
			firstName: user.firstName ?? '',
			lastName: user.lastName ?? '',
			avatarUrl: user.avatarUrl ?? '',
			accountLevel: normalizeAccountLevel(user.accountLevel),
		});
	}, [reset, user]);

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

		return <TenantDetailsError error={tenantQuery.error} />;
	}

	if (!tenant) {
		return (
			<AppErrorView
				icon="!"
				code="500 — Server Error"
				title="Unable to load this tenant"
				description="The tenant response was incomplete."
				testId="staff-tenant-details-error"
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
		return <TenantUserEditError error={detailsQuery.error} />;
	}

	if (!user) {
		return (
			<AppErrorView
				icon="🔎"
				code="404 — Not Found"
				title="Tenant user not found"
				description="The tenant user payload was empty."
				testId="staff-tenant-user-edit-not-found"
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
			setServerError('');
			await updateTenantUser.mutateAsync(payload);
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ['staff', ...STAFF_TENANT_USERS_QUERY_KEY],
				}),
				queryClient.invalidateQueries({
					queryKey: ['staff', ...STAFF_TENANT_USER_DETAILS_QUERY_KEY],
				}),
			]);
			void navigate({
				to: '/staff/tenants/$tenantId/users/$userId',
				params: { tenantId, userId },
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setServerError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('tenant-user-update-failed'),
				}),
			);
		}
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
			summary="Edit tenant user identity fields."
			testId="staff-tenant-user-edit-page"
		>
			<div className="space-y-2">
				<div className="flex items-center justify-between gap-2">
					<Link
						to={'/staff/tenants/$tenantId/users/$userId' as never}
						params={{ tenantId, userId } as never}
						className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
					>
						{t('back-to-user')}
					</Link>
					<h2 className="text-2xl font-semibold text-foreground">
						{t('edit-tenant-user')}
					</h2>
				</div>
				<p className="text-sm text-foreground-500">
					Update this tenant user's identity fields.
				</p>
			</div>

			<Card className="space-y-4 p-5">
				<form className="space-y-4" onSubmit={onSubmit} noValidate>
					<div className="space-y-2">
						<label htmlFor="tenant-user-first-name" className="text-sm">
							{t('first-name')}
						</label>
						<input
							id="tenant-user-first-name"
							type="text"
							className="w-full rounded-medium border border-divider bg-content1 p-2"
							aria-label={t('first-name')}
							disabled={isSubmittingForm}
							{...register('firstName')}
						/>
						{errors.firstName ? (
							<p className="text-sm text-danger-600">
								{errors.firstName.message}
							</p>
						) : null}
					</div>

					<div className="space-y-2">
						<label htmlFor="tenant-user-last-name" className="text-sm">
							{t('last-name')}
						</label>
						<input
							id="tenant-user-last-name"
							type="text"
							className="w-full rounded-medium border border-divider bg-content1 p-2"
							aria-label={t('last-name')}
							disabled={isSubmittingForm}
							{...register('lastName')}
						/>
						{errors.lastName ? (
							<p className="text-sm text-danger-600">
								{errors.lastName.message}
							</p>
						) : null}
					</div>

					<div className="space-y-2">
						<label htmlFor="tenant-user-avatar-url" className="text-sm">
							{t('avatar-url')}
						</label>
						<input
							id="tenant-user-avatar-url"
							type="text"
							className="w-full rounded-medium border border-divider bg-content1 p-2"
							aria-label={t('avatar-url')}
							disabled={isSubmittingForm}
							{...register('avatarUrl')}
						/>
						{errors.avatarUrl ? (
							<p className="text-sm text-danger-600">
								{errors.avatarUrl.message}
							</p>
						) : null}
					</div>

					<div className="space-y-2">
						<label htmlFor="tenant-user-account-level" className="text-sm">
							{t('account-level')}
						</label>
						<select
							id="tenant-user-account-level"
							className="w-full rounded-medium border border-divider bg-content1 p-2"
							aria-label={t('account-level')}
							disabled={isSubmittingForm}
							{...register('accountLevel')}
						>
							{EDIT_ACCOUNT_LEVEL_OPTIONS.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
						{errors.accountLevel ? (
							<p className="text-sm text-danger-600">
								{errors.accountLevel.message}
							</p>
						) : null}
					</div>

					{serverError ? (
						<p className="text-sm text-danger-600">{serverError}</p>
					) : null}

					<div className="flex justify-end">
						<Button type="submit" variant="primary" isDisabled={saveDisabled}>
							{t('save-changes')}
						</Button>
					</div>
				</form>
			</Card>
		</TenantDetailsPageShell>
	);
}
