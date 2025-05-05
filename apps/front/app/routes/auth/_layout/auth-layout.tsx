import { Outlet } from 'react-router';

import { AuthSplitLayout } from '@/front/layouts/auth-split/layout';
import { useTranslate } from '@/front/hooks/use-translate';

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
