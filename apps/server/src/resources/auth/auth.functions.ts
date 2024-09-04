import { DISABLE_SIGNUP_CONFIG_KEY } from '@/server/lib/constants';
import {
	getDatabase,
	getGlobalConfig,
	parseFunctionEnhanced,
	type FunctionParams,
	type FunctionReturn,
} from '@/server/lib/parse/utils';
import { className, functionName } from '@/shared/lib/constants';

import TenantService from '../_multi-tenancy/tenant.service';

import RoleService from './role/role.service';
import ParseUser from './user/user.class';

export namespace GetUserAuthDataFunction {
	export type Params = FunctionParams<typeof getUserAuthDataFunction>;
	export type Return = FunctionReturn<typeof getUserAuthDataFunction>;
}

const getUserAuthDataFunction = parseFunctionEnhanced({
	requireUser: true,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			tenantId: z.string({}).optional(),
		});

		return schema.parse(params);
	},
	action: async ({ user, params }) => {
		const sessionToken = user.getSessionToken();

		const rolesPromises = new RoleService({ sessionToken }).getUserRoles(user, true);
		const roles = await rolesPromises;

		const { tenantId } = params;

		// find out if this user is really member of the given tenant id params
		if (tenantId) {
			// multiple case
			// case A: the user is a staff member
			// case B: the user is just a tenant user
			// case C: the user is neither from staff or a tenant // yes this is possible in our system actually

			// case A-1:
			//
			const tenantService = new TenantService({ sessionToken });

			const tenant = await tenantService.getById(tenantId, { select: [] });

			// if (!tenant) throw new Error('TENANT DOES NOT EXIST');
			if (tenant) {
				const isMember = tenantService.isUserMemberOfTenant({ user, tenant });
			}
		}

		return {
			user: user.toJSON(),
			roles,
			sessionToken,
		};
	},
});

Parse.Cloud.define(functionName.auth.getUserAuthData, getUserAuthDataFunction);

const removeSeededUsers = parseFunctionEnhanced({
	requireMasterKey: true,
	action: async () => {
		const User = getDatabase().collection(className.USER);

		const result = await User.deleteMany({ seeded: true });

		return result;
	},
});

Parse.Cloud.define(functionName.auth.removeSeededUsers, removeSeededUsers);

export namespace GetIsDisabledSignupFunction {
	// export type Params = FunctionParams<typeof getIsDisabledSignup>;
	export type Return = FunctionReturn<typeof getIsDisabledSignup>;
}

const getIsDisabledSignup = parseFunctionEnhanced({
	action: async () => {
		const globalConfig = await getGlobalConfig();
		const disabledSignup: boolean = globalConfig.get(DISABLE_SIGNUP_CONFIG_KEY);

		return { disabledSignup: Boolean(disabledSignup) };
	},
});

Parse.Cloud.define(functionName.auth.getIsDisabledSignup, getIsDisabledSignup);
