import { data, Outlet } from 'react-router';

import { AuthSplitLayout } from '@/front/layouts/auth-split/layout';
import { useTranslate } from '@/front/hooks/use-translate';
import type { Route } from './+types/auth-layout';
import i18next from 'i18next';

export const clientLoader = async (_: Route.ClientLoaderArgs) => {
	i18next.loadNamespaces(['zod']);
	return data({});
};

const AuthLayout = () => {
	const { t } = useTranslate();

	return (
		<AuthSplitLayout
			slotProps={{
				section: { title: t('auth-welcome-title'), subtitle: '' },
			}}
		>
			<Outlet />
		</AuthSplitLayout>
	);
};

export default AuthLayout;
