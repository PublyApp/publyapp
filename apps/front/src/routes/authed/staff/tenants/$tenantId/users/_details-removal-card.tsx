import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';

export const TenantUserRemovalCard = ({
	isRemoveDialogOpen,
	isAnyActionPending,
	isRemoveActionPending,
	onOpenRemoveDialog,
	onRemoveDialogOpenChange,
	onConfirmRemove,
}: {
	isRemoveDialogOpen: boolean;
	isAnyActionPending: boolean;
	isRemoveActionPending: boolean;
	onOpenRemoveDialog: () => void;
	onRemoveDialogOpenChange: (isOpen: boolean) => void;
	onConfirmRemove: () => void;
}) => {
	const { t } = useTranslation('common');

	return (
		<>
			<Card className="space-y-4 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
							{t('tenant-user-removal')}
						</p>
						<p className="text-sm text-foreground">
							{t('remove-user-from-tenant-description')}
						</p>
					</div>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={onOpenRemoveDialog}
						disabled={isAnyActionPending}
					>
						{t('remove-from-tenant')}
						{isRemoveActionPending ? '…' : ''}
					</Button>
				</div>
			</Card>

			<ConfirmDialog
				isOpen={isRemoveDialogOpen}
				title={t('remove-tenant-user-confirm-title')}
				description={t('remove-tenant-user-confirm-description')}
				confirmLabel={t('remove')}
				isPending={isRemoveActionPending}
				onConfirm={onConfirmRemove}
				onOpenChange={onRemoveDialogOpenChange}
			/>
		</>
	);
};
