import ParseTenant from '@/server/modules/auth/tenant/tenant.class';
import ParseUser from '@/server/modules/auth/user/user.class';

import { ITenant } from './tenant.types';
import { IUser } from './user.types';

export type ICustomJoinUserToTenant = {
	// === ?
};
export type ICustomJoinUserToTenantWithRelations = ICustomJoinUserToTenant & {
	tenant: ITenant;
	user: IUser;
};
export type ICustomJoinUserToTenantWithParseRelations = ICustomJoinUserToTenant & {
	tenant: ParseTenant;
	user: ParseUser;
};
