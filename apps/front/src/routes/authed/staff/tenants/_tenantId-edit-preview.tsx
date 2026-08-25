import { Card } from '~/components/ui/card';
import { BrandTile } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { type StaffTenantDetails } from '~/lib/query/staff-tenants';

import { type TranslateFn } from '../_tenant-form-shared';
import {
	formatShortDate,
	formatTenantStatusLabel,
} from './$tenantId/_tenant-details-shell';

export const TenantEditPreviewAside = ({
	t,
	language,
	tenant,
	previewName,
	previewLogoUrl,
	previewCode,
	previewMaxUsers,
	websiteHostname,
	lastActiveLabel,
}: {
	t: TranslateFn;
	language: string;
	tenant: StaffTenantDetails;
	previewName: string;
	previewLogoUrl: string | null;
	previewCode: string;
	previewMaxUsers: number;
	websiteHostname: string | null;
	lastActiveLabel: string;
}) => (
	<aside className="order-1 lg:order-2">
		<div className="lg:sticky lg:top-5">
			<Card className="gap-0 py-0" data-testid="staff-tenant-edit-preview">
				<div className="publy-card-header">
					<span className="publy-type-eyebrow">{t('preview')}</span>
				</div>

				<div className="flex items-center gap-3 px-[18px] py-4">
					<BrandTile
						name={previewName}
						logoUrl={previewLogoUrl}
						className="size-11 rounded-[12px] text-base"
					/>
					<div className="min-w-0">
						<p className="truncate text-[15px] font-semibold text-foreground">
							{previewName}
						</p>
						<p className="publy-tenant-identity-meta">
							<span className="publy-tenant-identity-meta-prefix">
								publyapp.com/
							</span>
							<span>{previewCode}</span>
						</p>
						{websiteHostname ? (
							<p className="truncate text-xs text-muted-foreground">
								{websiteHostname}
							</p>
						) : null}
					</div>
				</div>

				<div className="mx-[18px] h-px bg-(--publy-row-border)" />

				<div className="flex flex-col divide-y divide-(--publy-row-border) px-[18px]">
					<div className="flex items-center justify-between py-2.5 text-[13px]">
						<span className="text-muted-foreground">{t('status')}</span>
						<StatusPill tone={statusPillTone(tenant.status)}>
							{tenant.status
								? formatTenantStatusLabel(tenant.status, t)
								: t('unknown')}
						</StatusPill>
					</div>
					<div className="flex items-center justify-between py-2.5 text-[13px]">
						<span className="text-muted-foreground">{t('seats')}</span>
						<span
							className="font-medium text-foreground"
							data-testid="edit-preview-seats"
						>
							{tenant.usersCount} / {previewMaxUsers}
						</span>
					</div>
					<div className="flex items-center justify-between py-2.5 text-[13px]">
						<span className="text-muted-foreground">{t('owners')}</span>
						<span
							className="font-medium text-foreground"
							data-testid="edit-preview-owners"
						>
							{tenant.ownersCount}
						</span>
					</div>
					<div className="flex items-center justify-between py-2.5 text-[13px]">
						<span className="text-muted-foreground">{t('members')}</span>
						<span
							className="font-medium text-foreground"
							data-testid="edit-preview-members"
						>
							{tenant.usersCount}
						</span>
					</div>
				</div>
			</Card>
			<div
				className="mt-3 flex flex-col gap-1 text-[13px] text-muted-foreground"
				data-testid="edit-tenant-metadata"
			>
				<p>
					{t('created')}: {formatShortDate(tenant.createdAt, language)}
				</p>
				<p>
					{t('updated')}: {formatShortDate(tenant.updatedAt, language)}
				</p>
				<p>
					{t('last-active')}: {lastActiveLabel}
				</p>
			</div>
		</div>
	</aside>
);
