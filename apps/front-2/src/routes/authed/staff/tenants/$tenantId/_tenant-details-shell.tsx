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
import { Button, buttonVariants } from '~/components/ui/button';
import { CopyButton } from '~/components/ui/copy-button';
import { BrandTile } from '~/components/ui/initials-avatar';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';
import { cn } from '~/lib/utils';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

export const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

/** Formats the raw backend tenant status (e.g. `"Active"`) for display — the
 * identity header must not render the unlocalized backend string directly. */
export const formatTenantStatusLabel = (
	status: string,
	t: (key: string) => string,
): string => {
	const normalized = status.trim().toLowerCase();
	if (normalized === 'active') {
		return t('status-active');
	}
	if (normalized === 'suspended') {
		return t('status-suspended');
	}
	if (normalized === 'pending') {
		return t('status-pending');
	}
	return status;
};

/** Backend row status is PascalCase (`Active`/`Suspended`/`GloballySuspended`);
 * the `t()` keys are the honest display labels for those three values only. */
export const formatTenantUserStatusLabel = (
	status: string | null,
	t: (key: string) => string,
): string => {
	const normalized = status?.trim().toLowerCase() ?? '';
	if (normalized === 'active') {
		return t('status-active');
	}
	if (normalized === 'suspended') {
		return t('status-suspended');
	}
	if (
		normalized === 'globallysuspended' ||
		normalized === 'globally_suspended'
	) {
		return t('status-globally-suspended');
	}
	return status ?? t('status-unknown');
};

export const tenantUserLevelChipClassName = (level: string | null): string =>
	(level ?? '').trim().toLowerCase() === 'admin'
		? 'publy-detail-chip publy-detail-chip--amber'
		: 'publy-detail-chip publy-detail-chip--outline';

export const formatTenantUserLevelLabel = (
	level: string | null,
	t: (key: string) => string,
): string => {
	const normalized = level?.trim().toLowerCase() ?? '';
	if (normalized === 'admin') {
		return t('admin');
	}
	if (normalized === 'user') {
		return t('user');
	}
	return level ?? '—';
};

const DATE_TIME_FORMAT_OPTIONS = {
	dateStyle: 'medium',
	timeStyle: 'short',
} as const;

const SHORT_DATE_FORMAT_OPTIONS = {
	dateStyle: 'medium',
} as const;

const MONTH_YEAR_FORMAT_OPTIONS = {
	month: 'short',
	year: 'numeric',
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

export const formatShortDate = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return value.toLocaleString(locale, SHORT_DATE_FORMAT_OPTIONS);
};

export const formatMonthYear = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return value.toLocaleString(locale, MONTH_YEAR_FORMAT_OPTIONS);
};

export type RelativeTimeParts = {
	key: 'minutes-ago' | 'hours-ago' | 'days-ago' | 'months-ago' | 'years-ago';
	count: number;
};

/** Coarse "x ago" magnitude for stat-card secondary rows — a helper caption,
 * not a billing-precision calculation, so 30-day months are fine. */
export const getRelativeTimeParts = (
	value: Date | null | undefined,
	now: Date = new Date(),
): RelativeTimeParts | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	const diffMs = Math.max(now.getTime() - value.getTime(), 0);
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 60) {
		return { key: 'minutes-ago', count: Math.max(minutes, 1) };
	}

	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return { key: 'hours-ago', count: hours };
	}

	const days = Math.floor(hours / 24);
	if (days < 30) {
		return { key: 'days-ago', count: days };
	}

	const months = Math.floor(days / 30);
	if (months < 12) {
		return { key: 'months-ago', count: months };
	}

	const years = Math.floor(months / 12);
	return { key: 'years-ago', count: years };
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

export const TenantDetailsPageShell = ({
	tenant,
	activeSection,
	testId,
	children,
	summary,
	bodyScroll = 'page',
}: {
	tenant: StaffTenantDetails;
	activeSection: 'basics' | 'profiles' | 'users' | 'invitations';
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
	 * Invitations) — see docs/guides/front-2/conventions.md "tables own their
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
								· {t('tenant-member-count', { count: tenant.usersCount })} ·{' '}
								{t('tenant-owner-count', { count: tenant.ownersCount })} ·{' '}
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
