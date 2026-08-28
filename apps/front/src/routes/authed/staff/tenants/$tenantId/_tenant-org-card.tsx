import { Link } from '@tanstack/react-router';
import { type ReactNode } from 'react';
import { CopyButton } from '~/components/ui/copy-button';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';
import {
	formatShortDate,
	formatTenantStatusLabel,
	getRelativeTimeParts,
} from '~/routes/authed/staff/tenants/$tenantId/_tenant-details-shell';
import {
	getWebsiteHostname,
	isAbsoluteHttpUrl,
} from '~/routes/authed/staff/tenants/tenant-organization-profile-fields';

const OrgField = ({
	label,
	value,
	mono,
	copyValue,
	copyLabel,
	copyTestId,
}: {
	label: string;
	value: ReactNode;
	mono?: boolean;
	copyValue?: string;
	copyLabel?: string;
	copyTestId?: string;
}) => (
	<div className="space-y-1.5">
		<div className="publy-type-metadata-label">{label}</div>
		<div className="flex items-center gap-1.5">
			<div
				className={
					mono
						? 'publy-type-metadata-value font-mono'
						: 'publy-type-metadata-value'
				}
			>
				{value}
			</div>
			{copyValue ? (
				<CopyButton
					value={copyValue}
					label={copyLabel ?? label}
					testId={copyTestId}
				/>
			) : null}
		</div>
	</div>
);

const formatLastActive = (
	value: Date | null,
	t: (key: string, options?: Record<string, unknown>) => string,
): string => {
	const parts = getRelativeTimeParts(value);
	// data-honesty-ignore: relative-time "never active" fallback, not a fabricated identity
	if (parts) return t(parts.key, { count: parts.count });
	return '—';
};

export const OrganizationCard = ({
	tenant,
	locale,
	t,
}: {
	tenant: StaffTenantDetails;
	locale: string;
	t: (key: string, options?: Record<string, unknown>) => string;
}) => {
	const websiteHostname =
		tenant.websiteUrl && isAbsoluteHttpUrl(tenant.websiteUrl)
			? getWebsiteHostname(tenant.websiteUrl)
			: null;

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-card shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('organization')}</p>
				<Link
					to="/staff/tenants/$tenantId/edit"
					params={{ tenantId: tenant.id }}
					className="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					{t('edit')}
				</Link>
			</div>
			<div className="grid grid-cols-1 gap-4 px-4 pb-4 pt-3 md:grid-cols-3">
				<OrgField label={t('name')} value={tenant.name} />
				{/* data-honesty-ignore: legal name is a documented OPTIONAL field — a tenant without a registered legal name has none, this is not fabricated identity data */}
				<OrgField label={t('legal-name')} value={tenant.legalName ?? '—'} />
				<OrgField
					label={t('code')}
					// data-honesty-ignore: tenant code is a documented OPTIONAL field — a tenant without an assigned workspace slug has none, this is not fabricated identity data
					value={tenant.code ?? '—'}
					mono
					copyValue={tenant.code ?? undefined}
					copyLabel={t('copy-slug')}
					copyTestId="tenant-code-copy"
				/>
				<OrgField
					label={t('tenant-id')}
					value={tenant.id}
					mono
					copyValue={tenant.id}
					copyLabel={t('copy-tenant-id')}
					copyTestId="tenant-id-copy"
				/>
				<OrgField
					label={t('status')}
					value={
						<StatusPill tone={statusPillTone(tenant.status)}>
							{tenant.status
								? formatTenantStatusLabel(tenant.status, t)
								: t('unknown')}
						</StatusPill>
					}
				/>
				<OrgField
					label={t('created')}
					value={formatShortDate(tenant.createdAt, locale)}
				/>
				<OrgField
					label={t('updated')}
					value={formatShortDate(tenant.updatedAt, locale)}
				/>
				<OrgField
					label={t('last-active')}
					value={formatLastActive(tenant.lastActivityAt, t)}
				/>
				{websiteHostname ? (
					<OrgField
						label={t('website')}
						value={
							<a
								href={tenant.websiteUrl ?? undefined}
								target="_blank"
								rel="noreferrer"
								className="publy-record-link no-underline"
							>
								{websiteHostname}
							</a>
						}
					/>
				) : null}
			</div>
		</section>
	);
};
