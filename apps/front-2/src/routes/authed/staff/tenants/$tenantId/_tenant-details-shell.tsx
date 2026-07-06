import { Card, Chip, Spinner } from '@heroui/react';
import type { ReactNode } from 'react';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

export const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

const DATE_TIME_FORMAT_OPTIONS = {
	dateStyle: 'medium',
	timeStyle: 'short',
} as const;

export const formatDateTime = (
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

export const DetailItem = ({
	label,
	value,
}: {
	label: string;
	value: string;
}) => (
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

export const TenantDetailsLoading = () => (
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

export const TenantDetailsError = ({ error }: { error: unknown }) => {
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

export const TenantDetailsPageShell = ({
	tenant,
	activeSection,
	summary,
	testId,
	children,
}: {
	tenant: StaffTenantDetails;
	activeSection: 'basics' | 'profiles' | 'users';
	summary: string;
	testId: string;
	children: ReactNode;
}) => {
	const profilesHref = `/staff/tenants/${tenant.id}/profiles`;
	const usersHref = `/staff/tenants/${tenant.id}/users`;

	return (
		<div
			className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6"
			data-testid={testId}
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
						<p className="text-sm text-foreground-500">{summary}</p>
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
						isActive={activeSection === 'basics'}
					/>
					<SectionNavLink
						label="Profiles"
						href={profilesHref}
						isActive={activeSection === 'profiles'}
					/>
					<SectionNavLink
						label="Users"
						href={usersHref}
						isActive={activeSection === 'users'}
					/>
				</div>

				{children}
			</Card>
		</div>
	);
};
