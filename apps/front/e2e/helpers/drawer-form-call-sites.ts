export const DRAWER_FORM_CALL_SITES = [
	{
		id: 'profile-create',
		name: 'create-profile',
		sourceFile:
			'src/routes/authed/staff/tenants/$tenantId/profiles/_profile-form-drawer.tsx',
		drawerTestId: 'profile-form-drawer',
	},
	{
		id: 'profile-edit',
		name: 'edit-profile',
		sourceFile:
			'src/routes/authed/staff/tenants/$tenantId/profiles/_profile-edit-details-drawer.tsx',
		drawerTestId: 'profile-edit-details-drawer',
	},
	{
		id: 'staff-profile-edit',
		name: 'edit-staff-profile',
		sourceFile:
			'src/routes/authed/staff/profiles/$profileId/_profile-edit-details-drawer.tsx',
		drawerTestId: 'staff-profile-edit-details-drawer',
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
] as const;

export type DrawerFormCallSiteId =
	(typeof DRAWER_FORM_CALL_SITES)[number]['id'];
