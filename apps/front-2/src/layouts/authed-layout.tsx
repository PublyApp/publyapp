import { AppShell } from '../components/app-shell';

type AuthedLayoutProps = {
	children: React.ReactNode;
	pathname?: string;
};

export const AuthedLayout = ({ children, pathname }: AuthedLayoutProps) => {
	return (
		<AppShell mode="authed" pathname={pathname}>
			{children}
		</AppShell>
	);
};

export default AuthedLayout;
