import { AppShell } from '../components/app-shell';

type AuthLayoutProps = {
	children: React.ReactNode;
	pathname?: string;
};

export const AuthLayout = ({ children, pathname }: AuthLayoutProps) => {
	return (
		<AppShell mode="auth" pathname={pathname}>
			{children}
		</AppShell>
	);
};

export default AuthLayout;
