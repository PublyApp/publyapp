import type { AppLocale } from '@/shared/lib/i18n/resources';
import {
	cloudFunction,
	getParseFunctionHeader,
	isFromCloudEnvironment,
	isNotValidIp,
	type ParseFunction,
} from './core';
import InterZod from '@/shared/lib/zod/InterZod';
import { getT, i18nextServer } from '../../i18n';
import type { LoggerController } from 'parse-server/lib/Controllers/LoggerController';
import {
	LOCALE_HEADER_KEY,
	roleSet,
	TENANT_ID_HEADER_KEY,
	tenantSubRoleSet,
	userGroup,
	type RoleSet,
	type StaffRoleSet,
	type TenantSubRoleSet,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import { HttpException } from '@/server/exceptions/HttpException';
import RoleService from '@/server/modules/common/auth/role/role.service';
import TenantService from '@/server/modules/common/auth/tenant/tenant.service';
import { USE_MASTER_KEY } from '../../constants';
import ParseTenant from '@/server/modules/common/auth/tenant/tenant.class';

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type FunctionReturn<T extends ParseFunction<any, any>> = Awaited<
	ReturnType<T>
>;

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type FunctionParams<T extends ParseFunction<any, any>> =
	Parameters<T>[0]['params'];

export const parseFunction = <
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
>(
	innerFunction: ParseFunction<P, T>,
) => {
	return cloudFunction<P, T>(innerFunction);
};

/**
 * @param log alias for req.log
 */
type BaseActionContext<P extends Parse.Cloud.Params = Parse.Cloud.Params> = {
	req: Parse.Cloud.FunctionRequest;
	t: ReturnType<typeof getT>;
	locale: AppLocale;
	z: InterZod;
	params: P;
	log: LoggerController;
};

type ActionContext1<P extends Parse.Cloud.Params = Parse.Cloud.Params> =
	BaseActionContext<P> & {
		user?: Parse.User;
		// isStaffMember?: never;
	};

type ActionContext2<P extends Parse.Cloud.Params = Parse.Cloud.Params> =
	BaseActionContext<P> & {
		user: Parse.User;
		// isStaffMember?: never;
	};

type ActionContext3<P extends Parse.Cloud.Params = Parse.Cloud.Params> =
	BaseActionContext<P> & {
		user: Parse.User;
		isStaffMember: boolean;
	};

type ActionType1<
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
> = (ctx: ActionContext1<P>) => Promise<T>;
type ActionType2<
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
> = (ctx: ActionContext2<P>) => Promise<T>;
type ActionType3<
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
> = (ctx: ActionContext3<P>) => Promise<T>;

type ParamsValidator<P extends Parse.Cloud.Params = Parse.Cloud.Params> = ({
	params,
	z,
}: {
	params: Parse.Cloud.Params;
	z: InterZod;
}) => P;

type ParseFunctionEnhancedParams<
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
> = // --------------------------------------------------------------------------------------//
//                                  case A: no auth needed                               //
// --------------------------------------------------------------------------------------//
(
	| {
			requireUser?: false | undefined; // which means public access
			group?: undefined;
			allowedRoles?: undefined;
			allowedTenantSubRoles?: undefined;
			action: ActionType1<P, T>;
	  }
	// --------------------------------------------------------------------------------------//
	//                                  case B auth needed                                   //
	// --------------------------------------------------------------------------------------//
	// * case B - 0: request can be from any authenticated user
	| {
			requireUser: true;
			group?: typeof userGroup.ANY | undefined;
			allowedRoles?: RoleSet | undefined;
			allowedTenantSubRoles?: undefined;
			action: ActionType2<P, T>;
	  }
	// * case B - 1: request must be from a tenant member
	// * implicitly, that means also: if the user is a staff member allow the function to run
	// * but if the user is a staff member, only allow the middleware to pass if the user has the correct tenant sub roles
	| {
			requireUser: true;
			group: typeof userGroup.TENANT;
			allowedRoles?: undefined;
			allowedTenantSubRoles?: TenantSubRoleSet | undefined;
			action: ActionType3<P, T>;
	  }
	// * case B - 1: request must be from a staff member
	| {
			requireUser: true;
			group: typeof userGroup.STAFF;
			allowedRoles?: StaffRoleSet | undefined;
			allowedTenantSubRoles?: undefined;
			action: ActionType2<P, T>;
	  }
) & {
	requireMasterKey?: boolean;
	validateParams?: ParamsValidator<P>;
};

export const parseFunctionEnhanced = <
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
>(
	params: ParseFunctionEnhancedParams<P, T>,
) => {
	const {
		requireUser,
		validateParams,
		requireMasterKey,
		group = userGroup.ANY,
	} = params;

	const actionBuilder = parseFunction<P, T>(async (req) => {
		const { user, log } = req;

		const localeInHeader = getParseFunctionHeader(req, LOCALE_HEADER_KEY);
		const locale = getCorrectLocale(localeInHeader);
		const t = getT(locale);

		if (requireMasterKey && !req.master) {
			throw new HttpException(
				403,
				t('item-is-required', { item: 'Master key' }),
			);
		}

		const z = new InterZod({ i18n: i18nextServer, locale });

		if (!requireUser) {
			const validatedParams = validateParams?.({ params: req.params, z });
			return params.action({
				req,
				t,
				user,
				locale,
				z,
				params: validatedParams || req.params,
				log,
			});
		}

		if (!user) {
			throw new HttpException(
				401,
				t('item-is-required', { item: t('authentication') }),
			);
		}

		const sessionToken = user.getSessionToken();

		const roleService = new RoleService(USE_MASTER_KEY);
		const tenantService = new TenantService(USE_MASTER_KEY);

		const isFromCloudEnvironmentPromise = isFromCloudEnvironment(req);

		// --------------------------------------------------------------------------------------//
		//                            any authed user is authorized                              //
		// --------------------------------------------------------------------------------------//
		if (group === userGroup.ANY) {
			const { allowedRoles = roleSet.ALL } = params;

			const userHasRolePromise = roleService.hasRole(user, allowedRoles);

			if (await isFromCloudEnvironmentPromise) {
				// then we don't need to check ip address

				if (!(await userHasRolePromise)) {
					throw new HttpException(403, t('unauthorized'));
				}

				const validatedParams = validateParams?.({ params: req.params, z });
				return (params.action as ActionType2<P, T>)({
					req,
					t,
					user,
					locale,
					z,
					params: validatedParams || req.params,
					log,
				});
			}

			if (await isNotValidIp({ sessionToken, req })) {
				throw new HttpException(401, t('invalid-session'));
			}

			if (!(await userHasRolePromise)) {
				throw new HttpException(403, t('unauthorized'));
			}

			const validatedParams = validateParams?.({ params: req.params, z });
			return (params.action as ActionType2<P, T>)({
				req,
				t,
				user,
				locale,
				z,
				params: validatedParams || req.params,
				log,
			});
		}

		// --------------------------------------------------------------------------------------//
		//       only members of a tenant are authorized (implicitly, staff members too)         //
		// --------------------------------------------------------------------------------------//
		if (group === userGroup.TENANT) {
			// check if tenantId is present in the request
			const tenantIdInHeaders = getParseFunctionHeader(
				req,
				TENANT_ID_HEADER_KEY,
			);

			if (!tenantIdInHeaders) {
				throw new HttpException(
					400,
					t('item-is-required', { item: 'tenantId' }),
				);
			}

			const { allowedTenantSubRoles = tenantSubRoleSet.ALL } = params;

			const userHasRolePromise = roleService.hasRole(
				user,
				//.if group === userGroup.TENANT then allowed roleSet is fixed by us (the developer): roleSet.ABOVE_TENANT_USER
				roleSet.ABOVE_TENANT_USER,
			);
			const isUserStaffMemberPromise = roleService.isUserStaffMember(user);

			const tenant = new ParseTenant({ objectId: tenantIdInHeaders });
			const userIsMemberOfTenantPromise = tenantService.isUserMemberOfTenant({
				user,
				tenant,
			});
			const userHasRoleInTenantPromise = tenantService.userHasRoleInTenant({
				user,
				tenant,
				tenantSubRoles: allowedTenantSubRoles,
			});

			if (await isFromCloudEnvironmentPromise) {
				// then we don't need to check ip address

				if (!(await userHasRolePromise)) {
					throw new HttpException(403, t('unauthorized'));
				}

				// is the user a staff member ?
				if (await isUserStaffMemberPromise) {
					// no need to check tenant membership and sub roles
					const validatedParams = validateParams?.({ params: req.params, z });
					return params.action({
						req,
						t,
						user,
						locale,
						z,
						params: validatedParams || req.params,
						log,
						isStaffMember: true,
					});
				}

				// check if user is member of the requested tenant (tenantId header)
				if (!(await userIsMemberOfTenantPromise)) {
					throw new HttpException(403, t('unauthorized'));
				}

				// check if user has the required sub roles
				if (!(await userHasRoleInTenantPromise)) {
					throw new HttpException(403, t('unauthorized'));
				}

				const validatedParams = validateParams?.({ params: req.params, z });
				return params.action({
					req,
					t,
					user,
					locale,
					z,
					params: validatedParams || req.params,
					log,
					isStaffMember: false,
				});
			}

			if (await isNotValidIp({ sessionToken, req })) {
				throw new HttpException(401, t('invalid-session'));
			}

			if (!(await userHasRolePromise)) {
				throw new HttpException(403, t('unauthorized'));
			}

			// is the user a staff member ?
			if (await isUserStaffMemberPromise) {
				// no need to check tenant membership and sub roles
				const validatedParams = validateParams?.({ params: req.params, z });
				return params.action({
					req,
					t,
					user,
					locale,
					z,
					params: validatedParams || req.params,
					log,
					isStaffMember: true,
				});
			}

			// check if user is member of the requested tenant (tenantId header)
			if (!(await userIsMemberOfTenantPromise)) {
				throw new HttpException(403, t('unauthorized'));
			}

			// check if user has the required sub roles
			if (!(await userHasRoleInTenantPromise)) {
				throw new HttpException(403, t('unauthorized'));
			}

			const validatedParams = validateParams?.({ params: req.params, z });
			return params.action({
				req,
				t,
				user,
				locale,
				z,
				params: validatedParams || req.params,
				log,
				isStaffMember: false,
			});
		}

		// --------------------------------------------------------------------------------------//
		//                           only staff member are authorized                            //
		// --------------------------------------------------------------------------------------//
		const { allowedRoles = roleSet.STAFF_MEMBER } = params;

		const userHasRolePromise = roleService.hasRole(user, allowedRoles);

		if (await isFromCloudEnvironmentPromise) {
			// then we don't need to check ip address

			if (!(await userHasRolePromise)) {
				throw new HttpException(403, t('unauthorized'));
			}

			const validatedParams = validateParams?.({ params: req.params, z });
			return (params.action as ActionType2<P, T>)({
				req,
				t,
				user,
				locale,
				z,
				params: validatedParams || req.params,
				log,
			});
		}

		if (await isNotValidIp({ sessionToken, req })) {
			throw new HttpException(401, t('invalid-session'));
		}

		if (!(await userHasRolePromise)) {
			throw new HttpException(403, t('unauthorized'));
		}

		const validatedParams = validateParams?.({ params: req.params, z });
		return (params.action as ActionType2<P, T>)({
			req,
			user,
			t,
			locale,
			z,
			params: validatedParams || req.params,
			log,
		});
	});

	return actionBuilder;
};

export const fromPublicParseFunction = <
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
>({
	action,
	validateParams,
}: {
	action: ActionType1<P, T>;
	validateParams?: ParamsValidator<P>;
}) => {
	return parseFunctionEnhanced({
		requireUser: false,
		action,
		validateParams,
	});
};

export const fromAuthedUserParseFunction = <
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
>({
	action,
	validateParams,
	allowedRoles,
}: {
	action: ActionType2<P, T>;
	validateParams?: ParamsValidator<P>;
	allowedRoles?: RoleSet;
}) => {
	return parseFunctionEnhanced({
		requireUser: true,
		group: userGroup.ANY,
		action,
		validateParams,
		allowedRoles,
	});
};

export const fromTenantMemberParseFunction = <
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
>({
	action,
	validateParams,
	allowedTenantSubRoles,
}: {
	action: ActionType3<P, T>;
	validateParams?: ParamsValidator<P>;
	allowedTenantSubRoles?: TenantSubRoleSet;
}) => {
	return parseFunctionEnhanced({
		requireUser: true,
		group: userGroup.TENANT,
		action,
		validateParams,
		allowedTenantSubRoles,
	});
};

export const fromStaffMemberParseFunction = <
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
>({
	action,
	validateParams,
	allowedRoles,
}: {
	action: ActionType2<P, T>;
	validateParams?: ParamsValidator<P>;
	allowedRoles?: StaffRoleSet;
}) => {
	return parseFunctionEnhanced({
		requireUser: true,
		group: userGroup.STAFF,
		action,
		validateParams,
		allowedRoles,
	});
};
