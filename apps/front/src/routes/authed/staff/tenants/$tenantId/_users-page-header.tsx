import { IconPlus } from '@tabler/icons-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';

export const TenantUsersPageHeader = ({
	usersCount,
	onInvite,
	inviteButtonRef,
}: {
	usersCount: number | null;
	onInvite: () => void;
	/** #2291 M5: the invite drawer returns focus here when it closes,
	 * including when it was opened directly from a `?invite=1` URL. */
	inviteButtonRef?: RefObject<HTMLButtonElement | null>;
}) => {
	const { t } = useTranslation('common');

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div className="space-y-1">
				<h2 className="publy-type-page-title">
					{t('members')}
					{usersCount != null ? (
						<span className="ml-2 publy-profile-count-badge align-middle">
							{usersCount}
						</span>
					) : null}
				</h2>
				<p className="publy-type-helper">{t('tenant-users-tab-description')}</p>
			</div>
			<Button
				ref={inviteButtonRef}
				type="button"
				size="sm"
				variant="default"
				onClick={onInvite}
				data-testid="staff-tenant-users-invite"
			>
				<IconPlus aria-hidden="true" className="size-[15px]" />
				{t('invite-people')}
			</Button>
		</div>
	);
};
