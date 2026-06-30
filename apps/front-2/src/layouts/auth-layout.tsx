import { AppShell } from '../components/app-shell';

type AuthLayoutProps = {
	children: React.ReactNode;
};

export const AuthLayout = ({ children }: AuthLayoutProps) => {
	return <AppShell mode="auth">{children}</AppShell>;
};

export default AuthLayout;
