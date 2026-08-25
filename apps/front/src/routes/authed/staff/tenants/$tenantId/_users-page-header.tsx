import { IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';

export const TenantUsersPageHeader = ({
	usersCount,
	onInvite,
}: {
	usersCount: number | null;
	onInvite: () => void;
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
			<Button type="button" size="sm" variant="default" onClick={onInvite}>
				<IconPlus aria-hidden="true" className="size-[15px]" />
				{t('invite-people')}
			</Button>
		</div>
	);
};
