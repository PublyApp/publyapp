import sharedFr from '@org/shared-ts/lib/i18n/locales/fr';

import type { LooseResource } from './en';
import auth from './fr/auth.json';
import common from './fr/common.json';
import landing from './fr/landing.json';
import staffInvitations from './fr/staff-invitations.json';
import staffTenantProfiles from './fr/staff-tenant-profiles.json';
import staffUsers from './fr/staff-users.json';

const resourceFR = {
	common,
	zod: sharedFr.zod,
	'response-message': sharedFr['response-message'],
	auth,
	'staff-tenant-profiles': staffTenantProfiles,
	'staff-users': staffUsers,
	'staff-invitations': staffInvitations,
	landing,
} as const satisfies LooseResource;

export default resourceFR;
