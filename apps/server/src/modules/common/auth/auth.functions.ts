import { DISABLE_SIGNUP_CONFIG_KEY } from '@/server/lib/constants';
import { parseFunctionEnhanced, type FunctionParams, type FunctionReturn } from '@/server/lib/parse/function.utils';
import { getDatabase, getGlobalConfig } from '@/server/lib/parse/parse.utils';
import { className, functionName, roleEnum, roleSet } from '@/shared/lib/constants';
import type { ITenant } from '@/shared/types/db/tenant.types';

import RoleService from './role/role.service';
import TenantService from './tenant/tenant.service';

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

		let tenant: ITenant | undefined;

		const { tenantId } = params;

		// find out if this user is really member of the given tenant id params
		if (tenantId) {
			// multiple case
			// case A: the user is a staff member
			// 		1 - The tenant Id is invalid
			// 		2 - The tenant Id is valid
			// case B: the user is just a tenant user
			// 		1 - The tenant Id is invalid
			// 		2 - The tenant Id is valid
			// 				a - The use is a member of this tenant
			// 				a - The user is not member of this tenant
			// case C: the user is neither from staff or a tenant // yes this is possible in our system actually
			const STAFF_ROLES = roleSet.ABOVE_STAFF_CONTRIBUTOR;
			const TENANT_ROLES = [
				// roleEnum.TENANT_ADMIN,
				// roleEnum.TENANT_EDITOR,
				roleEnum.TENANT_USER,
				// roleEnum.TENANT_CONTRIBUTOR,
			];

			const isStaffMember = roles.some((userRole) => {
				return STAFF_ROLES.some((staffRole) => {
					return staffRole.code === userRole.code;
				});
			});
			const hasTenantRole = roles.some((userRole) => {
				return TENANT_ROLES.some((staffRole) => {
					return staffRole.code === userRole.code;
				});
			});

			const tenantService = new TenantService({ sessionToken });
			const foundTenant = await tenantService.getById(tenantId, { select: [] });

			// case A:
			if (isStaffMember) {
				if (foundTenant) {
					tenant = foundTenant.toJSON() as unknown as ITenant;
				}
			}

			// case B:
			if (!isStaffMember && hasTenantRole) {
				if (foundTenant) {
					// verify if user is member of foundTenant
					const isMember = await TenantService.isUserMemberOfTenant({ user, tenant: foundTenant });

					if (isMember) {
						tenant = foundTenant.toJSON() as unknown as ITenant;
					}
				}
			}
		}

		return {
			user: user.toJSON(),
			roles,
			sessionToken,
			tenant,
		};
	},
});

Parse.Cloud.define(functionName.auth.getUserAuthData, getUserAuthDataFunction);

const removeSeededUsers = parseFunctionEnhanced({
	requireMasterKey: true,
	action: async () => {
		const User = getDatabase().collection(className.USER);

		const userResult = await User.deleteMany({ seeded: true });

		return { userResult };
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
