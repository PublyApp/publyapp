import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { LoadingState } from '@/components/ui';
import { useAuth } from '@/lib/auth/auth-context';

const IndexScreen = () => {
	const { t } = useTranslation();
	const { status, tenantId } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (status !== 'signed-in') {
			return;
		}
		router.replace(tenantId ? '/posts' : '/tenants');
	}, [status, tenantId, router]);

	return <LoadingState label={t('mobile-opening')} />;
};

export default IndexScreen;
