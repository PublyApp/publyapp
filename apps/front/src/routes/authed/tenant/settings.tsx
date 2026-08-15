import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';

const SETTINGS_TAB_ROUTE_SUFFIXES = [
	'members',
	'workspaces',
	'roles',
	'security',
	'integrations',
	'billing',
] as const;
type SettingsSection = 'general' | (typeof SETTINGS_TAB_ROUTE_SUFFIXES)[number];

const getActiveSection = (pathname: string): SettingsSection => {
	const match = SETTINGS_TAB_ROUTE_SUFFIXES.find((suffix) =>
		pathname.endsWith(`/${suffix}`),
	);

	return match ?? 'general';
};

export const Route = createFileRoute('/_authed-layout/tenant/settings')({
	// Always matched alongside a settings child (never the deepest match on
	// its own — see `deriveBreadcrumbTrail`), but the contract requires every
	// route to declare its own trail.
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'settings' }],
		i18nNamespaces: ['settings'],
	},
	component: TenantSettingsLayout,
});

/**
 * The tenant settings home: section tabs over the general, members,
 * workspaces, roles, security, integrations and billing pages. Every section
 * is read-only for now — no settings API exists, so each surface either
 * shows the tenant identity the workspace shell already resolved or an
 * honest coming-later state.
 */
function TenantSettingsLayout() {
	const { t } = useTranslation('common');
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activeSection = getActiveSection(pathname);

	return (
		<div className="space-y-5" data-testid="tenant-settings-page">
			<Tabs value={activeSection}>
				<TabsList variant="line">
					<TabsTrigger value="general" render={<Link to="/tenant/settings" />}>
						{t('general')}
					</TabsTrigger>
					<TabsTrigger
						value="members"
						render={<Link to="/tenant/settings/members" />}
					>
						{t('members')}
					</TabsTrigger>
					<TabsTrigger
						value="workspaces"
						render={<Link to="/tenant/settings/workspaces" />}
					>
						{t('workspaces')}
					</TabsTrigger>
					<TabsTrigger
						value="roles"
						render={<Link to="/tenant/settings/roles" />}
					>
						{t('roles-and-permissions')}
					</TabsTrigger>
					<TabsTrigger
						value="security"
						render={<Link to="/tenant/settings/security" />}
					>
						{t('security')}
					</TabsTrigger>
					<TabsTrigger
						value="integrations"
						render={<Link to="/tenant/settings/integrations" />}
					>
						{t('integrations')}
					</TabsTrigger>
					<TabsTrigger
						value="billing"
						render={<Link to="/tenant/settings/billing" />}
					>
						{t('billing')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value={activeSection} className="mt-5">
					<Outlet />
				</TabsContent>
			</Tabs>
		</div>
	);
}
