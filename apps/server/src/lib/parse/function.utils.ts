import type { LoggerController } from 'parse-server/lib/Controllers/LoggerController';
import { newObjectId } from 'parse-server/lib/cryptoUtils.js';

import chalk from 'chalk';
import _ from 'lodash';
import { ZodError } from 'zod';

import { getCorrectLocale } from '@org/shared/lib/i18n/i18n.utils';

import { HttpException } from '@/server/exceptions/HttpException';
import RoleService from '@/server/modules/common/auth/role/role.service';
import ParseTenant from '@/server/modules/common/auth/tenant/tenant.class';
import TenantService from '@/server/modules/common/auth/tenant/tenant.service';
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
import type { AppLocale } from '@/shared/lib/i18n/resources';
import CustomZod from '@/shared/lib/zod/CustomZod';

import { USE_MASTER_KEY } from '../constants';
import { getT, i18nextServer } from '../i18n';

import { getCurrentInstallationId, getInternalConfig } from './parse.utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FunctionReturn<T extends ParseFunction<any, any>> = Awaited<ReturnType<T>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FunctionParams<T extends ParseFunction<any, any>> = Parameters<T>[0]['params'];

type ParseFunction<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	req: Parse.Cloud.FunctionRequest<P>,
) => Promise<T>;

type ParseTrigger<P extends Parse.Object = Parse.Object, T = unknown> = (
	req: Parse.Cloud.TriggerRequest<P>,
) => Promise<T>;

type ParseJob<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	req: Parse.Cloud.JobRequest<P>,
) => Promise<T>;

type CloudFunction = {
	<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
		innerFunction: ParseFunction<P, T>,
	): ParseFunction<P, T>;
	<P extends Parse.Object = Parse.Object, T = unknown>(innerFunction: ParseTrigger<P, T>): ParseTrigger<P, T>;
	<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(innerFunction: ParseJob<P, T>): ParseJob<P, T>;
};

type ParseInnerFunction<
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
	O extends Parse.Object = Parse.Object,
> = ParseFunction<P, T> | ParseTrigger<O, T> | ParseJob<P, T>;

export const getParseFunctionHeader = (
	req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest | Parse.Cloud.JobRequest,
	key: string,
): string | undefined => {
	return _.get(req, `headers.${key}`) || _.get(req, `headers.${_.toLower(key)}`);
};

type FunctionType = 'trigger' | 'function' | 'job';

const getParseFunctionType = (
	req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest | Parse.Cloud.JobRequest,
): FunctionType => {
	const hasTriggerName = {
		type: 'trigger' as const,
		condition: _.has(req, 'triggerName') && !_.isNil(req.triggerName) && _.isString(req.triggerName),
	};
	const hastFunctionName = {
		type: 'function' as const,
		condition: _.has(req, 'functionName') && !_.isNil(req.functionName) && _.isString(req.functionName),
	};
	const hasJobName = {
		type: 'job' as const,
		condition: _.has(req, 'jobName') && !_.isNil(req.jobName) && _.isString(req.jobName),
	};

	const truthyConditions = [hasTriggerName, hastFunctionName, hasJobName].filter((value) => {
		return value.condition === true;
	});

	if (truthyConditions.length > 1) {
		throw new Error('Multiple function types detected');
	}

	if (truthyConditions.length <= 0) {
		throw new Error('Unknown parse function type');
	}

	return truthyConditions[0].type;
};

const isTriggerRequest = (
	req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest | Parse.Cloud.JobRequest,
): req is Parse.Cloud.TriggerRequest => {
	return getParseFunctionType(req) === 'trigger';
};

const getParseFunctionName = ({
	req,
	functionType,
}: {
	req: Parse.Cloud.FunctionRequest | Parse.Cloud.TriggerRequest | Parse.Cloud.JobRequest;
	functionType: FunctionType;
}) => {
	let functionName: string | undefined;

	if (functionType === 'function') {
		functionName = _.get(req, 'functionName');
	}

	if (functionType === 'trigger') {
		functionName = _.get(req, 'triggerName');
	}

	if (functionType === 'job') {
		functionName = _.get(req, 'jobName');
	}

	if (!functionName) {
		throw new Error('functionName has an incorrect value');
	}

	return functionName;
};

const alterLogger = ({
	req,
	functionType,
	functionName,
}: {
	req: Parse.Cloud.FunctionRequest | Parse.Cloud.TriggerRequest | Parse.Cloud.JobRequest;
	functionType: FunctionType;
	functionName: string;
}) => {
	let highlighted = `${_.capitalize(functionType)} :: ${functionName}`;

	if (functionType === 'function' || functionType === 'trigger') {
		// _.set(req, 'context.___do_not_use_altered_logger_marker___', true);
		_.set(req, 'headers.___do_not_use_altered_logger_marker___', true);
	}

	if (functionType === 'trigger') {
		if (functionName === 'beforeSave') {
			const request = req as Parse.Cloud.BeforeSaveRequest;
			highlighted = `${highlighted} :: ${request.object.className}`;
		}

		if (functionName === 'afterSave') {
			const request = req as Parse.Cloud.AfterSaveRequest;
			highlighted = `${highlighted} :: ${request.object.className}`;
		}

		if (functionName === 'beforeFind') {
			const request = req as Parse.Cloud.BeforeFindRequest;
			highlighted = `${highlighted} :: ${request.query.className}`;
		}

		if (functionName === 'afterFind') {
			const request = req as Parse.Cloud.AfterFindRequest;
			highlighted = `${highlighted} :: ${request.query?.className}`;
		}

		if (functionName === 'beforeDelete') {
			const request = req as Parse.Cloud.BeforeDeleteRequest;
			highlighted = `${highlighted} :: ${request.object.className}`;
		}

		if (functionName === 'afterDelete') {
			const request = req as Parse.Cloud.AfterDeleteRequest;
			highlighted = `${highlighted} :: ${request.object.className}`;
		}
	}

	const execId = newObjectId();

	const oldLog: LoggerController = req.log;
	const newLog = {
		...oldLog,
		adapter: oldLog.adapter,
		info: (...args: unknown[]) => {
			// eslint-disable-next-line no-param-reassign
			args[0] = `${chalk.cyan(`(${execId})`)} ${chalk.magenta(`[ ${highlighted} ]`)} >> ${args[0]}`;
			oldLog.info(...args);
		},
		warn: (...args: unknown[]) => {
			// eslint-disable-next-line no-param-reassign
			args[0] = `${chalk.cyan(`(${execId})`)} ${chalk.magenta(`[ ${highlighted} ]`)} >> ${args[0]}`;
			oldLog.warn(...args);
		},
		error: (...args: unknown[]) => {
			// eslint-disable-next-line no-param-reassign
			args[0] = `${chalk.cyan(`(${execId})`)} ${chalk.magenta(`[${highlighted}]`)} >> ${args[0]}`;
			oldLog.error(...args);
		},
	} as LoggerController;
	req.log = newLog;
};

// ! Do not use this class directly outside this module/file
// ! only use the isCloudHttpException utility below
class CloudFunctionHttpException extends Parse.Error {
	status: number;

	xcode?: string;

	constructor(status: number, message: string, xcode?: string) {
		super(Parse.Error.SCRIPT_FAILED, message);
		this.status = status;
		this.xcode = xcode;
	}
}

export const isCloudHttpException = (error: unknown): error is CloudFunctionHttpException => {
	return error instanceof CloudFunctionHttpException;
};

export const cloudFunction: CloudFunction = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
	innerFunction: ParseInnerFunction<P, T>,
) => {
	return async (
		req: Parse.Cloud.FunctionRequest<P> | Parse.Cloud.TriggerRequest | Parse.Cloud.JobRequest<P>,
	): Promise<T> => {
		const functionType = getParseFunctionType(req);
		const functionName = getParseFunctionName({ req, functionType });
		alterLogger({ req, functionName, functionType });

		// eslint-disable-next-line prefer-destructuring
		const log: LoggerController = req.log;

		try {
			log.info(`${functionType} started`, {
				user: _.get(req, 'user.id', undefined),
				params: _.get(req, 'params', {}),
			});
			const t1 = performance.now();
			const result = await innerFunction(req as never);
			const t2 = performance.now();
			log.info(`${functionType} finished in ${(t2 - t1).toFixed(2)} ms`, {
				result,
			});
			return result;
		} catch (error: unknown) {
			const localeInHeader = getCorrectLocale(getParseFunctionHeader(req, LOCALE_HEADER_KEY));

			let t = getT(localeInHeader);

			const isTrigger = isTriggerRequest(req);

			if (isTrigger) {
				const localeInContext = getCorrectLocale(_.isString(req.context?.locale) ? req.context.locale : undefined);

				if (localeInContext !== localeInHeader) {
					t = getT(localeInContext);
				}
			} else {
				// do nothing
			}

			let message: string = t('unknown-error');

			if (_.isString(error)) {
				message = error;
			}

			// get zod errors message
			if (error instanceof ZodError) {
				message = error.issues[0].message;
				log.error(message);
				return Promise.reject(message);
			}

			if (error instanceof Error) {
				let hasMessage: boolean;

				if (!error.message) {
					hasMessage = false;
					message = !String(error.message) ? message : String(error.message);
				} else {
					hasMessage = true;
					message = error.message;
				}

				log.error(hasMessage ? '' : message, error);

				if (error instanceof HttpException) {
					return Promise.reject(new CloudFunctionHttpException(error.status, message));
				}

				return Promise.reject(error);
			}

			log.error(message);
			return Promise.reject(message);
		}
	};
};

export const parseFunction = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
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
	z: CustomZod;
	params: P;
	log: LoggerController;
};

type ActionContext1<P extends Parse.Cloud.Params = Parse.Cloud.Params> = BaseActionContext<P> & {
	user?: Parse.User;
	// isStaffMember?: never;
};

type ActionContext2<P extends Parse.Cloud.Params = Parse.Cloud.Params> = BaseActionContext<P> & {
	user: Parse.User;
	// isStaffMember?: never;
};

type ActionContext3<P extends Parse.Cloud.Params = Parse.Cloud.Params> = BaseActionContext<P> & {
	user: Parse.User;
	isStaffMember: boolean;
};

type ActionType1<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	ctx: ActionContext1<P>,
) => Promise<T>;
type ActionType2<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	ctx: ActionContext2<P>,
) => Promise<T>;
type ActionType3<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	ctx: ActionContext3<P>,
) => Promise<T>;

type ParamsValidator<P extends Parse.Cloud.Params = Parse.Cloud.Params> = ({
	params,
	z,
}: {
	params: Parse.Cloud.Params;
	z: CustomZod;
}) => P;

type ParseFunctionEnhancedParams<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> =
	// --------------------------------------------------------------------------------------//
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

// * allow us to verify ip address if the request is not from the cloud functions and from an user with a session token
// * in other words: verify if the call is not from our cloud code (not from our server itself)
// * especially necessary if directAccess is set to false
const isFromCloudEnvironment = async (req: Parse.Cloud.FunctionRequest | Parse.Cloud.TriggerRequest) => {
	const cloudInstallationId = await getCurrentInstallationId();
	const { directAccess } = getInternalConfig();

	const definitelyNotFromCloud = directAccess && req.installationId !== 'cloud';
	const alsoNotFromCloud = !directAccess && req.installationId !== cloudInstallationId;

	return !(definitelyNotFromCloud || alsoNotFromCloud);
};

const isNotValidIp = async ({
	req,
	sessionToken,
}: {
	req: Parse.Cloud.FunctionRequest | Parse.Cloud.TriggerRequest;
	sessionToken: string;
}) => {
	const session = await new Parse.Query(Parse.Session)
		.equalTo('sessionToken', sessionToken)
		.select(['ipAddress'])
		.first({ sessionToken });

	const localMatchConditionIp = global.LOCAL && session?.get('ipAddress') !== req.ip;
	const onlineMatchConditionIp =
		!global.LOCAL && session?.get('ipAddress') !== getParseFunctionHeader(req, 'X-Forwarded-For');

	return localMatchConditionIp || onlineMatchConditionIp;
};

export const parseFunctionEnhanced = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
	params: ParseFunctionEnhancedParams<P, T>,
) => {
	const { requireUser, validateParams, requireMasterKey, group = userGroup.ANY } = params;

	const actionBuilder = parseFunction<P, T>(async (req) => {
		const { user, log } = req;

		const localeInHeader = getParseFunctionHeader(req, LOCALE_HEADER_KEY);
		const locale = getCorrectLocale(localeInHeader);
		const t = getT(locale);

		if (requireMasterKey && !req.master) {
			throw new HttpException(403, t('item-is-required', { item: 'Master key' }));
		}

		const z = new CustomZod({ i18n: i18nextServer, locale });

		if (!requireUser) {
			const validatedParams = validateParams?.({ params: req.params, z });
			return params.action({ req, t, user, locale, z, params: validatedParams || req.params, log });
		}

		if (!user) {
			throw new HttpException(401, t('item-is-required', { item: t('authentication') }));
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
			const tenantIdInHeaders = getParseFunctionHeader(req, TENANT_ID_HEADER_KEY);

			if (!tenantIdInHeaders) {
				throw new HttpException(400, t('item-is-required', { item: 'tenantId' }));
			}

			const { allowedTenantSubRoles = tenantSubRoleSet.ALL } = params;

			const userHasRolePromise = roleService.hasRole(user, roleSet.ABOVE_TENANT_USER);
			const isUserStaffMemberPromise = roleService.isUserStaffMember(user);

			const tenant = new ParseTenant({ objectId: tenantIdInHeaders });
			const userIsMemberOfTenantPromise = tenantService.isUserMemberOfTenant({ user, tenant });
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
		//                           only staff member are authorized                           //
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

type TriggerContext<P extends Parse.Object = Parse.Object> = {
	req: Parse.Cloud.TriggerRequest<P>;
	t: ReturnType<typeof getT>;
	locale: AppLocale;
};

export const parseTrigger = <P extends Parse.Object = Parse.Object, T = unknown>(innerFunction: ParseTrigger<P, T>) => {
	return cloudFunction<P, T>(innerFunction);
};

type ParseTriggerEnhancedParams<P extends Parse.Object = Parse.Object> = {
	trigger: (ctx: TriggerContext<P>) => Promise<void>;
};

export const parseTriggerEnhanced = <P extends Parse.Object = Parse.Object>(params: ParseTriggerEnhancedParams<P>) => {
	const triggerBuilder = parseTrigger(async (req: Parse.Cloud.TriggerRequest<P>) => {
		const { trigger } = params;

		const localeInHeaders = getParseFunctionHeader(req, LOCALE_HEADER_KEY);
		const localeInContext = _.isString(req.context?.locale) ? req.context.locale : undefined;

		const locale = getCorrectLocale(localeInContext || localeInHeaders);
		const t = getT(locale);

		if (req.master) {
			return trigger({ req, t, locale });
		}

		if (await isFromCloudEnvironment(req)) {
			return trigger({ req, t, locale });
		}

		if (req.user) {
			if (await isNotValidIp({ sessionToken: req.user.getSessionToken(), req })) {
				throw new HttpException(401, t('invalid-session'));
			}
		}

		return trigger({ req, t, locale });
	});

	return triggerBuilder;
};

type MultiTenantTriggerContext = TriggerContext & {
	tenantId?: string;
};

type MultiTenantTriggerParams = {
	trigger: (ctx: MultiTenantTriggerContext) => Promise<void>;
};

/**
 * ! Warning!!!!!!!! This is a work in progress
 */
export const multiTenantTrigger = (params: MultiTenantTriggerParams) => {
	return parseTriggerEnhanced({
		trigger: async ({ locale, req, t }) => {
			const { trigger } = params;

			if (req.master) {
				return trigger({ locale, req, t });
			}

			if (!req.user) {
				throw new HttpException(401, t('item-is-required', { item: t('authentication') }));
			}

			const sessionToken = req.user.getSessionToken();

			if (req.triggerName === 'beforeFind') {
				const tenantIdInHeaders = getParseFunctionHeader(req, TENANT_ID_HEADER_KEY);
				const tenantIdInQuery: string | undefined = _.get(req.query?.toJSON(), 'where.tenant.objectId');

				const tenantId = tenantIdInHeaders || tenantIdInQuery;

				if (!tenantId) {
					throw new HttpException(401, t('item-is-required', { item: 'tenantId' }));
				}

				const tenantObject = new ParseTenant();
				tenantObject.id = tenantId;

				const tenantService = new TenantService({ sessionToken });
				const isUserMemberOfTenant = await tenantService.isUserMemberOfTenant({ user: req.user, tenant: tenantObject });

				if (!isUserMemberOfTenant) {
					throw new HttpException(403, t('unauthorized'));
				}
				// return trigger({ locale, req, t });
			}

			// // TODO: verify if user is member of requested tenant ???
			// const isUserMemberOfTenant = await TenantService.isUserMemberOfTenant({ user: req.user, tenant });

			// if (!isUserMemberOfTenant) {
			// 	throw new Error(t('unauthorized'));
			// }

			// const tenant = new Parse.Object(appClassName.TENANT);
			// tenant.id = tenantIdInHeaders;
			// req.query?.equalTo('tenant', tenant);
			return trigger({ locale, req, t });
		},

		// const { headers, context } = req;
		// const fromPublic = context?.fromPublic;
		// const fromStaff = context?.fromStaff;

		// // eslint-disable-next-line @typescript-eslint/naming-convention
		// let _headers: Record<string, unknown> = {};

		// if (_.isObject(headers) && !_.isEmpty(headers)) {
		// 	_headers = headers as never;
		// } else if (_.isObject(context?.headers) && !_.isEmpty(context.headers)) {
		// 	_headers = context.headers as never;
		// }

		// // eslint-disable-next-line @typescript-eslint/naming-convention
		// const _tenantId = _headers[_.toLower(TENANT_ID_HEADER_KEY)];
		// const tenantId = _.isString(_tenantId) ? _tenantId : undefined;

		// if (req.triggerName === 'beforeFind') {
		// 	if (!tenantId && !req.master && !fromStaff && !fromPublic) {
		// 		throw new Error(t('item-is-required', { item: 'tenantId' }));
		// 	}

		// 	// if (isPublic) {
		// 	// 	return trigger({ locale, req, t });
		// 	// }

		// 	if (tenantId) {
		// 		req.query?.equalTo('tenant', tenantId);
		// 		return trigger({ locale, req, t, tenantId });
		// 	}
		// }

		// return trigger({ locale, req, t });
		// }
	});
};

export const parseJob = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
	innerFunction: ParseJob<P, T>,
) => {
	return cloudFunction<P, T>(innerFunction);
};

export const fromPublicParseFunction = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>({
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

export const fromAuthedUserParseFunction = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>({
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

export const fromTenantMemberParseFunction = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>({
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

export const fromStaffMemberParseFunction = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>({
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
