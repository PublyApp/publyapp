import { IconAlertTriangle, IconPlugConnectedX } from '@tabler/icons-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';

interface NeedsReconnectAccount {
	id: string;
	displayHandle: string;
	lastError: string | null;
}

interface ReconnectBannerProps {
	accounts: NeedsReconnectAccount[];
	hasManagePermission: boolean;
	onReconnect: (accountId: string) => void;
}

/**
 * Workspace reconnect banner (Epic C §3/§5): names the first account that
 * needs reconnection (plus a "+N more" overflow), shows its stored sanitised
 * cause verbatim (transparent-failure rule), and offers the Reconnect action
 * only to manage-permission holders — viewers instead see who to ask.
 */
export const ReconnectBanner = ({
	accounts,
	hasManagePermission,
	onReconnect,
}: ReconnectBannerProps): ReactElement | null => {
	const { t } = useTranslation('social-accounts');

	if (accounts.length === 0) {
		return null;
	}

	const primary = accounts[0];
	const more = accounts.length - 1;

	return (
		<div
			data-testid="reconnect-banner"
			className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--publy-radius-medium-control)] border p-4 text-sm"
			style={{
				backgroundColor: 'var(--publy-alert-warning-bg)',
				borderColor: 'var(--publy-alert-warning-border)',
				color: 'var(--publy-alert-warning-text)',
			}}
		>
			<div className="flex min-w-0 items-start gap-2">
				<IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
				<div className="min-w-0">
					<p className="font-medium">
						{t('reconnect-banner-title', { handle: primary.displayHandle })}
					</p>
					<p className="mt-1 opacity-90">
						{primary.lastError ??
							t('reconnect-banner-description', {
								handle: primary.displayHandle,
							})}
						{more > 0 ? ` ${t('reconnect-banner-more', { count: more })}` : ''}
					</p>
					{!hasManagePermission && (
						<p className="mt-1 text-xs italic opacity-80">
							{t('reconnect-banner-contact-admin')}
						</p>
					)}
				</div>
			</div>
			{hasManagePermission && (
				<Button
					variant="outline"
					size="sm"
					data-testid="reconnect-banner-action"
					onClick={() => onReconnect(primary.id)}
				>
					<IconPlugConnectedX data-icon="inline-start" className="size-3.5" />
					{t('reconnect-banner-button')}
				</Button>
			)}
		</div>
	);
};
