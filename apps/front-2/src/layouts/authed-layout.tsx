import { useEffect, useState } from 'react';

import { AppShell } from '../components/app-shell';

type AuthedLayoutProps = {
	children: React.ReactNode;
};

export const AuthedLayout = ({ children }: AuthedLayoutProps) => {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setReady(true);
	}, []);

	if (!ready) {
		return null;
	}

	return <AppShell mode="authed">{children}</AppShell>;
};

export default AuthedLayout;
