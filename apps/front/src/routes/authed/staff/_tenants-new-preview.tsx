import { IconSparkles } from '@tabler/icons-react';
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

/**
 * The live preview (`Preview` in the prototype): the card on the right, a
 * raised surface holding the identity, the four status rows and the two
 * creation checks.
 */
export const TenantCreatePreviewCard = ({
	t,
	name,
	logoUrl,
	slugPreview,
	websiteHostname,
	maxUsers,
	counts,
}: {
	t: TranslateFn;
	name: string;
	logoUrl: string;
	slugPreview: string;
	websiteHostname: string | null;
	maxUsers: number;
	counts: TenantCreatePreviewCounts;
}) => {
	const displayName =
		name.trim().length > 0 ? name : t('untitled-organization');

	return (
		<aside className="flex flex-col gap-3 lg:sticky lg:top-0">
			<div
				className="flex flex-col rounded-[16px] bg-card p-1 shadow-[var(--publy-shadow-ring)]"
				data-testid="staff-tenant-create-preview"
			>
				<div className="flex items-center gap-1.5 px-3 pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					<IconSparkles aria-hidden="true" className="size-3.5" />
					{t('preview')}
				</div>
				<div className="flex flex-col gap-3 rounded-[var(--publy-radius-medium-control)] border bg-background p-3">
					<div className="flex items-center gap-3">
						<BrandTile
							name={name || t('untitled-organization')}
							logoUrl={logoUrl.trim().length > 0 ? logoUrl.trim() : null}
							className="size-10 shrink-0 rounded-lg text-[13px]"
						/>
						<div className="min-w-0">
							<p className="truncate font-medium">{displayName}</p>
							<p className="truncate font-mono text-xs text-muted-foreground">
								publyapp.com/
								{slugPreview.length > 0 ? slugPreview : '…'}
							</p>
							{websiteHostname ? (
								<p className="truncate text-xs text-muted-foreground">
									{websiteHostname}
								</p>
							) : null}
						</div>
					</div>

					<dl className="flex flex-col text-sm">
						<div className="flex h-9 items-center justify-between border-t">
							<dt className="text-muted-foreground">{t('status')}</dt>
							<dd>
								<StatusPill tone={statusPillTone('Pending')}>
									{t('pending')}
								</StatusPill>
							</dd>
						</div>
						<div className="flex h-9 items-center justify-between border-t">
							<dt className="text-muted-foreground">{t('seats')}</dt>
							<dd className="tabular-nums" data-testid="preview-seats">
								{counts.totalFilled} / {maxUsers}
							</dd>
						</div>
						<div className="flex h-9 items-center justify-between border-t">
							<dt className="text-muted-foreground">{t('owners')}</dt>
							<dd className="tabular-nums" data-testid="preview-owners">
								{counts.ownersCount}
							</dd>
						</div>
						<div className="flex h-9 items-center justify-between border-t">
							<dt className="text-muted-foreground">{t('members')}</dt>
							<dd className="tabular-nums" data-testid="preview-members">
								{counts.membersCount}
							</dd>
						</div>
					</dl>

					<ul
						className={cn(
							'flex flex-col gap-1.5 border-t pt-3 text-xs',
							counts.ownersCount + counts.membersCount === 0 &&
								'text-muted-foreground',
						)}
					>
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
							{t('preview-members-checklist', { count: counts.membersCount })}
						</ChecklistRow>
					</ul>
				</div>
			</div>
		</aside>
	);
};
