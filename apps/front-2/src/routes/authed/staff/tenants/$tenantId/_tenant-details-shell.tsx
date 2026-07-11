import {
	IconAlertCircle,
	IconArrowLeft,
	IconSearchOff,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
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

const LoadingSpinner = () => (
	<span
		role="status"
		aria-label="Loading"
		className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
	/>
);

export const DetailItem = ({
	label,
	value,
}: {
	label: string;
	value: string;
}) => (
	<div className="rounded-[14px] bg-card p-4 shadow-[var(--publy-shadow-ring)]">
		<p className="publy-type-metadata-label">{label}</p>
		<p className="mt-1.5 truncate text-[13px] font-medium text-foreground">
			{value}
		</p>
	</div>
);

type TenantSectionTo =
	| '/staff/tenants/$tenantId'
	| '/staff/tenants/$tenantId/users'
	| '/staff/tenants/$tenantId/profiles'
	| '/staff/tenants/$tenantId/invitations';

const SectionNavLink = ({
	label,
	to,
	tenantId,
	isActive = false,
}: {
	label: string;
	to: TenantSectionTo;
	tenantId: string;
	isActive?: boolean;
}) => {
	if (isActive) {
		return (
			<span
				aria-current="page"
				className="inline-flex items-center border-b-2 border-primary px-1 pb-2 text-[13px] font-medium text-foreground"
			>
				{label}
			</span>
		);
	}

	return (
		<Link
			to={to}
			params={{ tenantId }}
			className="inline-flex items-center border-b-2 border-transparent px-1 pb-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
		>
			{label}
		</Link>
	);
};

export const TenantDetailsLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
		data-testid="staff-tenant-details-loading"
	>
		<div className="flex items-center gap-3 text-sm text-muted-foreground">
			<LoadingSpinner />
			<span>Loading tenant…</span>
		</div>
	</div>
);

const BackToTenantsLink = () => (
	<Link to="/staff/tenants" className={buttonVariants({ variant: 'outline' })}>
		Back to tenants
	</Link>
);

/** Retry + Back-to-tenants action pair shared by every tenant-scoped 500
 * view (owner decision R3-4a, 2026-07-10 round 3). */
export const TenantRetryActions = ({ onRetry }: { onRetry: () => void }) => (
	<>
		<Button variant="default" onClick={onRetry} type="button">
			Try again
		</Button>
		<BackToTenantsLink />
	</>
);

const MissingTenantView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon={<IconSearchOff aria-hidden="true" className="size-7" />}
		code="404 — Not Found"
		title="Tenant not found"
		description={getFailureDescription(
			error,
			'The requested tenant does not exist or is no longer available.',
		)}
		testId="staff-tenant-details-not-found"
		embedded
		actions={<BackToTenantsLink />}
	/>
);

export const TenantDetailsError = ({
	error,
	onRetry,
}: {
	error: unknown;
	/** Refetches the tenant query that produced this error. Omit when no
	 * retry target is available at the call site. */
	onRetry?: () => void;
}) => {
	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)
	) {
		return <MissingTenantView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 embedded />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code="500 — Server Error"
			title="Unable to load this tenant"
			description="There was a problem loading the tenant details."
			testId="staff-tenant-details-error"
			tone="danger"
			embedded
			actions={
				onRetry ? (
					<TenantRetryActions onRetry={onRetry} />
				) : (
					<BackToTenantsLink />
				)
			}
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
	activeSection: 'basics' | 'profiles' | 'users' | 'invitations';
	summary: string;
	testId: string;
	children: ReactNode;
}) => {
	const { t } = useTranslation('common');

	return (
		<div
			className="publy-detail-page flex w-full flex-col gap-5"
			data-testid={testId}
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Link to="/staff/tenants" className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-staff-tenants')}
				</Link>
			</div>

			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex items-start gap-4">
					<InitialsAvatar name={tenant.name} size="lg" />
					<div className="min-w-0 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
								{tenant.name}
							</h1>
							<StatusPill tone={statusPillTone(tenant.status)}>
								{tenant.status ?? 'Unknown'}
							</StatusPill>
						</div>
						<p className="text-[13px] text-muted-foreground">{summary}</p>
					</div>
				</div>

				<div className="rounded-[14px] bg-card px-4 py-3 shadow-[var(--publy-shadow-ring)]">
					<p className="publy-type-metadata-label">Users</p>
					<p className="mt-1 text-xl font-semibold text-foreground">
						{tenant.usersCount}
					</p>
				</div>
			</header>

			<nav
				aria-label="Tenant sections"
				className="flex flex-wrap gap-4 border-b border-border"
			>
				<SectionNavLink
					label="Basics"
					to="/staff/tenants/$tenantId"
					tenantId={tenant.id}
					isActive={activeSection === 'basics'}
				/>
				<SectionNavLink
					label="Profiles"
					to="/staff/tenants/$tenantId/profiles"
					tenantId={tenant.id}
					isActive={activeSection === 'profiles'}
				/>
				<SectionNavLink
					label="Invitations"
					to="/staff/tenants/$tenantId/invitations"
					tenantId={tenant.id}
					isActive={activeSection === 'invitations'}
				/>
				<SectionNavLink
					label="Users"
					to="/staff/tenants/$tenantId/users"
					tenantId={tenant.id}
					isActive={activeSection === 'users'}
				/>
			</nav>

			<Card className="gap-5 p-5">{children}</Card>
		</div>
	);
};
