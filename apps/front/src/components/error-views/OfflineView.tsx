import { IconWifiOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { AppErrorView } from './AppErrorView';

/**
 * The offline status screen: the shared classified surface, `info` tone and
 * `role="status"` because it fixes itself. It retries by itself as soon as
 * the browser reports the network back (inside `ErrorKindState`).
 */
export const OfflineView = ({
	reset,
	embedded = true,
}: {
	reset?: () => void;
	embedded?: boolean;
}) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			kind="offline"
			embedded={embedded}
			icon={<IconWifiOff aria-hidden="true" className="size-7" />}
			title={t('offline-title')}
			description={t('offline-description')}
			onRetry={reset}
		/>
	);
};
