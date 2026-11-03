import account from '../json/account.fr.json' with { type: 'json' };
import auth from '../json/auth.fr.json' with { type: 'json' };
import common from '../json/common.fr.json' with { type: 'json' };
import landing from '../json/landing.fr.json' with { type: 'json' };
import organizations from '../json/organizations.fr.json' with { type: 'json' };
import posts from '../json/posts.fr.json' with { type: 'json' };
import responseMessage from '../json/response-message.fr.json' with { type: 'json' };
import settings from '../json/settings.fr.json' with { type: 'json' };
import socialAccounts from '../json/social-accounts.fr.json' with { type: 'json' };
import staffAuditLogs from '../json/staff-audit-logs.fr.json' with { type: 'json' };
import staffInvitations from '../json/staff-invitations.fr.json' with { type: 'json' };
import staffJobs from '../json/staff-jobs.fr.json' with { type: 'json' };
import staffTenantActivity from '../json/staff-tenant-activity.fr.json' with { type: 'json' };
import staffTenantProfiles from '../json/staff-tenant-profiles.fr.json' with { type: 'json' };
import staffUsers from '../json/staff-users.fr.json' with { type: 'json' };
import zod from '../json/zod.fr.json' with { type: 'json' };
import type { LooseResource } from './en';

// Same registry order as `./en.ts`; `satisfies LooseResource` is what pins EN/FR key parity at
// the type level (a namespace or a key added on one side and not the other fails typecheck).
const resourceFR = {
	common,
	zod,
	'response-message': responseMessage,
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
} as const satisfies LooseResource;

export default resourceFR;
