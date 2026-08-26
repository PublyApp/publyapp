import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { useCanManageSocialAccounts } from '~/lib/permissions/use-has-tenant-permission';
import {
	toSocialAccountRows,
	useSocialAccountsQuery,
} from '~/lib/query/social-accounts';

/** Spec §3 workspace banner: persistent while any account is
 * `needs_reconnect`; names the account(s); the Reconnect button renders ONLY
 * for holders of `tenant.socialaccounts.manage` — everyone else gets the
 * message plus a link to the Integrations page. */
export const NeedsReconnectBanner = ({ tenantId }: { tenantId: string }) => {
	const { t } = useTranslation('settings');
	const accountsQuery = useSocialAccountsQuery({ tenantId });
	const rows = toSocialAccountRows(accountsQuery.data);
	const stalled = rows.filter((row) => row.statusWire === 'needs_reconnect');
	const canManage = useCanManageSocialAccounts();

	if (stalled.length === 0) {
		return null;
	}

	const handles = stalled.map((row) => row.displayHandle).join(', ');

	return (
		<div
			data-testid="needs-reconnect-banner"
			role="status"
			className="flex items-center justify-between gap-4 border-b border-(--publy-alert-warning-border) bg-(--publy-alert-warning-bg) px-4 py-2 text-(--publy-alert-warning-text)"
		>
			<p>
				{stalled.length === 1
					? t('banner-needs-reconnect-single', { handle: handles })
					: t('banner-needs-reconnect-plural', {
							count: stalled.length,
							handle: handles,
						})}
			</p>
			{canManage ? (
				<Button render={<Link to="/tenant/settings/integrations" />}>
					{t('reconnect')}
				</Button>
			) : (
				<Link to="/tenant/settings/integrations">{t('reconnect')}</Link>
			)}
		</div>
	);
};
