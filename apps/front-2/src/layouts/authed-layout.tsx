import { useEffect, useState } from 'react';

import { AppShell } from '../components/app-shell';

type AuthedLayoutProps = {
	children: React.ReactNode;
	pathname?: string;
};

export const AuthedLayout = ({ children, pathname }: AuthedLayoutProps) => {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setReady(true);
	}, []);

	if (!ready) {
		return null;
	}

	return (
		<AppShell mode="authed" pathname={pathname}>
			{children}
		</AppShell>
	);
};

export default AuthedLayout;
