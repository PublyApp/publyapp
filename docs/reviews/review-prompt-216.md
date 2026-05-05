I need you to review a frontend refactoring PR for a React + MUI v6 multi-tenant SaaS app. The change aligns the **staff admin tenant detail page** (horizontal MUI Tabs layout) with the **tenant org settings page** (sticky sidebar layout), creating shared components and consolidating duplicated code.

**Commit:** `feat(front): align staff tenant detail with org settings sidebar layout (#216)`
**Stats:** 14 files changed, 427 insertions, 358 deletions (3 new files, 11 modified)
**Branch:** `feat/align-tenant-detail-settings-layout`

## What was done (4 phases)

**Phase 1 — Shared component extraction:**
- `components/settings/form-row.tsx` — extracted from inline definition in `settings-general-page.tsx`
- `components/settings/settings-nav.tsx` — moved from `routes/authed/tenant/settings/_layout/settings-nav.tsx` to shared location
- `components/settings/sidebar-settings-layout.tsx` — new shared layout wrapping `DashboardContent` + sticky sidebar + `<Outlet />`

**Phase 2 — Staff layout refactor:**
- `tenant-details-layout.tsx` — replaced MUI `Tabs`/`Tab` with `SidebarSettingsLayout` + breadcrumbs; removed `CreateUserButton`/`CreateProfileButton` from layout
- Action buttons (New User / New Profile drawers) relocated into their respective section pages
- Each section page now gets a `SettingsPageHeader`
- Billing tab uncommented in sidebar nav

**Phase 3 — General tab redesign:**
- Replaced `TenantCreateOrEditForm` usage with Card + FormRow pattern (Logo, Name, Tenant ID, Max Users)
- Added Danger Zone card with Suspend/Delete buttons (disabled — endpoints don't exist yet)
- Kept `TenantCreateOrEditForm` for the create page

**Phase 4 — Tenant-side consolidation:**
- `settings-layout.tsx` and `account-layout.tsx` — replaced duplicated 30+ line Box/flex/sticky sidebar pattern with single `<SidebarSettingsLayout items={navItems} />`
- `settings-general-page.tsx` — replaced inline `FormRow` with import from shared
- Old `settings-nav.tsx` now re-exports from shared location

## Project coding standards to check against

- MUI v6 only — no native HTML elements (`<div>` → `<Box>`, etc.)
- `sx` prop for all styling — no Tailwind or `className`
- Arrow function components only — no `function` declarations
- i18n: all user-facing strings must use `t()` translation keys
- No `Array.reduce()` — use `find`, `filter+map`, `for...of`, or `Object.groupBy`

## What to review

1. **Component API design** — Are the shared component interfaces (`FormRow`, `SettingsNav`, `SidebarSettingsLayout`) well-designed? Props make sense? Extensible without over-engineering?
2. **Duplication elimination** — Did the consolidation actually remove all duplication? Any remaining copy-paste?
3. **Backwards compatibility** — The old `settings-nav.tsx` re-exports from shared. Is this the right approach or should the old file be deleted with all imports updated?
4. **General tab design** — The Card + FormRow + Danger Zone pattern. Are there any UX or code issues?
5. **Drawer relocation** — Action buttons + drawers moved from layout into section pages. Does this create any state management concerns?
6. **i18n** — Are all strings properly translated? Any hardcoded text?
7. **Mobile responsiveness** — Sidebar hidden on mobile (`display: { xs: 'none', md: 'block' }`). Is there a mobile fallback?
8. **Dead code** — Was all removed code actually unused? Any accidental deletions?
9. **TypeScript types** — Any type issues, missing types, or `any` usage?
10. **Edge cases** — What happens when `tenantId` is undefined? Error states handled properly?

## Full diff

```diff
diff --git a/apps/front/src/components/settings/form-row.tsx b/apps/front/src/components/settings/form-row.tsx
new file mode 100644
index 00000000..114e5417
--- /dev/null
+++ b/apps/front/src/components/settings/form-row.tsx
@@ -0,0 +1,32 @@
+import Box from '@mui/material/Box';
+import Typography from '@mui/material/Typography';
+
+type FormRowProps = {
+	label: string;
+	description?: string;
+	children: React.ReactNode;
+};
+
+export const FormRow = ({ label, description, children }: FormRowProps) => (
+	<Box
+		sx={{
+			display: 'grid',
+			gridTemplateColumns: { xs: '1fr', md: '240px 1fr' },
+			gap: { xs: 1.5, md: 3 },
+			alignItems: 'flex-start',
+			py: 2,
+		}}
+	>
+		<Box>
+			<Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
+				{label}
+			</Typography>
+			{description && (
+				<Typography variant="caption" sx={{ color: 'text.secondary' }}>
+					{description}
+				</Typography>
+			)}
+		</Box>
+		<Box>{children}</Box>
+	</Box>
+);
diff --git a/apps/front/src/components/settings/settings-nav.tsx b/apps/front/src/components/settings/settings-nav.tsx
new file mode 100644
index 00000000..53e8c216
--- /dev/null
+++ b/apps/front/src/components/settings/settings-nav.tsx
@@ -0,0 +1,52 @@
+import Box from '@mui/material/Box';
+
+import { RouterLink } from '@/front/components/router-link';
+import useMatchPath from '@/front/hooks/use-match-path';
+
+export type SettingsNavItem = {
+	label: string;
+	href: string;
+	/** If true, match sub-paths as active (default: false for exact match) */
+	deep?: boolean;
+};
+
+type SettingsNavProps = {
+	items: SettingsNavItem[];
+};
+
+export const SettingsNav = ({ items }: SettingsNavProps) => {
+	const matchPath = useMatchPath();
+
+	return (
+		<Box component="nav">
+			<Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
+				{items.map((item) => {
+					const { active: isActive } = matchPath(item.href, item.deep ?? false);
+
+					return (
+						<Box component="li" key={item.href}>
+							<Box
+								component={RouterLink}
+								href={item.href}
+								sx={{
+									display: 'block',
+									py: 0.75,
+									textDecoration: 'none',
+									color: isActive ? 'primary.main' : 'text.secondary',
+									fontWeight: isActive ? 600 : 400,
+									fontSize: '0.875rem',
+									transition: 'color 0.15s ease-in-out',
+									'&:hover': {
+										color: 'primary.main',
+									},
+								}}
+							>
+								{item.label}
+							</Box>
+						</Box>
+					);
+				})}
+			</Box>
+		</Box>
+	);
+};
diff --git a/apps/front/src/components/settings/sidebar-settings-layout.tsx b/apps/front/src/components/settings/sidebar-settings-layout.tsx
new file mode 100644
index 00000000..9225ef85
--- /dev/null
+++ b/apps/front/src/components/settings/sidebar-settings-layout.tsx
@@ -0,0 +1,52 @@
+import Box from '@mui/material/Box';
+import type { Breakpoint } from '@mui/material/styles';
+import { Outlet } from 'react-router';
+
+import { DashboardContent } from '@/front/layouts/dashboard/content';
+
+import { SettingsNav, type SettingsNavItem } from './settings-nav';
+
+type SidebarSettingsLayoutProps = {
+	items: SettingsNavItem[];
+	maxWidth?: Breakpoint;
+	breadcrumbs?: React.ReactNode;
+};
+
+export const SidebarSettingsLayout = ({
+	items,
+	maxWidth = 'lg',
+	breadcrumbs,
+}: SidebarSettingsLayoutProps) => (
+	<DashboardContent maxWidth={maxWidth} compact>
+		{breadcrumbs}
+
+		<Box
+			sx={{
+				display: 'flex',
+				gap: 4,
+				flexDirection: { xs: 'column', md: 'row' },
+			}}
+		>
+			{/* Left Navigation - Sticky */}
+			<Box
+				sx={{
+					display: { xs: 'none', md: 'block' },
+					flexShrink: 0,
+					width: 200,
+					position: 'sticky',
+					top: 80,
+					alignSelf: 'flex-start',
+					maxHeight: 'calc(100vh - 100px)',
+					overflowY: 'auto',
+				}}
+			>
+				<SettingsNav items={items} />
+			</Box>
+
+			{/* Main Content */}
+			<Box sx={{ flex: 1, minWidth: 0 }}>
+				<Outlet />
+			</Box>
+		</Box>
+	</DashboardContent>
+);
diff --git a/apps/front/src/routes/authed/staff/tenants/details/_layout/tenant-details-layout.tsx b/apps/front/src/routes/authed/staff/tenants/details/_layout/tenant-details-layout.tsx
index c91f6e20..a287dfa0 100644
--- a/apps/front/src/routes/authed/staff/tenants/details/_layout/tenant-details-layout.tsx
+++ b/apps/front/src/routes/authed/staff/tenants/details/_layout/tenant-details-layout.tsx
@@ -1,21 +1,13 @@
-import Button from '@mui/material/Button';
-import Drawer from '@mui/material/Drawer';
-import Tab from '@mui/material/Tab';
-import Tabs from '@mui/material/Tabs';
 import type { TFunction } from 'i18next';
 import i18next from 'i18next';
 import _ from 'lodash';
-import { useBoolean } from 'minimal-shared/hooks';
-import { removeLastSlash } from 'minimal-shared/utils';
 import { useMemo } from 'react';
-import { data, Outlet, useParams } from 'react-router';
+import { data, useParams } from 'react-router';

 import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
-import { Iconify } from '@/front/components/iconify/iconify';
-import { RouterLink } from '@/front/components/router-link';
-import { usePathname } from '@/front/hooks/use-pathname';
+import type { SettingsNavItem } from '@/front/components/settings/settings-nav';
+import { SidebarSettingsLayout } from '@/front/components/settings/sidebar-settings-layout';
 import { useTranslate } from '@/front/hooks/use-translate';
-import { DashboardContent } from '@/front/layouts/dashboard/content';
 import { getServerLoader } from '@/front/lib/react-router/server-data.server';
 import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

@@ -61,164 +53,38 @@ export const loader = getServerLoader({

 const TenantDetailsLayout = () => {
 	const { t } = useTranslate();
-	const pathname = usePathname();
 	const { tenantId } = useParams();

-	const { NAV_ITEMS, ACTIONS } = useMemo(() => {
-		const tenantDetailPaths = FRONT_PATH_NAMES.staff.tenants.details(tenantId);
+	const navItems: SettingsNavItem[] = useMemo(() => {
+		const paths = FRONT_PATH_NAMES.staff.tenants.details(tenantId);

-		const NAV_ITEMS = [
-			{
-				label: t('general'),
-				icon: <Iconify width={24} icon="solar:buildings-bold" />,
-				href: tenantDetailPaths.tabs.general,
-			},
-			// {
-			// 	label: t('billing'),
-			// 	icon: <Iconify width={24} icon="solar:bill-list-bold" />,
-			// 	href: tenantDetailPaths.tabs.billing,
-			// },
-			{
-				label: t('users'),
-				icon: <Iconify width={24} icon="solar:users-group-rounded-bold" />,
-				href: tenantDetailPaths.tabs.users,
-				action: <CreateUserButton />,
-			},
+		return [
+			{ label: t('general'), href: paths.tabs.general },
+			{ label: t('users'), href: paths.tabs.users, deep: true },
 			{
 				label: t('profiles'),
-				icon: <Iconify width={24} icon="solar:settings-bold" />,
-				href: tenantDetailPaths.tabs.profiles,
-				action: <CreateProfileButton />,
+				href: paths.tabs.profiles,
+				deep: true,
 			},
+			{ label: t('billing'), href: paths.tabs.billing, deep: true },
 		];
-
-		const ACTIONS = {} as Record<string, React.ReactNode>;
-
-		_.forEach(NAV_ITEMS, (item) => {
-			if (item.action) {
-				ACTIONS[item.href] = item.action;
-			}
-		});
-
-		return { NAV_ITEMS, ACTIONS };
 	}, [t, tenantId]);

-	const tabValue = useMemo(() => {
-		const value = removeLastSlash(pathname);
-		return value;
-	}, [pathname]);
-
-	return (
-		<DashboardContent
-			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
-			compact
-			maxWidth="lg"
-		>
-			<CustomBreadcrumbs
-				heading={t('tenant-details')}
-				links={[
-					{
-						name: _.capitalize(t('tenants')),
-						href: FRONT_PATH_NAMES.staff.tenants.root,
-					},
-					{ name: t('details') },
-				]}
-				sx={{ mb: 3 }}
-				action={ACTIONS[tabValue] || null}
-			/>
-
-			<Tabs value={tabValue} sx={{ mb: { xs: 3, md: 5 } }}>
-				{NAV_ITEMS.map((tab) => (
-					<Tab
-						component={RouterLink}
-						key={tab.href}
-						label={tab.label}
-						icon={tab.icon}
-						value={tab.href}
-						href={tab.href}
-					/>
-				))}
-			</Tabs>
-
-			<Outlet />
-		</DashboardContent>
+	const breadcrumbs = (
+		<CustomBreadcrumbs
+			heading={t('tenant-details')}
+			links={[
+				{
+					name: _.capitalize(t('tenants')),
+					href: FRONT_PATH_NAMES.staff.tenants.root,
+				},
+				{ name: t('details') },
+			]}
+			sx={{ mb: 3 }}
+		/>
 	);
-};
-
-export default TenantDetailsLayout;

-const CreateUserButton = () => {
-	const { t } = useTranslate();
-	const openDrawer = useBoolean();
-
-	return (
-		<>
-			<Button
-				type="submit"
-				variant="contained"
-				// loading={isSubmitting}
-				onClick={openDrawer.onTrue}
-				startIcon={<Iconify icon="mingcute:add-line" />}
-			>
-				{_.capitalize(t('new-item', { item: t('user') }))}
-			</Button>
-			<Drawer
-				open={openDrawer.value}
-				onClose={openDrawer.onFalse}
-				anchor="right"
-				sx={(theme) => {
-					return {
-						zIndex: theme.zIndex.modal + 1,
-					};
-				}}
-				slotProps={{
-					paper: {
-						sx: {
-							width: 720,
-						},
-					},
-				}}
-			>
-				ADD USER FORM HERE
-			</Drawer>
-		</>
-	);
+	return <SidebarSettingsLayout items={navItems} breadcrumbs={breadcrumbs} />;
 };

-const CreateProfileButton = () => {
-	const { t } = useTranslate();
-	const openDrawer = useBoolean();
-
-	return (
-		<>
-			<Button
-				type="submit"
-				variant="contained"
-				// loading={isSubmitting}
-				onClick={openDrawer.onTrue}
-				startIcon={<Iconify icon="mingcute:add-line" />}
-			>
-				{_.capitalize(t('new-item', { item: t('profile') }))}
-			</Button>
-			<Drawer
-				open={openDrawer.value}
-				onClose={openDrawer.onFalse}
-				anchor="right"
-				sx={(theme) => {
-					return {
-						zIndex: theme.zIndex.modal + 1,
-					};
-				}}
-				slotProps={{
-					paper: {
-						sx: {
-							width: 400,
-						},
-					},
-				}}
-			>
-				ADD PROFILE FORM HERE
-			</Drawer>
-		</>
-	);
-};
+export default TenantDetailsLayout;
diff --git a/apps/front/src/routes/authed/staff/tenants/details/billing/tenant-details-billing-page.tsx b/apps/front/src/routes/authed/staff/tenants/details/billing/tenant-details-billing-page.tsx
index a1f58e32..efc09d91 100644
--- a/apps/front/src/routes/authed/staff/tenants/details/billing/tenant-details-billing-page.tsx
+++ b/apps/front/src/routes/authed/staff/tenants/details/billing/tenant-details-billing-page.tsx
@@ -1,3 +1,5 @@
+import Stack from '@mui/material/Stack';
+
 import {
 	_userAddressBook,
 	_userInvoices,
@@ -5,15 +7,22 @@ import {
 	_userPlans,
 } from '@/front/_mock';
 import { AccountBilling } from '@/front/components/billing/account-billing';
+import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
+import { useTranslate } from '@/front/hooks/use-translate';

 const TenantDetailsBillingPage = () => {
+	const { t } = useTranslate();
+
 	return (
-		<AccountBilling
-			plans={_userPlans}
-			cards={_userPayment}
-			invoices={_userInvoices}
-			addressBook={_userAddressBook}
-		/>
+		<Stack spacing={3}>
+			<SettingsPageHeader subtitle={t('tenant-details')} title={t('billing')} />
+			<AccountBilling
+				plans={_userPlans}
+				cards={_userPayment}
+				invoices={_userInvoices}
+				addressBook={_userAddressBook}
+			/>
+		</Stack>
 	);
 };

diff --git a/apps/front/src/routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx b/apps/front/src/routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx
index 79347fa0..865d2311 100644
--- a/apps/front/src/routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx
+++ b/apps/front/src/routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx
@@ -1,17 +1,30 @@
+import Avatar from '@mui/material/Avatar';
+import Box from '@mui/material/Box';
+import Button from '@mui/material/Button';
+import Card from '@mui/material/Card';
+import Divider from '@mui/material/Divider';
+import Stack from '@mui/material/Stack';
+import { alpha } from '@mui/material/styles';
+import TextField from '@mui/material/TextField';
+import Typography from '@mui/material/Typography';
 import _ from 'lodash';
 import type { FC } from 'react';
 import { useParams } from 'react-router';

 import { View500 } from '@/front/components/error/500-view';
+import { Iconify } from '@/front/components/iconify/iconify';
 import QueryDisplay from '@/front/components/query-display';
+import { FormRow } from '@/front/components/settings/form-row';
+import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
+import { useTranslate } from '@/front/hooks/use-translate';
 import { useGetTenant } from '@/front/lib/react-query/features/staff/staff-tenant.hooks';
 import { logger } from '@/shared/lib/logger/iso-logger';
 import { getErrorMessage } from '@/shared/utils/error.utils';

 import { TenantCreateOrEditFormSkeleton } from '../../components/tenant-create-form-skeleton';
-import { TenantCreateOrEditForm } from '../../components/tenant-create-or-edit-form';

 const TenantDetailsGeneralPage = () => {
+	const { t } = useTranslate();
 	const { tenantId } = useParams();

 	const getTenantQuery = useGetTenant({
@@ -20,39 +33,143 @@ const TenantDetailsGeneralPage = () => {
 	});

 	return (
-		<QueryDisplay
-			query={getTenantQuery}
-			LoadingSlot={<TenantCreateOrEditFormSkeleton />}
-			ErrorSlot={ErrorView}
-		>
-			{({ data }) => {
-				return <TenantCreateOrEditForm currentTenant={data} />;
-			}}
-		</QueryDisplay>
+		<Stack spacing={3}>
+			<SettingsPageHeader subtitle={t('tenant-details')} title={t('general')} />
+
+			<QueryDisplay
+				query={getTenantQuery}
+				LoadingSlot={<TenantCreateOrEditFormSkeleton />}
+				ErrorSlot={ErrorView}
+			>
+				{({ data }) => (
+					<TenantGeneralContent
+						name={data.name}
+						tenantId={_.toString(data.tenantId)}
+					/>
+				)}
+			</QueryDisplay>
+		</Stack>
 	);
 };

 export default TenantDetailsGeneralPage;

+type TenantGeneralContentProps = {
+	name?: string | null;
+	tenantId: string;
+};
+
+const TenantGeneralContent = ({
+	name,
+	tenantId,
+}: TenantGeneralContentProps) => {
+	const { t } = useTranslate();
+
+	return (
+		<>
+			{/* Organization Details Card */}
+			<Card sx={{ p: 3 }}>
+				<Typography variant="h4" sx={{ mb: 3 }}>
+					{t('organization-details')}
+				</Typography>
+
+				<Stack divider={<Divider />}>
+					<FormRow label={t('logo')}>
+						<Stack direction="row" alignItems="center" spacing={2}>
+							<Avatar
+								sx={{
+									width: 64,
+									height: 64,
+									bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
+								}}
+							>
+								<Iconify
+									icon="solar:buildings-bold-duotone"
+									width={32}
+									sx={{ color: 'primary.main' }}
+								/>
+							</Avatar>
+							<Button variant="outlined" size="small" disabled>
+								{t('edit')}
+							</Button>
+						</Stack>
+					</FormRow>
+
+					<FormRow label={t('name')}>
+						<TextField
+							fullWidth
+							size="small"
+							value={name ?? ''}
+							disabled
+							sx={{ maxWidth: 400 }}
+						/>
+					</FormRow>
+
+					<FormRow label={`${t('tenant')} ID`}>
+						<TextField
+							fullWidth
+							size="small"
+							value={tenantId}
+							disabled
+							sx={{ maxWidth: 400 }}
+						/>
+					</FormRow>
+
+					<FormRow label={t('max-users')}>
+						<TextField
+							fullWidth
+							size="small"
+							value="—"
+							disabled
+							sx={{ maxWidth: 400 }}
+						/>
+					</FormRow>
+				</Stack>
+
+				<Box
+					sx={{
+						display: 'flex',
+						justifyContent: 'flex-end',
+						mt: 3,
+					}}
+				>
+					<Button variant="contained" disabled>
+						{t('save-changes')}
+					</Button>
+				</Box>
+			</Card>
+
+			{/* Danger Zone */}
+			<Card
+				sx={{
+					p: 3,
+					border: '1px solid',
+					borderColor: 'error.main',
+					bgcolor: (theme) => alpha(theme.palette.error.main, 0.02),
+				}}
+			>
+				<Typography variant="h5" sx={{ color: 'error.main', mb: 1 }}>
+					{t('danger-zone')}
+				</Typography>
+				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
+					{t('danger-zone-tenant-description')}
+				</Typography>
+
+				<Stack direction="row" spacing={2}>
+					<Button variant="outlined" color="warning" disabled>
+						{t('suspend')}
+					</Button>
+					<Button variant="outlined" color="error" disabled>
+						{t('delete')}
+					</Button>
+				</Stack>
+			</Card>
+		</>
+	);
+};
+
 const ErrorView: FC<{ error: unknown }> = ({ error }) => {
 	logger.error(getErrorMessage(error), { error });
-	// const { t } = useTranslate();
-
-	// if (error instanceof ParseRestError) {
-	// 	if (error.code === X_CODE.USER_NOT_FOUND) {
-	// 		return (
-	// 			<NotFoundView
-	// 				withLayout={false}
-	// 				title={t('item-not-found', { item: t('user') })}
-	// 				description={t('user-not-found-description')}
-	// 			/>
-	// 		);
-	// 	}
-
-	// 	if (_.toString(error.httpStatusCode).startsWith('4')) {
-	// 		return <View400 withLayout />;
-	// 	}
-	// }

 	return <View500 withLayout={false} />;
 };
diff --git a/apps/front/src/routes/authed/staff/tenants/details/profiles/tenant-details-profiles-page.tsx b/apps/front/src/routes/authed/staff/tenants/details/profiles/tenant-details-profiles-page.tsx
index 5c594d6d..609ec096 100644
--- a/apps/front/src/routes/authed/staff/tenants/details/profiles/tenant-details-profiles-page.tsx
+++ b/apps/front/src/routes/authed/staff/tenants/details/profiles/tenant-details-profiles-page.tsx
@@ -1,7 +1,52 @@
+import Button from '@mui/material/Button';
+import Drawer from '@mui/material/Drawer';
+import Stack from '@mui/material/Stack';
+import _ from 'lodash';
+import { useBoolean } from 'minimal-shared/hooks';
+
+import { Iconify } from '@/front/components/iconify/iconify';
+import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
+import { useTranslate } from '@/front/hooks/use-translate';
+
 import TenantProfilesTable from './parts/tenant-profiles-table';

 const TenantDetailsProfilesPage = () => {
-	return <TenantProfilesTable />;
+	const { t } = useTranslate();
+	const openDrawer = useBoolean();
+
+	return (
+		<Stack spacing={3}>
+			<Stack direction="row" alignItems="center" justifyContent="space-between">
+				<SettingsPageHeader
+					subtitle={t('tenant-details')}
+					title={t('profiles')}
+				/>
+				<Button
+					variant="contained"
+					onClick={openDrawer.onTrue}
+					startIcon={<Iconify icon="mingcute:add-line" />}
+				>
+					{_.capitalize(t('new-item', { item: t('profile') }))}
+				</Button>
+			</Stack>
+
+			<TenantProfilesTable />
+
+			<Drawer
+				open={openDrawer.value}
+				onClose={openDrawer.onFalse}
+				anchor="right"
+				sx={(theme) => ({
+					zIndex: theme.zIndex.modal + 1,
+				})}
+				slotProps={{
+					paper: { sx: { width: 400 } },
+				}}
+			>
+				ADD PROFILE FORM HERE
+			</Drawer>
+		</Stack>
+	);
 };

 export default TenantDetailsProfilesPage;
diff --git a/apps/front/src/routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx b/apps/front/src/routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx
index 327e2f18..ef9bfd94 100644
--- a/apps/front/src/routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx
+++ b/apps/front/src/routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx
@@ -1,7 +1,49 @@
+import Button from '@mui/material/Button';
+import Drawer from '@mui/material/Drawer';
+import Stack from '@mui/material/Stack';
+import _ from 'lodash';
+import { useBoolean } from 'minimal-shared/hooks';
+
+import { Iconify } from '@/front/components/iconify/iconify';
+import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
+import { useTranslate } from '@/front/hooks/use-translate';
+
 import TenantUsersTable from './parts/tenant-users-table';

 const TenantDetailsUsersPage = () => {
-	return <TenantUsersTable />;
+	const { t } = useTranslate();
+	const openDrawer = useBoolean();
+
+	return (
+		<Stack spacing={3}>
+			<Stack direction="row" alignItems="center" justifyContent="space-between">
+				<SettingsPageHeader subtitle={t('tenant-details')} title={t('users')} />
+				<Button
+					variant="contained"
+					onClick={openDrawer.onTrue}
+					startIcon={<Iconify icon="mingcute:add-line" />}
+				>
+					{_.capitalize(t('new-item', { item: t('user') }))}
+				</Button>
+			</Stack>
+
+			<TenantUsersTable />
+
+			<Drawer
+				open={openDrawer.value}
+				onClose={openDrawer.onFalse}
+				anchor="right"
+				sx={(theme) => ({
+					zIndex: theme.zIndex.modal + 1,
+				})}
+				slotProps={{
+					paper: { sx: { width: 720 } },
+				}}
+			>
+				ADD USER FORM HERE
+			</Drawer>
+		</Stack>
+	);
 };

 export default TenantDetailsUsersPage;
diff --git a/apps/front/src/routes/authed/tenant/account/_layout/account-layout.tsx b/apps/front/src/routes/authed/tenant/account/_layout/account-layout.tsx
index 482485b1..d055dd9c 100644
--- a/apps/front/src/routes/authed/tenant/account/_layout/account-layout.tsx
+++ b/apps/front/src/routes/authed/tenant/account/_layout/account-layout.tsx
@@ -1,20 +1,16 @@
-import Box from '@mui/material/Box';
 import type { TFunction } from 'i18next';
 import i18next from 'i18next';
 import _ from 'lodash';
 import { useMemo } from 'react';
-import { data, Outlet } from 'react-router';
+import { data } from 'react-router';

+import type { SettingsNavItem } from '@/front/components/settings/settings-nav';
+import { SidebarSettingsLayout } from '@/front/components/settings/sidebar-settings-layout';
 import { useTenantParam } from '@/front/hooks/use-tenant-param';
 import { useTranslate } from '@/front/hooks/use-translate';
-import { DashboardContent } from '@/front/layouts/dashboard/content';
 import { getServerLoader } from '@/front/lib/react-router/server-data.server';
 import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

-import {
-	SettingsNav,
-	type SettingsNavItem,
-} from '../../settings/_layout/settings-nav';
 import type { Route } from './+types/account-layout';

 const getPageTitle = (t: TFunction, seo?: boolean) => {
@@ -69,38 +65,7 @@ const AccountLayout = () => {
 		];
 	}, [t, tenantId]);

-	return (
-		<DashboardContent maxWidth="lg" compact>
-			<Box
-				sx={{
-					display: 'flex',
-					gap: 4,
-					flexDirection: { xs: 'column', md: 'row' },
-				}}
-			>
-				{/* Left Navigation */}
-				<Box
-					sx={{
-						display: { xs: 'none', md: 'block' },
-						flexShrink: 0,
-						width: 200,
-						position: 'sticky',
-						top: 80,
-						alignSelf: 'flex-start',
-						maxHeight: 'calc(100vh - 100px)',
-						overflowY: 'auto',
-					}}
-				>
-					<SettingsNav items={navItems} />
-				</Box>
-
-				{/* Main Content */}
-				<Box sx={{ flex: 1, minWidth: 0 }}>
-					<Outlet />
-				</Box>
-			</Box>
-		</DashboardContent>
-	);
+	return <SidebarSettingsLayout items={navItems} />;
 };

 export default AccountLayout;
diff --git a/apps/front/src/routes/authed/tenant/settings/_layout/settings-layout.tsx b/apps/front/src/routes/authed/tenant/settings/_layout/settings-layout.tsx
index 6a54885c..3503b114 100644
--- a/apps/front/src/routes/authed/tenant/settings/_layout/settings-layout.tsx
+++ b/apps/front/src/routes/authed/tenant/settings/_layout/settings-layout.tsx
@@ -1,17 +1,16 @@
-import Box from '@mui/material/Box';
 import type { TFunction } from 'i18next';
 import i18next from 'i18next';
 import _ from 'lodash';
 import { useMemo } from 'react';
-import { data, Outlet, useParams } from 'react-router';
+import { data, useParams } from 'react-router';

+import type { SettingsNavItem } from '@/front/components/settings/settings-nav';
+import { SidebarSettingsLayout } from '@/front/components/settings/sidebar-settings-layout';
 import { useTranslate } from '@/front/hooks/use-translate';
-import { DashboardContent } from '@/front/layouts/dashboard/content';
 import { getServerLoader } from '@/front/lib/react-router/server-data.server';
 import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

 import type { Route } from './+types/settings-layout';
-import { SettingsNav, type SettingsNavItem } from './settings-nav';

 const getPageTitle = (t: TFunction, seo?: boolean) => {
 	let str: string = _.capitalize(t('organization-settings'));
@@ -69,40 +68,7 @@ const SettingsLayout = () => {
 		];
 	}, [t, tenantId]);

-	return (
-		<DashboardContent maxWidth="lg" compact>
-			<Box
-				sx={{
-					display: 'flex',
-					gap: 4,
-					flexDirection: { xs: 'column', md: 'row' },
-				}}
-			>
-				{/* Left Navigation - Sticky */}
-				<Box
-					sx={{
-						display: { xs: 'none', md: 'block' },
-						flexShrink: 0,
-						width: 200,
-						position: 'sticky',
-						top: 80,
-						alignSelf: 'flex-start',
-						maxHeight: 'calc(100vh - 100px)',
-						overflowY: 'auto',
-					}}
-				>
-					<SettingsNav items={navItems} />
-				</Box>
-
-				{/* Main Content */}
-				<Box sx={{ flex: 1, minWidth: 0 }}>
-					{/* <DashboardContent> */}
-					<Outlet />
-					{/* </DashboardContent> */}
-				</Box>
-			</Box>
-		</DashboardContent>
-	);
+	return <SidebarSettingsLayout items={navItems} />;
 };

 export default SettingsLayout;
diff --git a/apps/front/src/routes/authed/tenant/settings/_layout/settings-nav.tsx b/apps/front/src/routes/authed/tenant/settings/_layout/settings-nav.tsx
index 53e8c216..97377650 100644
--- a/apps/front/src/routes/authed/tenant/settings/_layout/settings-nav.tsx
+++ b/apps/front/src/routes/authed/tenant/settings/_layout/settings-nav.tsx
@@ -1,52 +1,5 @@
-import Box from '@mui/material/Box';
-
-import { RouterLink } from '@/front/components/router-link';
-import useMatchPath from '@/front/hooks/use-match-path';
-
-export type SettingsNavItem = {
-	label: string;
-	href: string;
-	/** If true, match sub-paths as active (default: false for exact match) */
-	deep?: boolean;
-};
-
-type SettingsNavProps = {
-	items: SettingsNavItem[];
-};
-
-export const SettingsNav = ({ items }: SettingsNavProps) => {
-	const matchPath = useMatchPath();
-
-	return (
-		<Box component="nav">
-			<Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
-				{items.map((item) => {
-					const { active: isActive } = matchPath(item.href, item.deep ?? false);
-
-					return (
-						<Box component="li" key={item.href}>
-							<Box
-								component={RouterLink}
-								href={item.href}
-								sx={{
-									display: 'block',
-									py: 0.75,
-									textDecoration: 'none',
-									color: isActive ? 'primary.main' : 'text.secondary',
-									fontWeight: isActive ? 600 : 400,
-									fontSize: '0.875rem',
-									transition: 'color 0.15s ease-in-out',
-									'&:hover': {
-										color: 'primary.main',
-									},
-								}}
-							>
-								{item.label}
-							</Box>
-						</Box>
-					);
-				})}
-			</Box>
-		</Box>
-	);
-};
+// Re-export from shared location for backwards compatibility
+export {
+	SettingsNav,
+	type SettingsNavItem,
+} from '@/front/components/settings/settings-nav';
diff --git a/apps/front/src/routes/authed/tenant/settings/general/settings-general-page.tsx b/apps/front/src/routes/authed/tenant/settings/general/settings-general-page.tsx
index db0348cc..ffae08b4 100644
--- a/apps/front/src/routes/authed/tenant/settings/general/settings-general-page.tsx
+++ b/apps/front/src/routes/authed/tenant/settings/general/settings-general-page.tsx
@@ -9,42 +9,10 @@ import TextField from '@mui/material/TextField';
 import Typography from '@mui/material/Typography';

 import { Iconify } from '@/front/components/iconify/iconify';
+import { FormRow } from '@/front/components/settings/form-row';
 import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
 import { useTranslate } from '@/front/hooks/use-translate';

-// Horizontal form row component for consistent layout
-const FormRow = ({
-	label,
-	description,
-	children,
-}: {
-	label: string;
-	description?: string;
-	children: React.ReactNode;
-}) => (
-	<Box
-		sx={{
-			display: 'grid',
-			gridTemplateColumns: { xs: '1fr', md: '240px 1fr' },
-			gap: { xs: 1.5, md: 3 },
-			alignItems: 'flex-start',
-			py: 2,
-		}}
-	>
-		<Box>
-			<Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
-				{label}
-			</Typography>
-			{description && (
-				<Typography variant="caption" sx={{ color: 'text.secondary' }}>
-					{description}
-				</Typography>
-			)}
-		</Box>
-		<Box>{children}</Box>
-	</Box>
-);
-
 const SettingsGeneralPage = () => {
 	const { t } = useTranslate();

diff --git a/packages/shared/lib/i18n/json/common.en.json b/packages/shared/lib/i18n/json/common.en.json
index 198f1169..3d81321a 100644
--- a/packages/shared/lib/i18n/json/common.en.json
+++ b/packages/shared/lib/i18n/json/common.en.json
@@ -507,5 +507,6 @@
 	"tenant-suspended-title": "Organization Suspended",
 	"tenant-suspended-description": "This organization has been temporarily suspended and is currently unavailable. If you believe this is an error, please contact support.",
 	"go-to-my-organizations": "Go to my organizations",
-	"suspended-tenants-notice": "One or more of your organizations have been suspended."
+	"suspended-tenants-notice": "One or more of your organizations have been suspended.",
+	"danger-zone-tenant-description": "Suspending or deleting a tenant will affect all its users. These actions should be used with caution."
 }
diff --git a/packages/shared/lib/i18n/json/common.fr.json b/packages/shared/lib/i18n/json/common.fr.json
index 62a460aa..f10069b5 100644
--- a/packages/shared/lib/i18n/json/common.fr.json
+++ b/packages/shared/lib/i18n/json/common.fr.json
@@ -507,5 +507,6 @@
 	"tenant-suspended-title": "Organisation suspendue",
 	"tenant-suspended-description": "Cette organisation a été temporairement suspendue et est actuellement indisponible. Si vous pensez qu'il s'agit d'une erreur, veuillez contacter le support.",
 	"go-to-my-organizations": "Aller à mes organisations",
-	"suspended-tenants-notice": "Une ou plusieurs de vos organisations ont été suspendues."
+	"suspended-tenants-notice": "Une ou plusieurs de vos organisations ont été suspendues.",
+	"danger-zone-tenant-description": "Suspendre ou supprimer un locataire affectera tous ses utilisateurs. Ces actions doivent être utilisées avec précaution."
 }
```
