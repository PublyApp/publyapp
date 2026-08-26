import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import type { SocialAccountRow } from '~/lib/query/social-accounts';
import { useDisconnectSocialAccountMutation } from '~/lib/query/social-accounts';

/** Spec §3 Disconnect bullet: the confirmation STATES the consequences —
 * pause scheduled posts, erase the secret, keep publication history. */
export const DisconnectDialog = ({
	account,
	isOpen,
	onOpenChange,
	tenantId,
}: {
	account: SocialAccountRow;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	tenantId: string;
}) => {
	const { t } = useTranslation('settings');
	const disconnectMutation = useDisconnectSocialAccountMutation();

	return (
		<ConfirmDialog
			isOpen={isOpen}
			title={t('disconnect-title')}
			description={t('disconnect-consequences', {
				handle: account.displayHandle,
			})}
			confirmLabel={t('disconnect')}
			tone="danger"
			isPending={disconnectMutation.isPending}
			onConfirm={async () => {
				await disconnectMutation.mutateAsync({
					tenantId,
					socialAccountId: account.id,
				});
				onOpenChange(false);
			}}
			onOpenChange={onOpenChange}
		/>
	);
};
