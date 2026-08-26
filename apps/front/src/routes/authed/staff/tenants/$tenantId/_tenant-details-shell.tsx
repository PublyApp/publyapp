import {
	IconAlertCircle,
	IconArrowLeft,
	IconPencil,
	IconSearchOff,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { CopyButton } from '~/components/ui/copy-button';
import { BrandTile } from '~/components/ui/initials-avatar';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';
import { cn } from '~/lib/utils';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

export {
	MALFORMED_ID_TRANSLATION_KEY,
	formatTenantStatusLabel,
	formatTenantUserStatusLabel,
	tenantUserLevelChipClassName,
	formatTenantUserLevelLabel,
	formatDateTime,
	formatShortDate,
	formatMonthYear,
	getRelativeTimeParts,
} from './_tenant-display';
export type { RelativeTimeParts } from './_tenant-display';

import {
	MALFORMED_ID_TRANSLATION_KEY,
	formatMonthYear,
	formatTenantStatusLabel,
} from './_tenant-display';

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
	| '/staff/tenants/$tenantId/invitations'
	| '/staff/tenants/$tenantId/usage';

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
				className="inline-flex items-center border-b-2 border-primary px-3 pb-2.5 text-[13px] font-medium text-foreground"
			>
				{label}
			</span>
		);
	}

	return (
		<Link
			to={to}
			params={{ tenantId }}
			className="inline-flex items-center border-b-2 border-transparent px-3 pb-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
		>
			{label}
		</Link>
	);
};

export const TenantDetailsLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-details-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-tenant')}</span>
			</div>
		</div>
	);
};

export const BackToTenantsLink = () => {
	const { t } = useTranslation('common');

	return (
		<Link
			to="/staff/tenants"
			className={buttonVariants({ variant: 'outline' })}
		>
			{t('back-to-tenants')}
		</Link>
	);
};

/** Retry + Back-to-tenants action pair shared by every tenant-scoped 500
 * view (owner decision R3-4a, 2026-07-10 round 3). */
export const TenantRetryActions = ({ onRetry }: { onRetry: () => void }) => {
	const { t } = useTranslation('common');

	return (
		<>
			<Button variant="default" onClick={onRetry} type="button">
				{t('try-again')}
			</Button>
			<BackToTenantsLink />
		</>
	);
};

const MissingTenantView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-not-found-title')}
			description={getFailureDescription(
				error,
				t('tenant-not-found-description'),
			)}
			testId="staff-tenant-details-not-found"
			embedded
			actions={<BackToTenantsLink />}
		/>
	);
};

export const TenantDetailsError = ({
	error,
	onRetry,
}: {
	error: unknown;
	/** Refetches the tenant query that produced this error. Omit when no
	 * retry target is available at the call site. */
	onRetry?: () => void;
}) => {
	const { t } = useTranslation('common');

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
			code={t('error-500-code')}
			title={t('tenant-details-error-title')}
			description={t('tenant-details-error-description')}
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

/** 500-style view for a tenant query that succeeded but returned a payload
 * `toStaffTenantDetails` cannot interpret (missing/incomplete response).
 * Shared by the Basics/Profiles/Users/Invitations tab routes so each route
 * file stays under its size budget; identical markup and i18n keys to the
 * previous per-route copies. */
export const TenantDetailsIncomplete = ({
	onRetry,
	testId = 'staff-tenant-details-error',
}: {
	onRetry: () => void;
	testId?: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('tenant-details-error-title')}
			description={t('tenant-response-incomplete')}
			testId={testId}
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

export const TenantDetailsPageShell = ({
	tenant,
	activeSection,
	testId,
	children,
	summary,
	bodyScroll = 'page',
}: {
	tenant: StaffTenantDetails;
	activeSection: 'basics' | 'profiles' | 'users' | 'invitations' | 'usage';
	testId: string;
	children: ReactNode;
	/**
	 * Free-form description line rendered under the tabs. The redesigned
	 * Basics/Profiles/Invitations/Users tab routes (handoff 2c/3b) get their
	 * description from the identity header's meta line and omit this prop;
	 * out-of-scope create/invite/edit routes for profiles/invitations/users
	 * still pass it until their own packet restyles them.
	 */
	summary?: string;
	/**
	 * 'page' (default): the shell grows with its content and `.app-shell-main`
	 * owns scrolling — correct for card grids and free-flowing content
	 * (Basics, Profiles). 'contained': the shell is height-bound to
	 * `.app-shell-main` and the tab body becomes a `min-h-0` flex column, so a
	 * `DataTable` inside it owns its own scroll instead of the page (Users,
	 * Invitations) — see docs/guides/front/conventions.md "tables own their
	 * scroll".
	 */
	bodyScroll?: 'page' | 'contained';
}) => {
	const { t, i18n } = useTranslation('common');

	return (
		<div
			className={cn(
				'publy-detail-page flex w-full flex-col gap-5',
				bodyScroll === 'contained' && 'h-full min-h-0',
			)}
			data-body-scroll={bodyScroll}
			data-testid={testId}
		>
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
				<Link to="/staff/tenants" className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-staff-tenants')}
				</Link>
			</div>

			<header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
				<div className="flex items-start gap-4">
					<BrandTile name={tenant.name} logoUrl={tenant.logoUrl} />
					<div className="min-w-0 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="publy-tenant-identity-name">{tenant.name}</h1>
							<StatusPill tone={statusPillTone(tenant.status)}>
								{tenant.status
									? formatTenantStatusLabel(tenant.status, t)
									: t('unknown')}
							</StatusPill>
						</div>
						<p className="publy-tenant-identity-meta flex items-center gap-1">
							<span className="publy-tenant-identity-meta-prefix">
								publyapp.com/
							</span>
							<span className="publy-tenant-identity-meta-code">
								{/* data-honesty-ignore: tenant code is a documented OPTIONAL field — a tenant without an assigned workspace slug has none, this is not fabricated identity data */}
								{tenant.code ?? '—'}
							</span>
							{tenant.code ? (
								<CopyButton
									value={tenant.code}
									label={t('copy-slug')}
									testId="tenant-meta-code-copy"
								/>
							) : null}
							<span>
								{' '}
								·{' '}
								{t('tenant-member-count', {
									count: tenant.usersCount,
								})}{' '}
								· {t('tenant-owner-count', { count: tenant.ownersCount })} ·{' '}
								{t('since-date', {
									date: formatMonthYear(tenant.createdAt, i18n.language),
								})}
							</span>
						</p>
					</div>
				</div>

				<Link
					to="/staff/tenants/$tenantId/edit"
					params={{ tenantId: tenant.id }}
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					<IconPencil aria-hidden="true" className="size-4" />
					{t('edit')}
				</Link>
			</header>

			<nav
				aria-label={t('tenant-sections')}
				data-testid="tenant-sections-nav"
				className="flex shrink-0 flex-wrap gap-1 border-b border-border"
			>
				<SectionNavLink
					label={t('basics')}
					to="/staff/tenants/$tenantId"
					tenantId={tenant.id}
					isActive={activeSection === 'basics'}
				/>
				<SectionNavLink
					label={t('profiles')}
					to="/staff/tenants/$tenantId/profiles"
					tenantId={tenant.id}
					isActive={activeSection === 'profiles'}
				/>
				<SectionNavLink
					label={t('invitations')}
					to="/staff/tenants/$tenantId/invitations"
					tenantId={tenant.id}
					isActive={activeSection === 'invitations'}
				/>
				<SectionNavLink
					label={t('users')}
					to="/staff/tenants/$tenantId/users"
					tenantId={tenant.id}
					isActive={activeSection === 'users'}
				/>
				<SectionNavLink
					label={t('usage')}
					to="/staff/tenants/$tenantId/usage"
					tenantId={tenant.id}
					isActive={activeSection === 'usage'}
				/>
			</nav>

			{summary ? (
				<p className="text-sm text-muted-foreground">{summary}</p>
			) : null}

			{bodyScroll === 'contained' ? (
				<div className="publy-detail-tab-body">{children}</div>
			) : (
				children
			)}
		</div>
	);
};
