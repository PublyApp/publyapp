import sharedEn from '@org/shared-ts/lib/i18n/locales/en';

import auth from './en/auth.json';
import common from './en/common.json';
import staffInvitations from './en/staff-invitations.json';
import staffUsers from './en/staff-users.json';

const resourceEN = {
	common,
	zod: sharedEn.zod,
	'response-message': sharedEn['response-message'],
	auth,
	'staff-users': staffUsers,
	'staff-invitations': staffInvitations,
} as const;

export type Front2Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Front2Resource>;

export default resourceEN;
