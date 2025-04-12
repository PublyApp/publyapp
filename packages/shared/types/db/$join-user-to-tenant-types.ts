import type ParseTenant from '@/server/modules/common/auth/tenant/tenant.class';
import type ParseUser from '@/server/modules/common/auth/user/user.class';

import type { ITenant } from './tenant.types';
import type { IUser } from './user.types';

export type ICustomJoinUserToTenant = {
	subRoles: string[];
};
export type ICustomJoinUserToTenantWithRelations = ICustomJoinUserToTenant & {
	tenant: ITenant;
	user: IUser;
};
export type ICustomJoinUserToTenantWithParseRelations =
	ICustomJoinUserToTenant & {
		tenant: ParseTenant;
		user: ParseUser;
	};
