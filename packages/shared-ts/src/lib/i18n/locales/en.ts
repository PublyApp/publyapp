import account from '../json/account.en.json' with { type: 'json' };
import auth from '../json/auth.en.json' with { type: 'json' };
import common from '../json/common.en.json' with { type: 'json' };
import landing from '../json/landing.en.json' with { type: 'json' };
import organizations from '../json/organizations.en.json' with { type: 'json' };
import posts from '../json/posts.en.json' with { type: 'json' };
import responseMessage from '../json/response-message.en.json' with { type: 'json' };
import settings from '../json/settings.en.json' with { type: 'json' };
import socialAccounts from '../json/social-accounts.en.json' with { type: 'json' };
import staffAuditLogs from '../json/staff-audit-logs.en.json' with { type: 'json' };
import staffInvitations from '../json/staff-invitations.en.json' with { type: 'json' };
import staffJobs from '../json/staff-jobs.en.json' with { type: 'json' };
import staffTenantActivity from '../json/staff-tenant-activity.en.json' with { type: 'json' };
import staffTenantProfiles from '../json/staff-tenant-profiles.en.json' with { type: 'json' };
import staffUsers from '../json/staff-users.en.json' with { type: 'json' };
import zod from '../json/zod.en.json' with { type: 'json' };
import { I18N_NAMESPACES } from '../namespaces';
import type { NamespaceResource } from '../shared';

// The key ORDER below is the namespace registry's order (`../namespaces.ts`), and consumers rely
// on it: `apps/front/src/i18n/locales/locales.test.ts` asserts that this barrel publishes exactly
// `I18N_NAMESPACES`, in that order — so a namespace added to the registry without a catalogue here
// (or published here without being registered) fails loud instead of loading as `undefined`. The
// `satisfies` clause makes the same guarantee a typecheck error.
const resourceEN = {
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
} as const satisfies Record<
	(typeof I18N_NAMESPACES)[number],
	NamespaceResource
>;

export type Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Resource>;

export default resourceEN;
