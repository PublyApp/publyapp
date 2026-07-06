import { Card, Chip, Spinner } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';
const DATE_TIME_FORMAT_OPTIONS = {
	dateStyle: 'medium',
	timeStyle: 'short',
} as const;

const formatDateTime = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return value.toLocaleString(locale, DATE_TIME_FORMAT_OPTIONS);
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

const getStatusColor = (status: string | null) => {
	switch (status) {
		case 'Active':
			return 'success';
		case 'Pending':
			return 'warning';
		case 'Suspended':
			return 'danger';
		default:
			return 'default';
	}
};

const DetailItem = ({ label, value }: { label: string; value: string }) => (
	<div className="rounded-large border border-divider bg-content1 p-4">
		<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
			{label}
		</p>
		<p className="mt-2 text-sm font-medium text-foreground">{value}</p>
	</div>
);

const SectionNavLink = ({
	label,
	href,
	isActive = false,
}: {
	label: string;
	href: string;
	isActive?: boolean;
}) => {
	if (isActive) {
		return (
			<span
				aria-current="page"
				className="inline-flex rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
			>
				{label}
			</span>
		);
	}

	return (
		<a
			href={href}
			className="inline-flex rounded-full border border-divider px-3 py-1.5 text-sm font-medium text-foreground-600 transition hover:border-primary hover:text-primary"
		>
			{label}
		</a>
	);
};

const TenantDetailsLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
		data-testid="staff-tenant-details-loading"
	>
		<div className="flex items-center gap-3 text-sm text-foreground-500">
			<Spinner size="sm" />
			<span>Loading tenant…</span>
		</div>
	</div>
);

const InvalidTenantView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="!"
		code="400 — Bad Request"
		title="Invalid tenant link"
		description={getFailureDescription(
			error,
			'This tenant link is malformed or incomplete.',
		)}
		testId="staff-tenant-details-invalid"
	/>
);

const MissingTenantView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="🔎"
		code="404 — Not Found"
		title="Tenant not found"
		description={getFailureDescription(
			error,
			'The requested tenant does not exist or is no longer available.',
		)}
		testId="staff-tenant-details-not-found"
	/>
);

const TenantDetailsError = ({ error }: { error: unknown }) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidTenantView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	if (isProblemStatus(error, 404)) {
		return <MissingTenantView error={error} />;
	}

	return (
		<AppErrorView
			icon="!"
			code="500 — Server Error"
			title="Unable to load this tenant"
			description="There was a problem loading the tenant details."
			testId="staff-tenant-details-error"
		/>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/tenants/$tenantId')(
	{
		component: StaffTenantDetailsPage,
	},
);

function StaffTenantDetailsPage() {
	const { tenantId } = Route.useParams();
	const { i18n } = useTranslation('common');
	const query = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);

	if (query.isPending) {
		return <TenantDetailsLoading />;
	}

	if (query.isError) {
		if (shouldLogoutForFailure(query.error)) {
			return <LogoutRedirect />;
		}

		return <TenantDetailsError error={query.error} />;
	}

	const tenant = toStaffTenantDetails(query.data);
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

	const profilesHref = `/staff/tenants/${tenant.id}/profiles`;
	const usersHref = `/staff/tenants/${tenant.id}/users`;

	return (
		<div
			className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6"
			data-testid="staff-tenant-details-page"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<a
					href="/staff/tenants"
					className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
				>
					Back to tenants
				</a>
			</div>

			<Card className="space-y-6 p-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="space-y-3">
						<div className="flex flex-wrap items-center gap-3">
							<h1 className="text-3xl font-semibold text-foreground">
								{tenant.name}
							</h1>
							<Chip color={getStatusColor(tenant.status)} variant="soft">
								{tenant.status ?? 'Unknown'}
							</Chip>
						</div>
						<p className="text-sm text-foreground-500">
							Read-only basics for this tenant in the front-2 migration shell.
						</p>
					</div>

					<div className="rounded-large border border-divider bg-content1 p-4">
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
							Users
						</p>
						<p className="mt-2 text-2xl font-semibold text-foreground">
							{tenant.usersCount}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					<SectionNavLink
						label="Basics"
						href={`/staff/tenants/${tenant.id}`}
						isActive
					/>
					<SectionNavLink label="Profiles" href={profilesHref} />
					<SectionNavLink label="Users" href={usersHref} />
				</div>

				<div className="space-y-2">
					<h2 className="text-lg font-semibold text-foreground">Basics</h2>
					<p className="text-sm text-foreground-500">
						Core tenant metadata carried forward from the current staff details
						shell.
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					<DetailItem label="Code" value={tenant.code ?? '—'} />
					<DetailItem label="Status" value={tenant.status ?? '—'} />
					<DetailItem label="Users count" value={String(tenant.usersCount)} />
					<DetailItem label="Max users" value={String(tenant.maxUsers)} />
					<DetailItem
						label="Created at"
						value={formatDateTime(tenant.createdAt, i18n.language)}
					/>
					<DetailItem
						label="Updated at"
						value={formatDateTime(tenant.updatedAt, i18n.language)}
					/>
					{tenant.logoUrl ? (
						<DetailItem label="Logo URL" value={tenant.logoUrl} />
					) : null}
				</div>
			</Card>
		</div>
	);
}
