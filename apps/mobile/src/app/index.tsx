import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { LoadingState } from '@/components/ui';
import { useAuth } from '@/lib/auth/auth-context';

const IndexScreen = () => {
	const { status, tenantId } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (status !== 'signed-in') {
			return;
		}
		router.replace(tenantId ? '/posts' : '/tenants');
	}, [status, tenantId, router]);

	return <LoadingState label="Ouverture…" />;
};

export default IndexScreen;
