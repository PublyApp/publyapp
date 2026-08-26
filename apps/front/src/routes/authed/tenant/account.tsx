import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';

const ACCOUNT_TAB_ROUTE_SUFFIXES = ['security', 'notifications'] as const;
type AccountSection = 'profile' | (typeof ACCOUNT_TAB_ROUTE_SUFFIXES)[number];

// #818 F8: only the built Profile tab renders. Security and Notifications
// keep their routes registered (deep links work and the active-section
// derivation below still recognizes them) but ship no trigger until their
// APIs exist.

const getActiveSection = (pathname: string): AccountSection => {
	const match = ACCOUNT_TAB_ROUTE_SUFFIXES.find((suffix) =>
		pathname.endsWith(`/${suffix}`),
	);

	return match ?? 'profile';
};

const TenantAccountLayout = () => {
	const { t } = useTranslation('common');
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activeSection = getActiveSection(pathname);

	return (
		<div className="space-y-5" data-testid="tenant-account-page">
			<Tabs value={activeSection}>
				<TabsList variant="line">
					<TabsTrigger value="profile" render={<Link to="/tenant/account" />}>
						{t('profile')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value={activeSection} className="mt-5">
					<Outlet />
				</TabsContent>
			</Tabs>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/account')({
	// Always matched alongside a profile/security/notifications child (never
	// the deepest match on its own — see `deriveBreadcrumbTrail`), but the
	// contract requires every route to declare its own trail.
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'account-settings' }],
		i18nNamespaces: ['account'],
	},
	component: TenantAccountLayout,
});
