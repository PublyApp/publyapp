import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';

import { InviteTenantUserDrawer } from './_invite-user-drawer';

export const InviteTenantUserDrawerHost = ({
	tenantId,
	isOpen,
	onOpenChange,
	onInvited,
	onSessionExpired,
}: {
	tenantId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onInvited?: () => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const [isInviteFormDirty, setIsInviteFormDirty] = useState(false);
	const inviteDrawerNavBypassRef = useRef(false);
	const inviteDrawerBlocker = useBlocker({
		shouldBlockFn: () =>
			isOpen && isInviteFormDirty && !inviteDrawerNavBypassRef.current,
		withResolver: true,
	});

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		inviteDrawerNavBypassRef.current = false;
	}, [isOpen]);

	const setInviteDrawerOpen = (nextOpen: boolean): void => {
		inviteDrawerNavBypassRef.current = !nextOpen;
		onOpenChange(nextOpen);
	};

	const handleInvited = () => {
		setInviteDrawerOpen(false);
		onInvited?.();
	};

	return (
		<>
			<InviteTenantUserDrawer
				tenantId={tenantId}
				isOpen={isOpen}
				onOpenChange={setInviteDrawerOpen}
				onInvited={handleInvited}
				onSessionExpired={onSessionExpired}
				onDirtyChange={setIsInviteFormDirty}
			/>
			<ConfirmDialog
				isOpen={inviteDrawerBlocker.status === 'blocked'}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				tone="danger"
				onConfirm={() => inviteDrawerBlocker.proceed?.()}
				onOpenChange={(isDialogOpen) => {
					if (!isDialogOpen) {
						inviteDrawerBlocker.reset?.();
					}
				}}
			/>
		</>
	);
};
