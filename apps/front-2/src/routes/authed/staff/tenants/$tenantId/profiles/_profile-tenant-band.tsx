import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BrandTile } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { StaffTenantDetails } from '~/lib/query/staff-tenants';

import { formatTenantStatusLabel } from '../_tenant-details-shell';

export const ProfileTenantBand = ({
	tenant,
	tenantId,
}: {
	tenant: StaffTenantDetails;
	tenantId: string;
}) => {
	const { t } = useTranslation('staff-tenant-profiles');
	const { t: tCommon } = useTranslation('common');

	return (
		<section
			className="flex flex-wrap items-center gap-3 rounded-[var(--publy-radius-control)] bg-card px-4 py-3 shadow-[var(--publy-shadow-ring)]"
			data-testid="staff-tenant-profile-tenant-band"
		>
			<BrandTile
				name={tenant.name}
				logoUrl={tenant.logoUrl}
				className="size-8 rounded-[var(--publy-radius-small-control)] text-xs"
			/>
			<div className="min-w-0">
				<p className="truncate text-sm font-semibold text-foreground">
					{tenant.name}
				</p>
				<p className="font-mono text-xs text-muted-foreground">
					<span className="text-muted-foreground">publyapp.com/</span>
					{/* data-honesty-ignore: tenant code is a documented OPTIONAL field — a tenant without an assigned workspace slug has none, this is not fabricated identity data */}
					{tenant.code ?? '—'}
				</p>
			</div>
			<StatusPill tone={statusPillTone(tenant.status)}>
				{tenant.status
					? formatTenantStatusLabel(tenant.status, tCommon)
					: tCommon('status-unknown')}
			</StatusPill>
			<Link
				to="/staff/tenants/$tenantId"
				params={{ tenantId }}
				className="publy-record-link ml-auto text-sm"
			>
				{t('open-tenant')}
			</Link>
		</section>
	);
};
