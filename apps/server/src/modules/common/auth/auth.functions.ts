import { HttpException } from '@/server/exceptions/HttpException';
import { DISABLE_SIGNUP_CONFIG_KEY } from '@/server/lib/constants';
import {
	defineCloudFunction,
	fromAuthedUserParseFunction,
	fromPublicParseFunction,
	parseFunctionEnhanced,
	type FunctionParams,
	type FunctionReturn,
} from '@/server/lib/parse/cloud/function';
import {
	getDatabase,
	getGlobalConfig,
	parseFields,
	removeParseFields,
} from '@/server/lib/parse/parse.utils';
import { className, functionName } from '@/shared/lib/constants';
import type { IUser } from '@/shared/types/db/user.types';

import RoleService from './role/role.service';
import type ParseTenant from './tenant/tenant.class';
import TenantService from './tenant/tenant.service';

export namespace GetUserAuthDataFunction {
	export type Params = FunctionParams<
		typeof getUserAuthDataFunction.parseFunction
	>;
	export type Return = FunctionReturn<
		typeof getUserAuthDataFunction.parseFunction
	>;
}

const getUserAuthDataFunction = fromAuthedUserParseFunction({
	name: functionName.auth.getUserAuthData,
	action: async ({ user }) => {
		const sessionToken = user.getSessionToken();

		const rolesPromises = new RoleService({ sessionToken }).getUserRoles(user, {
			json: true,
			exclude: ['rank'],
		});

		let roles = await rolesPromises;
		roles = roles.map((role) => {
			return removeParseFields(role, [
				...parseFields,
				'users',
				'roles',
			]) as never;
		});

		let userJson: IUser = user.toJSON() as never;
		userJson = removeParseFields(userJson, [
			...parseFields,
			'sessionToken',
			'emailVerified',
		]) as never;

		return {
			user: userJson,
			roles,
			sessionToken,
		};
	},
});

export namespace GetIsDisabledSignupFunction {
	// export type Params = FunctionParams<typeof getIsDisabledSignup.parseFunction>;
	export type Return = FunctionReturn<
		typeof getIsDisabledSignupFunction.parseFunction
	>;
}

const getIsDisabledSignupFunction = fromPublicParseFunction({
	name: functionName.auth.getIsDisabledSignup,
	action: async () => {
		const globalConfig = await getGlobalConfig();
		const disabledSignup: boolean = globalConfig.get(DISABLE_SIGNUP_CONFIG_KEY);

		return { disabledSignup: Boolean(disabledSignup) };
	},
});

export namespace GetRedirectCodeFunction {
	export type Params = FunctionParams<
		typeof getRedirectCodeFunction.parseFunction
	>;
	export type Return = FunctionReturn<
		typeof getRedirectCodeFunction.parseFunction
	>;
}

const getRedirectCodeFunction = fromAuthedUserParseFunction({
	name: functionName.auth.getRedirectCode,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			tenantId: z.string().optional(),
		});

		return schema.parse(params);
	},
	action: async ({ user, params, log }) => {
		const sessionToken = user.getSessionToken();

		const tenantService = new TenantService({ sessionToken });

		const fallBackTenantPromise = tenantService.findTenantsForUser(user, {
			select: [],
		});
		let tenantExistsPromise: Promise<ParseTenant | undefined> =
			Promise.resolve(undefined);

		if (params.tenantId) {
			tenantExistsPromise = tenantService.getById(params.tenantId, {
				select: [],
			});
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
			const isMember = await tenantService.isUserMemberOfTenant({
				user,
				tenant,
			});

			if (isMember) {
				return { code: tenant.id };
			}

			log.warn(
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

		log.warn(
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
	export type Params = FunctionParams<
		typeof getTenantAuthDataFunction.parseFunction
	>;
	export type Return = FunctionReturn<
		typeof getTenantAuthDataFunction.parseFunction
	>;
}

const getTenantAuthDataFunction = fromAuthedUserParseFunction({
	name: functionName.auth.getTenantAuthData,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			tenantId: z.string(),
		});

		return schema.parse(params);
	},
	action: async ({ user, params, t, log }) => {
		const sessionToken = user.getSessionToken();

		const roleService = new RoleService({ sessionToken });
		const getIsUserStaffMemberPromise = roleService.isUserStaffMember(user);

		// case 1: tenant id === 'staff'
		if (params.tenantId === 'staff') {
			const isUserStaffMember = await getIsUserStaffMemberPromise;

			if (isUserStaffMember) {
				return {
					// permissions: ['*'],
				};
			}

			log.warn(
				`Attempt to access staff auth data by user ${user.id} who is not a staff member`,
				{
					userId: user.id,
				},
			);
			throw new HttpException(403, t('unauthorized'));
		}

		// check if tenant exists
		const tenantService = new TenantService({ sessionToken });
		const tenant = await tenantService.getById(params.tenantId, { select: [] });

		if (!tenant) {
			throw new HttpException(404, t('item-not-found', { item: 'Tenant' }));
		}

		// check if user is staff member
		const isUserStaffMember = await getIsUserStaffMemberPromise;

		if (isUserStaffMember) {
			return {
				// permissions: ['*'],
			};
		}

		// check if user is member of the tenant
		const isMember = await tenantService.isUserMemberOfTenant({ user, tenant });

		if (!isMember) {
			log.warn(
				`Attempt to access tenant auth data ${params.tenantId} by user ${user.id} who is not member of said tenant`,
				{
					userId: user.id,
					tenantId: params.tenantId,
				},
			);
			throw new HttpException(403, t('unauthorized'));
		}

		return {
			// permissions: ['*'],
		};
	},
});

//--------------------------------------------------------------------------------------//
//                                 Define the functions                                 //
//--------------------------------------------------------------------------------------//

defineCloudFunction(getUserAuthDataFunction);
defineCloudFunction(getTenantAuthDataFunction);
defineCloudFunction(getIsDisabledSignupFunction);
defineCloudFunction(getRedirectCodeFunction);

// --------------------------------------------------------------------------------------//
//                                       SEEDING                                        //
// --------------------------------------------------------------------------------------//

const removeSeededUsersFunction = parseFunctionEnhanced({
	name: functionName.auth.removeSeededUsers,
	requireMasterKey: true,
	action: async () => {
		const User = getDatabase().collection(className.USER);

		const userResult = await User.deleteMany({ seeded: true });

		return { userResult };
	},
});

defineCloudFunction(removeSeededUsersFunction);
