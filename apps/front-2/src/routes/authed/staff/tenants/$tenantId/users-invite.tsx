import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { STAFF_TENANT_INVITATIONS_QUERY_KEY } from '~/lib/query/staff-tenant-invitations';
import {
	STAFF_TENANT_USERS_QUERY_KEY,
	useInviteTenantUserMutation,
} from '~/lib/query/staff-tenant-users';
import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import { toStaffTenantDetails } from '~/lib/query/staff-tenants';
import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from './_tenant-details-shell';
import { useStaffTenantDetailsQuery } from '~/lib/query/staff-tenants';

const inviteUserSchema = z.object({
	email: z
		.string({ required_error: 'Email is required.' })
		.trim()
		.email('Invalid email address.'),
	accountLevel: z.enum(['Admin', 'User'], {
		required_error: 'Account level is required.',
	}),
});

type InviteTenantUserFormValues = z.infer<typeof inviteUserSchema>;

const DEFAULT_VALUES: InviteTenantUserFormValues = {
	email: '',
	accountLevel: 'User',
};

const ACCOUNT_LEVEL_OPTIONS = ['Admin', 'User'];

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users/invite',
)({
	component: StaffTenantUsersInviteRoute,
});

function StaffTenantUsersInviteRoute() {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const methods = useForm<InviteTenantUserFormValues>({
		resolver: zodResolver(inviteUserSchema),
		defaultValues: DEFAULT_VALUES,
	});
	const { register, handleSubmit, reset, formState } = methods;
	const { errors, isSubmitting } = formState;
	const { mutateAsync, isPending } = useInviteTenantUserMutation();
	const [serverErrors, setServerErrors] = useState<string[]>([]);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);

	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);

	const invalidateTenantData = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANT_USERS_QUERY_KEY],
			}),
			queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANT_INVITATIONS_QUERY_KEY],
			}),
		]);

	const onSubmit = handleSubmit(async (values) => {
		setServerErrors([]);

		try {
			await mutateAsync({
				tenantId,
				email: values.email,
				accountLevel: values.accountLevel,
			});
			reset(DEFAULT_VALUES);
			await invalidateTenantData();
			void navigate({
				to: '/staff/tenants/$tenantId/invitations' as never,
				params: { tenantId },
			});
		} catch (error) {
			const failure = toApiFailure(error);

			if (shouldLogoutForFailure(error)) {
				setShouldRedirectToLogout(true);
				return;
			}

			if (failure.kind === 'validation') {
				const messages = Object.values(failure.fieldErrors).flat();
				setServerErrors(
					messages.length > 0
						? messages
						: [
							getFailureMessage(failure, {
								fallback: 'Invitation validation failed.',
							}),
						],
				);
				return;
			}

			setServerErrors([
				getFailureMessage(failure, {
					fallback: 'Unable to send the invitation.',
				}),
			]);
		}
	});

	if (detailsQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (detailsQuery.isError) {
		if (shouldLogoutForFailure(detailsQuery.error)) {
			return <LogoutRedirect />;
		}

		return <TenantDetailsError error={detailsQuery.error} />;
	}

	const tenant = toStaffTenantDetails(detailsQuery.data);
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

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	const isPendingForm = isPending || isSubmitting;
	const submitDisabled = isPendingForm || !tenantId.length;

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="users"
			summary="Send a single user invitation to this tenant."
			testId="staff-tenant-users-invite-page"
		>
			<div className="space-y-2">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-lg font-semibold text-foreground">
						Invite tenant user
					</h2>
					<Link
						to={'/staff/tenants/$tenantId/users' as never}
						params={{ tenantId }}
						className="text-sm text-foreground-500 underline underline-offset-2"
					>
						{t('back-to-users')}
					</Link>
				</div>
				<p className="text-sm text-foreground-500">Send one tenant invitation.</p>
			</div>

			<Card className="space-y-4 p-4">
				<form className="space-y-4" onSubmit={onSubmit} noValidate>
					<div className="space-y-2">
						<label htmlFor="tenant-invite-email" className="text-sm">
							{t('email')}
						</label>
						<input
							id="tenant-invite-email"
							type="email"
							className="w-full rounded-md border border-divider bg-content1 p-2"
							aria-label={t('email')}
							placeholder="name@company.com"
							disabled={isPendingForm}
							{...register('email')}
						/>
						{errors.email ? (
							<p className="text-sm text-danger-600">{errors.email.message}</p>
						) : null}
					</div>

					<div className="space-y-2">
						<label
							htmlFor="tenant-invite-account-level"
							className="text-sm"
						>
							{t('account-level')}
						</label>
						<select
							id="tenant-invite-account-level"
							className="w-full rounded-md border border-divider bg-content1 p-2"
							disabled={isPendingForm}
							aria-label={t('account-level')}
							{...register('accountLevel')}
						>
							{ACCOUNT_LEVEL_OPTIONS.map((option) => (
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

					{serverErrors.length > 0 ? (
						<div
							className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
							role="alert"
						>
							<ul className="list-disc space-y-1 pl-4">
								{serverErrors.map((error) => (
									<li key={error}>{error}</li>
								))}
							</ul>
						</div>
					) : null}

					<Button type="submit" isDisabled={submitDisabled} variant="primary">
						Invite user
					</Button>
				</form>
			</Card>
		</TenantDetailsPageShell>
	);
}
