import i18next from 'i18next';
import { Suspense } from 'react';
import { data, Outlet } from 'react-router';
import { SplashScreen } from '@/front/components/loading-screen/splash-screen';
import { useTranslate } from '@/front/hooks/use-translate';
import { AuthSplitLayout } from '@/front/layouts/auth-split/layout';
import type { Route } from './+types/auth-layout';

export const clientLoader = async (_: Route.ClientLoaderArgs) => {
	i18next.loadNamespaces(['zod', 'response-message']);
	return data({});
};

const AuthLayout = () => {
	const { t } = useTranslate();

	return (
		<Suspense fallback={<SplashScreen />}>
			<AuthSplitLayout
				slotProps={{
					section: { title: t('auth-welcome-title'), subtitle: '' },
				}}
			>
				<Outlet />
			</AuthSplitLayout>
		</Suspense>
	);
};

export default AuthLayout;

export const HydrateFallback = () => {
	return <SplashScreen />;
};
