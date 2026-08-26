import sharedEn from '@org/shared-ts/lib/i18n/locales/en';

import account from './en/account.json';
import auth from './en/auth.json';
import common from './en/common.json';
import landing from './en/landing.json';
import organizations from './en/organizations.json';
import posts from './en/posts.json';
import settings from './en/settings.json';
import socialAccounts from './en/social-accounts.json';
import staffAuditLogs from './en/staff-audit-logs.json';
import staffInvitations from './en/staff-invitations.json';
import staffJobs from './en/staff-jobs.json';
import staffTenantActivity from './en/staff-tenant-activity.json';
import staffTenantProfiles from './en/staff-tenant-profiles.json';
import staffUsers from './en/staff-users.json';

const resourceEN = {
	common,
	zod: sharedEn.zod,
	'response-message': sharedEn['response-message'],
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
	'staff-jobs': staffJobs,
	'staff-tenant-activity': staffTenantActivity,
	landing,
} as const;

export type Front2Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Front2Resource>;

export default resourceEN;
