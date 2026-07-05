import { Card } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import {
	toStaffTenantUserDetails,
	useStaffTenantUserDetailsQuery,
} from '~/lib/query/staff-tenant-users';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	DetailItem,
	formatDateTime,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from '../_tenant-details-shell';

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

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

const InvalidTenantUserView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="!"
		code="400 — Bad Request"
		title="Invalid tenant user link"
		description={getFailureDescription(
			error,
			'This tenant user link is malformed or incomplete.',
		)}
		testId="staff-tenant-user-details-invalid"
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
		testId="staff-tenant-user-details-not-found"
	/>
);

const StaffTenantUserDetailsError = ({ error }: { error: unknown }) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidTenantUserView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
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
			testId="staff-tenant-user-details-error"
		/>
	);
};

const TenantUserDetailsLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
		data-testid="staff-tenant-user-details-loading"
	>
		<div className="flex items-center gap-3 text-sm text-foreground-500">
			<div className="h-2 w-2 rounded-full bg-primary" />
			<span>Loading tenant user…</span>
		</div>
	</div>
);

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users/$userId',
)({
	component: StaffTenantUserDetailsPage,
});

function StaffTenantUserDetailsPage() {
	const { tenantId, userId } = Route.useParams();
	const { i18n } = useTranslation('common');

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

	if (tenantQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (tenantQuery.isError) {
		if (shouldLogoutForFailure(tenantQuery.error)) {
			return <LogoutRedirect />;
		}

		return <TenantDetailsError error={tenantQuery.error} />;
	}

	if (detailsQuery.isError && shouldLogoutForFailure(detailsQuery.error)) {
		return <LogoutRedirect />;
	}

	if (detailsQuery.isPending) {
		return <TenantUserDetailsLoading />;
	}

	const tenant = toStaffTenantDetails(tenantQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon="🔎"
				code="404 — Not Found"
				title="Tenant not found"
				description="The tenant payload was incomplete."
				testId="staff-tenant-details-empty"
			/>
		);
	}

	if (detailsQuery.isError) {
		return <StaffTenantUserDetailsError error={detailsQuery.error} />;
	}

	const user = toStaffTenantUserDetails(detailsQuery.data);
	if (!user) {
		return (
			<AppErrorView
				icon="🔎"
				code="404 — Not Found"
				title="Tenant user not found"
				description="The tenant user payload was empty."
				testId="staff-tenant-user-details-empty"
			/>
		);
	}

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="users"
			summary="Read-only tenant user details from the staff tenant users stack."
			testId="staff-tenant-user-details-page"
		>
			<div className="space-y-2">
				<Link
					to="/staff/tenants/$tenantId/users"
					params={{ tenantId }}
					className="text-sm text-foreground-500 underline-offset-4 hover:text-foreground hover:underline"
				>
					Back to users
				</Link>

				<div className="space-y-2">
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						{user.displayName}
					</h1>
					<p className="max-w-3xl text-sm text-foreground-500">
						{user.email || 'No email address available.'}
					</p>
				</div>
			</div>

			<Card className="space-y-4 p-5">
				<div className="grid gap-4 md:grid-cols-2">
					<DetailItem label="Email" value={user.email || '—'} />
					<DetailItem label="Account level" value={user.accountLevel ?? '—'} />
					<DetailItem label="Status" value={user.status ?? '—'} />
					<DetailItem label="User ID" value={user.id} />
					<DetailItem label="Tenant ID" value={user.tenantId ?? '—'} />
					<DetailItem label="Avatar URL" value={user.avatarUrl ?? '—'} />
				</div>
			</Card>

			<Card className="space-y-4 p-5">
				<div className="space-y-1">
					<p className="text-lg font-semibold text-foreground">Activity</p>
					<p className="text-sm text-foreground-500">
						Read-only activity timestamps for this tenant user.
					</p>
				</div>
				<div className="grid gap-4">
					{user.createdAt ? (
						<DetailItem
							label="Created"
							value={formatDateTime(user.createdAt, i18n.language)}
						/>
					) : null}
					{user.updatedAt ? (
						<DetailItem
							label="Updated"
							value={formatDateTime(user.updatedAt, i18n.language)}
						/>
					) : null}
					{!user.createdAt && !user.updatedAt ? (
						<div className="rounded-large border border-dashed border-divider bg-content1 p-4 text-sm text-foreground-500">
							No timestamps are available for this tenant user yet.
						</div>
					) : null}
				</div>
			</Card>
		</TenantDetailsPageShell>
	);
}
