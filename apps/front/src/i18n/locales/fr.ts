import sharedFr from '@org/shared-ts/lib/i18n/locales/fr';

import type { LooseResource } from './en';
import account from './fr/account.json';
import auth from './fr/auth.json';
import common from './fr/common.json';
import landing from './fr/landing.json';
import organizations from './fr/organizations.json';
import posts from './fr/posts.json';
import settings from './fr/settings.json';
import socialAccounts from './fr/social-accounts.json';
import staffAuditLogs from './fr/staff-audit-logs.json';
import staffInvitations from './fr/staff-invitations.json';
import staffTenantProfiles from './fr/staff-tenant-profiles.json';
import staffUsers from './fr/staff-users.json';

const resourceFR = {
	common,
	zod: sharedFr.zod,
	'response-message': sharedFr['response-message'],
	auth,
	account,
	settings,
	organizations,
	posts,
	'social-accounts': socialAccounts,
	'staff-tenant-profiles': staffTenantProfiles,
	'staff-users': staffUsers,
	'staff-invitations': staffInvitations,
	'staff-audit-logs': staffAuditLogs,
	landing,
} as const satisfies LooseResource;

export default resourceFR;
