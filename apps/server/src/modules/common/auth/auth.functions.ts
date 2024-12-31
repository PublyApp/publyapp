import { DISABLE_SIGNUP_CONFIG_KEY } from '@/server/lib/constants';
import { parseFunctionEnhanced, type FunctionParams, type FunctionReturn } from '@/server/lib/parse/function.utils';
import { getDatabase, getGlobalConfig } from '@/server/lib/parse/parse.utils';
import { className, functionName, roleEnum, roleSet } from '@/shared/lib/constants';
import { logger } from '@/shared/lib/winston';
import type { ITenant } from '@/shared/types/db/tenant.types';

import RoleService from './role/role.service';
import type ParseTenant from './tenant/tenant.class';
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
			const TENANT_ROLES = [roleEnum.TENANT_USER];

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

			if (!foundTenant) {
				logger.warn(`Attempt to access tenant ${tenantId} by user ${user.id} but not found`, {
					tenantId,
					userId: user.id,
				});
			} else {
				// case A:
				if (isStaffMember) {
					tenant = foundTenant.toJSON() as unknown as ITenant;
				}

				// case B:
				if (!isStaffMember && hasTenantRole) {
					// verify if user is member of foundTenant
					const isMember = await TenantService.isUserMemberOfTenant({ user, tenant: foundTenant });

					if (!isMember) {
						logger.warn(`Attempt to access tenant ${tenantId} by user ${user.id} who is not a member`, {
							tenantId,
							userId: user.id,
						});
					} else {
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

const removeSeededUsers = parseFunctionEnhanced({
	requireMasterKey: true,
	action: async () => {
		const User = getDatabase().collection(className.USER);

		const userResult = await User.deleteMany({ seeded: true });

		return { userResult };
	},
});

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

export namespace GetRedirectCodeFunction {
	export type Params = FunctionParams<typeof getRedirectCode>;
	export type Return = FunctionReturn<typeof getRedirectCode>;
}

const getRedirectCode = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_TENANT_USER,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			tenantId: z.string().optional(),
		});

		return schema.parse(params);
	},
	action: async ({ user, params, req }) => {
		const STAFF_ROLES = roleSet.ABOVE_STAFF_CONTRIBUTOR;
		// const TENANT_ROLES = [roleEnum.TENANT_USER];

		const sessionToken = user.getSessionToken();

		const tenantService = new TenantService({ sessionToken });

		const fallBackTenantPromise = tenantService.findTenantsForUser(user, { select: [] });
		let tenantExistsPromise: Promise<ParseTenant | undefined> = Promise.resolve(undefined);

		if (params.tenantId) {
			tenantExistsPromise = tenantService.getById(params.tenantId, { select: [] });
		}

		// check user's roles:
		// case 1: user is a staff member
		// case 2: user is a tenant user
		const roles = await new RoleService({ sessionToken }).getUserRoles(user, true);

		const isUserStaffMember = roles.some((role) => {
			return STAFF_ROLES.some((staffRole) => {
				return staffRole.code === role.code;
			});
		});

		if (isUserStaffMember) {
			if (params.tenantId) {
				const tenant = await tenantExistsPromise;

				if (tenant) {
					return { code: tenant.id };
				}
			}

			return { code: 'staff' };
		}

		// ! no need to check because the allowedRoles is already set to ABOVE_TENANT_USER
		// const userHasTenantRole = roles.some((role) => {
		// 	return TENANT_ROLES.some((tenantRole) => {
		// 		return tenantRole.code === role.code;
		// 	});
		// });

		const tenant = await tenantExistsPromise;

		if (tenant) {
			const isMember = await TenantService.isUserMemberOfTenant({ user, tenant });

			if (isMember) {
				return { code: tenant.id };
			}

			req.log.warn(`Attempt to access tenant ${params.tenantId} by user ${user.id} who is not a member`, {
				tenantId: params.tenantId,
				userId: user.id,
			});
			return { code: 'unauthorized' };
		}

		const fallBackTenant = (await fallBackTenantPromise)[0];

		if (fallBackTenant) {
			return { code: fallBackTenant.id };
		}

		req.log.warn(
			`Attempt to access nonexisting tenant ${params.tenantId} by user ${user.id} but it had no fallback tenant`,
			{
				tenantId: params.tenantId,
				userId: user.id,
			},
		);
		return { code: 'unauthorized' };
	},
});
// })

Parse.Cloud.define(functionName.auth.getUserAuthData, getUserAuthDataFunction);
Parse.Cloud.define(functionName.auth.removeSeededUsers, removeSeededUsers);
Parse.Cloud.define(functionName.auth.getIsDisabledSignup, getIsDisabledSignup);
Parse.Cloud.define(functionName.auth.getRedirectCode, getRedirectCode);
