import sharedFr from '@org/shared-ts/lib/i18n/locales/fr';

import type { LooseResource } from './en';
import auth from './fr/auth.json';
import common from './fr/common.json';
import landing05 from './fr/landing-05.json';
import landing06 from './fr/landing-06.json';
import landing07 from './fr/landing-07.json';
import landing08 from './fr/landing-08.json';
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
	'landing-05': landing05,
	'landing-06': landing06,
	'landing-07': landing07,
	'landing-08': landing08,
} as const satisfies LooseResource;

export default resourceFR;
