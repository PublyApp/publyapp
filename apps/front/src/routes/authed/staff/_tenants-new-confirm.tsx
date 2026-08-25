import { ConfirmDialog } from '~/components/ui/confirm-dialog';

import { type TranslateFn } from './_tenant-form-shared';
import { buildPendingCreateSummary } from './_tenants-new-submit';
import { type TenantCreateFormValues } from './_tenants-new-types';

export const TenantCreateConfirmDialog = ({
	t,
	values,
	parsedMembersCount,
	isPending,
	onConfirm,
	onOpenChange,
}: {
	t: TranslateFn;
	values: TenantCreateFormValues | null;
	parsedMembersCount: number;
	isPending: boolean;
	onConfirm: () => void;
	onOpenChange: (isOpen: boolean) => void;
}) => {
	const summary = buildPendingCreateSummary({
		values,
		parsedMembersCount,
		assignedAfterCreationLabel: t('assigned-after-creation'),
	});

	return (
		<ConfirmDialog
			isOpen={values !== null}
			title={t('confirm-create-tenant-title')}
			description={t('confirm-create-tenant-description')}
			confirmLabel={t('create-tenant')}
			cancelLabel={t('cancel')}
			tone="primary"
			isPending={isPending}
			onConfirm={onConfirm}
			onOpenChange={onOpenChange}
		>
			<div
				className="flex flex-col divide-y divide-(--publy-row-border) text-[13px]"
				data-testid="confirm-create-tenant-summary"
			>
				<div className="flex items-center justify-between py-2">
					<span className="text-muted-foreground">{t('organization')}</span>
					<span className="max-w-[220px] truncate font-medium text-foreground">
						{values?.name}
					</span>
				</div>
				<div className="flex items-center justify-between py-2">
					<span className="text-muted-foreground">{t('workspace-slug')}</span>
					<span className="font-mono font-medium text-foreground">
						{summary.slugDisplay}
					</span>
				</div>
				<div className="flex items-center justify-between py-2">
					<span className="text-muted-foreground">{t('seats')}</span>
					<span className="font-medium text-foreground">
						{values?.maxUsers}
					</span>
				</div>
				<div className="flex items-center justify-between py-2">
					<span className="text-muted-foreground">{t('owners')}</span>
					<span
						className="font-medium text-foreground"
						data-testid="confirm-create-tenant-owners"
					>
						{summary.ownersCount}
					</span>
				</div>
				<div className="flex items-center justify-between py-2">
					<span className="text-muted-foreground">
						{t('members-to-invite')}
					</span>
					<span
						className="font-medium text-foreground"
						data-testid="confirm-create-tenant-members"
					>
						{summary.membersCount}
					</span>
				</div>
			</div>
		</ConfirmDialog>
	);
};
