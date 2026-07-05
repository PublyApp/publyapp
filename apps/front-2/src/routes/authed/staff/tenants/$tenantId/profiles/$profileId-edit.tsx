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
import { Field, Form } from '~/components/field';
import {
	STAFF_TENANT_PROFILES_QUERY_KEY,
	toStaffTenantProfileDetails,
	useStaffTenantProfileDetailsQuery,
	useUpdateStaffTenantProfileMutation,
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
	MALFORMED_ID_TRANSLATION_KEY,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from '../_tenant-details-shell';

const editTenantProfileSchema = z.object({
	name: z.string().trim().min(1).max(100),
	description: z.string().trim().max(500).optional(),
});

type EditTenantProfileValues = z.infer<typeof editTenantProfileSchema>;

const DEFAULT_VALUES: EditTenantProfileValues = {
	name: '',
	description: '',
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

const ProfileEditLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
		data-testid="staff-tenant-profile-edit-loading"
	>
		<div className="flex items-center gap-3 text-sm text-foreground-500">
			<Spinner size="sm" />
			<span>Loading tenant profile…</span>
		</div>
	</div>
);

const InvalidTenantProfileView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="!"
		code="400 — Bad Request"
		title="Invalid profile link"
		description={getFailureDescription(
			error,
			'This tenant profile link is malformed or incomplete.',
		)}
		testId="staff-tenant-profile-edit-invalid"
	/>
);

const MissingTenantProfileView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="🔎"
		code="404 — Not Found"
		title="Tenant profile not found"
		description={getFailureDescription(
			error,
			'The requested tenant profile does not exist or is no longer available.',
		)}
		testId="staff-tenant-profile-edit-not-found"
	/>
);

const TenantProfileEditError = ({ error }: { error: unknown }) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidTenantProfileView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return (
			<AppErrorView
				icon="⛔"
				code="403 — Forbidden"
				title="You don't have access"
				description="Your account does not have permission to edit this tenant profile."
				testId="forbidden-view"
			/>
		);
	}

	if (isProblemStatus(error, 404)) {
		return <MissingTenantProfileView error={error} />;
	}

	return (
		<AppErrorView
			icon="!"
			code="500 — Server Error"
			title="Unable to load this tenant profile"
			description="There was a problem loading the profile details."
			testId="staff-tenant-profile-edit-error"
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId/edit',
)({
	component: StaffTenantProfileEditPage,
});

function StaffTenantProfileEditPage() {
	const { tenantId, profileId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { t } = useTranslation('common');
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');

	const tenantQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const detailQuery = useStaffTenantProfileDetailsQuery(
		{ tenantId, profileId },
		{
			enabled:
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError,
		},
	);
	const updateProfile = useUpdateStaffTenantProfileMutation();
	const profile = toStaffTenantProfileDetails(detailQuery.data);
	const methods = useForm<EditTenantProfileValues>({
		resolver: zodResolver(editTenantProfileSchema),
		defaultValues: DEFAULT_VALUES,
	});

	useEffect(() => {
		if (!profile) {
			return;
		}

		methods.reset({
			name: profile.name,
			description: profile.description ?? '',
		});
	}, [methods, profile]);

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

	const tenant = toStaffTenantDetails(tenantQuery.data);
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

	if (detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending) {
		return <ProfileEditLoading />;
	}

	if (detailQuery.isError) {
		return <TenantProfileEditError error={detailQuery.error} />;
	}

	if (!profile) {
		return (
			<AppErrorView
				icon="🔎"
				code="404 — Not Found"
				title="Tenant profile not found"
				description="The profile payload was empty."
				testId="staff-tenant-profile-edit-not-found"
			/>
		);
	}

	const onSubmit = methods.handleSubmit(async (values) => {
		setServerError('');

		try {
			await updateProfile.mutateAsync({
				tenantId,
				profileId,
				name: values.name,
				description: values.description,
			});
			await queryClient.invalidateQueries({
				queryKey: STAFF_TENANT_PROFILES_QUERY_KEY,
			});
			void navigate({
				to: '/staff/tenants/$tenantId/profiles/$profileId',
				params: { tenantId, profileId },
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
			summary="Edit a tenant profile name and description without changing permissions."
			testId="staff-tenant-profile-edit-page"
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Link
						to={'/staff/tenants/$tenantId/profiles/$profileId' as never}
						params={{ tenantId, profileId } as never}
						className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
					>
						Back to profile
					</Link>
					<h2 className="text-2xl font-semibold text-foreground">
						Edit {profile.name}
					</h2>
					<p className="text-sm text-foreground-500">
						Update the profile name and optional description for this tenant.
					</p>
				</div>

				<Card className="space-y-4 p-5">
					<Form methods={methods} onSubmit={onSubmit}>
						<Field.Text
							name="name"
							label={t('profile-name')}
							placeholder="Approvers"
							disabled={updateProfile.isPending}
						/>
						<Field.Text
							name="description"
							label={t('description')}
							placeholder="Describe the responsibilities for this profile"
							disabled={updateProfile.isPending}
						/>
						{serverError ? (
							<p className="text-sm text-danger-600">{serverError}</p>
						) : null}
						<div className="flex justify-end">
							<Button
								type="submit"
								variant="primary"
								isDisabled={updateProfile.isPending}
							>
								Save changes
							</Button>
						</div>
					</Form>
				</Card>
			</div>
		</TenantDetailsPageShell>
	);
}
