import { IconAlertCircle } from '@tabler/icons-react';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { OfflineView } from '~/components/error-views/OfflineView';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import { useOnline } from '~/lib/hooks/use-online';
import { resolveQueryError } from '~/lib/server/query-error-resolver';

import { getFailureStatus } from './_api-problem-status';

export const AuthedLayoutErrorBoundary = ({
	error,
	reset,
}: {
	error: unknown;
	reset: () => void;
}) => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const online = useOnline();
	const routeStatus = getFailureStatus(error);
	const resolved = resolveQueryError(error, t, online);

	if (!online) {
		return <OfflineView reset={reset} />;
	}

	if (routeStatus === 401) {
		return <LogoutRedirect />;
	}

	if (routeStatus === 403) {
		return <View403 />;
	}

	if (routeStatus === 404) {
		return <View404 />;
	}

	const retry = () => {
		reset();
		void router.invalidate();
	};

	return (
		<AppErrorView
			error={error}
			kind={resolved.kind}
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('error-500-title')}
			description={t('error-500-description')}
			onRetry={retry}
		/>
	);
};
