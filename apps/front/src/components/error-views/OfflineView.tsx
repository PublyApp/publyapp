import { IconWifiOff } from '@tabler/icons-react';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { AppErrorView } from './AppErrorView';

/**
 * The offline status screen: the same ShopKart OS family, `info` tone, and
 * `role="status"` because it fixes itself. It retries by itself as soon as
 * the browser reports the network back.
 */
export const OfflineView = ({
	reset,
	embedded = true,
	details,
}: {
	reset?: () => void;
	embedded?: boolean;
	details?: string;
}) => {
	const { t } = useTranslation('common');
	const router = useRouter();

	const retry = () => {
		reset?.();
		void router.invalidate();
	};
	const onOnline = useEffectEvent(retry);
	useEffect(() => {
		const listener = () => onOnline();
		window.addEventListener('online', listener);
		return () => window.removeEventListener('online', listener);
	}, []);

	return (
		<AppErrorView
			embedded={embedded}
			role="status"
			tone="info"
			icon={<IconWifiOff aria-hidden="true" className="size-7" />}
			title={t('offline-title')}
			description={t('offline-description')}
			details={details}
			detailsLabel={details ? t('error-details') : undefined}
			onRetry={retry}
		/>
	);
};
