import { DISABLE_SIGNUP_CONFIG_KEY } from '@/server/lib/constants';
import { parseFunctionEnhanced, type FunctionParams, type FunctionReturn } from '@/server/lib/parse/function.utils';
import { getDatabase, getGlobalConfig } from '@/server/lib/parse/parse.utils';
import { className, functionName, roleSet } from '@/shared/lib/constants';

import RoleService from './role/role.service';
import type ParseTenant from './tenant/tenant.class';
import TenantService from './tenant/tenant.service';

export namespace GetUserAuthDataFunction {
	export type Params = FunctionParams<typeof getUserAuthDataFunction>;
	export type Return = FunctionReturn<typeof getUserAuthDataFunction>;
}

const getUserAuthDataFunction = parseFunctionEnhanced({
	requireUser: true,
	// validateParams: ({ params, z }) => {
	// 	const schema = z.object({
	// 		tenantId: z.string({}).optional(),
	// 	});

	// 	return schema.parse(params);
	// },
	action: async ({ user }) => {
		const sessionToken = user.getSessionToken();

		const rolesPromises = new RoleService({ sessionToken }).getUserRoles(user, true);
		const roles = await rolesPromises;

		// let tenant: ITenant | undefined;

		// const { tenantId } = params;

		// // find out if this user is really member of the given tenant id params
		// if (tenantId) {
		// 	// multiple case
		// 	// case A: the user is a staff member
		// 	// 		1 - The tenant Id is invalid
		// 	// 		2 - The tenant Id is valid
		// 	// case B: the user is just a tenant user
		// 	// 		1 - The tenant Id is invalid
		// 	// 		2 - The tenant Id is valid
		// 	// 				a - The use is a member of this tenant
		// 	// 				a - The user is not member of this tenant
		// 	// case C: the user is neither from staff or a tenant // yes this is possible in our system actually
		// 	const STAFF_ROLES = roleSet.ABOVE_STAFF_CONTRIBUTOR;
		// 	const TENANT_ROLES = [roleEnum.TENANT_USER];

		// 	const isStaffMember = roles.some((userRole) => {
		// 		return STAFF_ROLES.some((staffRole) => {
		// 			return staffRole.code === userRole.code;
		// 		});
		// 	});
		// 	const hasTenantRole = roles.some((userRole) => {
		// 		return TENANT_ROLES.some((staffRole) => {
		// 			return staffRole.code === userRole.code;
		// 		});
		// 	});

		// 	const tenantService = new TenantService({ sessionToken });
		// 	const foundTenant = await tenantService.getById(tenantId, { select: [] });

		// 	if (!foundTenant) {
		// 		logger.warn(`Attempt to access tenant ${tenantId} by user ${user.id} but not found`, {
		// 			tenantId,
		// 			userId: user.id,
		// 		});
		// 	} else {
		// 		// case A:
		// 		if (isStaffMember) {
		// 			tenant = foundTenant.toJSON() as unknown as ITenant;
		// 		}

		// 		// case B:
		// 		if (!isStaffMember && hasTenantRole) {
		// 			// verify if user is member of foundTenant
		// 			const isMember = await TenantService.isUserMemberOfTenant({ user, tenant: foundTenant });

		// 			if (!isMember) {
		// 				logger.warn(`Attempt to access tenant ${tenantId} by user ${user.id} who is not a member`, {
		// 					tenantId,
		// 					userId: user.id,
		// 				});
		// 			} else {
		// 				tenant = foundTenant.toJSON() as unknown as ITenant;
		// 			}
		// 		}
		// 	}
		// }

		return {
			user: user.toJSON(),
			roles,
			sessionToken,
			// tenant,
		};
	},
});

export namespace GetIsDisabledSignupFunction {
	// export type Params = FunctionParams<typeof getIsDisabledSignup>;
	export type Return = FunctionReturn<typeof getIsDisabledSignupFunction>;
}

const getIsDisabledSignupFunction = parseFunctionEnhanced({
	action: async () => {
		const globalConfig = await getGlobalConfig();
		const disabledSignup: boolean = globalConfig.get(DISABLE_SIGNUP_CONFIG_KEY);

		return { disabledSignup: Boolean(disabledSignup) };
	},
});

export namespace GetRedirectCodeFunction {
	export type Params = FunctionParams<typeof getRedirectCodeFunction>;
	export type Return = FunctionReturn<typeof getRedirectCodeFunction>;
}

const getRedirectCodeFunction = parseFunctionEnhanced({
	requireUser: true,
	allowedRoles: roleSet.ABOVE_TENANT_USER,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			tenantId: z.string().optional(),
		});

		return schema.parse(params);
	},
	action: async ({ user, params, req }) => {
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
		const roleService = new RoleService({ sessionToken });
		const isUserStaffMember = await roleService.isUserStaffMember(user);

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

			req.log.warn(
				`Attempt to access tenant ${params.tenantId} by user ${user.id} who is not a member of said tenant`,
				{
					tenantId: params.tenantId,
					userId: user.id,
				},
			);
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

export namespace GetTenantAuthDataFunction {
	export type Params = FunctionParams<typeof getTenantAuthDataFunction>;
	export type Return = FunctionReturn<typeof getTenantAuthDataFunction>;
}

const getTenantAuthDataFunction = parseFunctionEnhanced({
	requireUser: true,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			tenantId: z.string(),
		});

		return schema.parse(params);
	},
	action: async ({ req, user, params, t }) => {
		const sessionToken = user.getSessionToken();

		const roleService = new RoleService({ sessionToken });
		const getIsUserStaffMemberPromise = roleService.isUserStaffMember(user);

		// case 1: tenant id === 'staff'
		if (params.tenantId === 'staff') {
			const isUserStaffMember = await getIsUserStaffMemberPromise;

			if (isUserStaffMember) {
				return {
					permissions: ['*'],
				};
			}

			req.log.warn(`Attempt to access staff auth data by user ${user.id} who is not a staff member`, {
				userId: user.id,
			});
			throw new Error(t('unauthorized'));
		}

		// check if tenant exists
		const tenantService = new TenantService({ sessionToken });
		const tenant = await tenantService.getById(params.tenantId, { select: [] });

		if (!tenant) {
			throw new Error(t('item-not-found', { item: 'Tenant' }));
		}

		// check if user is staff member
		const isUserStaffMember = await getIsUserStaffMemberPromise;

		if (isUserStaffMember) {
			return {
				permissions: ['*'],
			};
		}

		// check if user is member of the tenant
		const isMember = await TenantService.isUserMemberOfTenant({ user, tenant });

		if (!isMember) {
			req.log.warn(
				`Attempt to access tenant auth data ${params.tenantId} by user ${user.id} who is not member of said tenant`,
				{
					userId: user.id,
					tenantId: params.tenantId,
				},
			);
			throw new Error(t('unauthorized'));
		}

		// TODO: fetch the user's permissions in this particular tenant
		return {
			permissions: ['*'],
		};
	},
});

Parse.Cloud.define(functionName.auth.getUserAuthData, getUserAuthDataFunction);
Parse.Cloud.define(functionName.auth.getTenantAuthData, getTenantAuthDataFunction);
Parse.Cloud.define(functionName.auth.getIsDisabledSignup, getIsDisabledSignupFunction);
Parse.Cloud.define(functionName.auth.getRedirectCode, getRedirectCodeFunction);

// --------------------------------------------------------------------------------------//
//                                       SEEDING                                        //
// --------------------------------------------------------------------------------------//

const removeSeededUsersFunction = parseFunctionEnhanced({
	requireMasterKey: true,
	action: async () => {
		const User = getDatabase().collection(className.USER);

		const userResult = await User.deleteMany({ seeded: true });

		return { userResult };
	},
});

Parse.Cloud.define(functionName.auth.removeSeededUsers, removeSeededUsersFunction);
