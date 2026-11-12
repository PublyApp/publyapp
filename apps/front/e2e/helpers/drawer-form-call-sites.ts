export const DRAWER_FORM_CALL_SITES = [
	{
		id: 'role-create',
		name: 'create-role',
		sourceFile:
			'src/routes/authed/staff/tenants/$tenantId/roles/_role-form-drawer.tsx',
		drawerTestId: 'role-form-drawer',
	},
	{
		id: 'role-edit',
		name: 'edit-role',
		sourceFile:
			'src/routes/authed/staff/tenants/$tenantId/roles/_role-edit-details-drawer.tsx',
		drawerTestId: 'role-edit-details-drawer',
	},
	{
		id: 'staff-role-edit',
		name: 'edit-staff-role',
		sourceFile:
			'src/routes/authed/staff/roles/$roleId/_role-edit-details-drawer.tsx',
		drawerTestId: 'staff-role-edit-details-drawer',
	},
	{
		id: 'tenant-user-invite',
		name: 'invite-user',
		sourceFile:
			'src/routes/authed/staff/tenants/$tenantId/_invite-user-drawer.tsx',
		drawerTestId: 'invite-tenant-user-drawer',
	},
	{
		id: 'staff-user-email-change',
		name: 'change-email',
		sourceFile: 'src/routes/authed/staff/staff-users/_change-email-dialog.tsx',
		drawerTestId: 'change-staff-user-email-dialog',
	},
	{
		id: 'tenant-post-create',
		name: 'create-post',
		sourceFile: 'src/routes/authed/tenant/posts/_create-post-drawer.tsx',
		drawerTestId: 'tenant-posts-create-drawer',
	},
	{
		id: 'tenant-user-link-companies',
		name: 'link-companies',
		sourceFile:
			'src/routes/authed/staff/tenant-users/$userId-organizations-drawer.tsx',
		drawerTestId: 'link-companies-drawer',
	},
	{
		id: 'bluesky-connect',
		name: 'bluesky-connect',
		sourceFile: 'src/routes/authed/tenant/settings/_bluesky-connect-drawer.tsx',
		drawerTestId: 'bluesky-connect-drawer',
	},
	{
		id: 'mastodon-connect',
		name: 'mastodon-connect',
		sourceFile:
			'src/routes/authed/tenant/settings/_mastodon-connect-drawer.tsx',
		drawerTestId: 'mastodon-connect-drawer',
	},
	{
		id: 'discord-connect',
		name: 'discord-connect',
		sourceFile: 'src/routes/authed/tenant/settings/_discord-connect-drawer.tsx',
		drawerTestId: 'discord-connect-drawer',
	},
	{
		id: 'social-account-visibility',
		name: 'social-account-visibility',
		sourceFile: 'src/routes/authed/tenant/settings/_visibility-drawer.tsx',
		drawerTestId: 'social-account-visibility-drawer',
	},
] as const;

export type DrawerFormCallSiteId =
	(typeof DRAWER_FORM_CALL_SITES)[number]['id'];
