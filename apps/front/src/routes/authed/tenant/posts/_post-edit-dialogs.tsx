import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';

import type { useUnsavedWorkGuard } from './_use-unsaved-work-guard';

/** The edit page's confirmations: leaving with unsaved work, and moving the
 * post to the bin. */
export const PostEditDialogs = ({
	blocker,
	isBinOpen,
	isBinPending,
	onConfirmBin,
	onBinOpenChange,
}: {
	blocker: ReturnType<typeof useUnsavedWorkGuard>;
	isBinOpen: boolean;
	isBinPending: boolean;
	onConfirmBin: () => void;
	onBinOpenChange: (open: boolean) => void;
}) => {
	const { t } = useTranslation(['posts', 'common']);

	return (
		<>
			{blocker.status === 'blocked' ? (
				<ConfirmDialog
					isOpen
					title={t('posts:unsaved-changes-title')}
					description={t('posts:unsaved-changes-description')}
					confirmLabel={t('common:leave')}
					cancelLabel={t('common:stay')}
					onConfirm={() => blocker.proceed?.()}
					onOpenChange={(o) => {
						if (!o) {
							blocker.reset?.();
						}
					}}
				/>
			) : null}
			<ConfirmDialog
				isOpen={isBinOpen}
				title={t('posts:move-to-bin')}
				description={t('posts:move-to-bin-confirm')}
				confirmLabel={t('posts:move-to-bin')}
				isPending={isBinPending}
				onConfirm={onConfirmBin}
				onOpenChange={onBinOpenChange}
			/>
		</>
	);
};
