import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import {
	STAFF_TENANT_PROFILES_QUERY_KEY,
	useCreateStaffTenantProfileMutation,
} from '~/lib/query/staff-tenant-profiles';
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
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';

const createTenantProfileSchema = z.object({
	name: z.string().trim().min(1).max(100),
	description: z.string().trim().max(500).optional(),
});

type CreateTenantProfileValues = z.infer<typeof createTenantProfileSchema>;

const DEFAULT_VALUES: CreateTenantProfileValues = {
	name: '',
	description: '',
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/new',
)({
	component: StaffTenantProfileCreatePage,
});

function StaffTenantProfileCreatePage() {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { t } = useTranslation('common');
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');

	const tenantQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const createProfile = useCreateStaffTenantProfileMutation();
	const methods = useForm<CreateTenantProfileValues>({
		resolver: zodResolver(createTenantProfileSchema),
		defaultValues: DEFAULT_VALUES,
	});

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

	const tenant = toStaffTenantDetails(tenantQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="500 — Server Error"
				title="Unable to load this tenant"
				description="The tenant response was incomplete."
				testId="staff-tenant-details-error"
				actions={
					<TenantRetryActions onRetry={() => void tenantQuery.refetch()} />
				}
			/>
		);
	}

	const onSubmit = methods.handleSubmit(async (values) => {
		setServerError('');

		try {
			const result = await createProfile.mutateAsync({
				tenantId,
				name: values.name,
				description: values.description,
			});
			await queryClient.invalidateQueries({
				queryKey: STAFF_TENANT_PROFILES_QUERY_KEY,
			});

			const profileId = result?.profile?.id?.toString().trim();
			if (profileId) {
				void navigate({
					to: '/staff/tenants/$tenantId/profiles/$profileId',
					params: { tenantId, profileId },
				});
				return;
			}

			void navigate({
				to: '/staff/tenants/$tenantId/profiles',
				params: { tenantId },
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setServerError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('profile-save-failed'),
				}),
			);
		}
	});

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="profiles"
			summary="Create a tenant profile with a name and description."
			testId="staff-tenant-profile-create-page"
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Link
						to={'/staff/tenants/$tenantId/profiles' as never}
						params={{ tenantId } as never}
						className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
					>
						{t('back-to-profiles')}
					</Link>
					<h2 className="text-2xl font-semibold text-foreground">
						{t('new-item', { item: t('profile') })}
					</h2>
					<p className="text-sm text-muted-foreground">
						Add a profile name and optional description for this tenant.
					</p>
				</div>

				<Card className="space-y-4 p-5">
					<Form methods={methods} onSubmit={onSubmit}>
						<Field.Text
							name="name"
							label={t('profile-name')}
							placeholder="Approvers"
							disabled={createProfile.isPending}
						/>
						<Field.Text
							name="description"
							label={t('description')}
							placeholder="Describe the responsibilities for this profile"
							disabled={createProfile.isPending}
						/>
						{serverError ? (
							<p className="text-sm text-destructive">{serverError}</p>
						) : null}
						<div className="flex justify-end">
							<Button type="submit" disabled={createProfile.isPending}>
								{t('create-profile')}
							</Button>
						</div>
					</Form>
				</Card>
			</div>
		</TenantDetailsPageShell>
	);
}
