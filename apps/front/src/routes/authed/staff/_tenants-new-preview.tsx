import { Card } from '~/components/ui/card';
import { BrandTile } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { cn } from '~/lib/utils';

import { type TranslateFn } from './_tenant-form-shared';
import { ChecklistRow } from './_tenants-new-fields';

export type TenantCreatePreviewCounts = {
	ownersCount: number;
	membersCount: number;
	totalFilled: number;
	csvMembersCount: number;
	manualMembersCount: number;
};

export const TenantCreatePreviewCard = ({
	t,
	name,
	logoUrl,
	slugPreview,
	websiteHostname,
	maxUsers,
	seedDefaultProfile,
	counts,
}: {
	t: TranslateFn;
	name: string;
	logoUrl: string;
	slugPreview: string;
	websiteHostname: string | null;
	maxUsers: number;
	seedDefaultProfile: boolean;
	counts: TenantCreatePreviewCounts;
}) => (
	<aside className="order-1 lg:order-2">
		<div className="lg:sticky lg:top-5">
			<Card className="gap-0 py-0" data-testid="staff-tenant-create-preview">
				<div className="publy-card-header">
					<span className="publy-type-eyebrow">{t('preview')}</span>
				</div>

				<div className="flex items-center gap-3 px-[18px] py-4">
					<BrandTile
						name={name || t('untitled-organization')}
						logoUrl={logoUrl.trim().length > 0 ? logoUrl.trim() : null}
						className="size-11 rounded-[12px] text-base"
					/>
					<div className="min-w-0">
						<p className="truncate text-[15px] font-semibold text-foreground">
							{name.trim().length > 0 ? name : t('untitled-organization')}
						</p>
						<p className="publy-tenant-identity-meta">
							<span className="publy-tenant-identity-meta-prefix">
								publyapp.com/
							</span>
							<span
								className={cn('italic', slugPreview.length > 0 && 'not-italic')}
							>
								{slugPreview.length > 0
									? slugPreview
									: t('assigned-after-creation')}
							</span>
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
						<StatusPill tone={statusPillTone('Pending')}>
							{t('pending')}
						</StatusPill>
					</div>
					<div className="flex items-center justify-between py-2.5 text-[13px]">
						<span className="text-muted-foreground">{t('seats')}</span>
						<span
							className="font-medium text-foreground"
							data-testid="preview-seats"
						>
							{counts.totalFilled} / {maxUsers}
						</span>
					</div>
					<div className="flex items-center justify-between py-2.5 text-[13px]">
						<span className="text-muted-foreground">{t('owners')}</span>
						<span
							className="font-medium text-foreground"
							data-testid="preview-owners"
						>
							{counts.ownersCount}
						</span>
					</div>
					<div className="flex items-center justify-between py-2.5 text-[13px]">
						<span className="text-muted-foreground">{t('members')}</span>
						<span
							className="font-medium text-foreground"
							data-testid="preview-members"
						>
							{counts.membersCount}
						</span>
					</div>
				</div>

				<div className="mx-[18px] h-px bg-(--publy-row-border)" />

				<ul className="flex flex-col gap-2 px-[18px] py-4">
					<ChecklistRow
						checked={counts.ownersCount > 0}
						testId="preview-checklist-owners"
					>
						{t('preview-owners-checklist', { count: counts.ownersCount })}
					</ChecklistRow>
					<ChecklistRow
						checked={counts.membersCount > 0}
						testId="preview-checklist-members"
					>
						{t('preview-members-checklist-detailed', {
							count: counts.membersCount,
							csv: counts.csvMembersCount,
							manual: counts.manualMembersCount,
						})}
					</ChecklistRow>
					<ChecklistRow
						checked={seedDefaultProfile}
						testId="preview-checklist-profile"
					>
						{t('preview-default-profile-checklist')}
					</ChecklistRow>
				</ul>
			</Card>
		</div>
	</aside>
);
