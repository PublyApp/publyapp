import sharedEn from '@org/shared-ts/lib/i18n/locales/en';

import auth from './en/auth.json';
import common from './en/common.json';
import landing05 from './en/landing-05.json';
import landing05a from './en/landing-05-a.json';
import landing06 from './en/landing-06.json';
import landing07 from './en/landing-07.json';
import landing08 from './en/landing-08.json';
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
	'landing-05': landing05,
	'landing-05-a': landing05a,
	'landing-06': landing06,
	'landing-07': landing07,
	'landing-08': landing08,
} as const;

export type Front2Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Front2Resource>;

export default resourceEN;
