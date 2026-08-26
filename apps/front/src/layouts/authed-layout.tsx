import { AppShell } from '../components/app-shell';

type AuthedLayoutProps = {
	children: React.ReactNode;
	pathname?: string;
	search?: Record<string, unknown>;
};

export const AuthedLayout = ({
	children,
	pathname,
	search,
}: AuthedLayoutProps) => {
	return (
		<AppShell mode="authed" pathname={pathname} search={search}>
			{children}
		</AppShell>
	);
};
