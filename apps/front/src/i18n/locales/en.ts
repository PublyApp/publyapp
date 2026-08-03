import sharedEn from '@org/shared-ts/lib/i18n/locales/en';

import auth from './en/auth.json';
import common from './en/common.json';
import landing from './en/landing.json';
import staffInvitations from './en/staff-invitations.json';
import staffTenantProfiles from './en/staff-tenant-profiles.json';
import staffUsers from './en/staff-users.json';

const resourceEN = {
	common,
	zod: sharedEn.zod,
	'response-message': sharedEn['response-message'],
	auth,
	'staff-tenant-profiles': staffTenantProfiles,
	'staff-users': staffUsers,
	'staff-invitations': staffInvitations,
	landing,
} as const;

export type Front2Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Front2Resource>;

export default resourceEN;
