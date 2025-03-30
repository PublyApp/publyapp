import { Outlet } from 'react-router';

import { AuthSplitLayout } from '@/front/layouts/auth-split/layout';

const AuthLayout = () => {
	return (
		<AuthSplitLayout
			slotProps={{
				section: { title: 'Hi, Welcome back' },
			}}
		>
			<Outlet />
		</AuthSplitLayout>
	);
};

export default AuthLayout;
