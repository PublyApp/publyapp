import { ConfirmDialog } from '~/components/ui/confirm-dialog';

import { type TranslateFn } from './_tenant-form-shared';

/** The leave-confirmation the tenant create and edit forms both raise from
 * `useBlocker`'s resolver. */
export const UnsavedChangesDialog = ({
	t,
	blocker,
}: {
	t: TranslateFn;
	blocker: {
		status: string;
		proceed?: () => void;
		reset?: () => void;
	};
}) => (
	<ConfirmDialog
		isOpen={blocker.status === 'blocked'}
		title={t('unsaved-changes-dialog-title')}
		description={t('unsaved-changes-dialog-description')}
		confirmLabel={t('leave-page')}
		cancelLabel={t('cancel')}
		tone="danger"
		onConfirm={() => blocker.proceed?.()}
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				blocker.reset?.();
			}
		}}
	/>
);
