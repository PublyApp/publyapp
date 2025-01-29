import type { LoggerController } from 'parse-server/lib/Controllers/LoggerController';
import { newObjectId } from 'parse-server/lib/cryptoUtils.js';

import chalk from 'chalk';
import _ from 'lodash';
import { ZodError } from 'zod';

import { getCorrectLocale } from '@devist/shared/lib/i18n/i18n.utils';

import { HttpException } from '@/server/exceptions/HttpException';
import RoleService from '@/server/modules/common/auth/role/role.service';
import ParseTenant from '@/server/modules/common/auth/tenant/tenant.class';
import TenantService from '@/server/modules/common/auth/tenant/tenant.service';
import {
	LOCALE_HEADER_KEY,
	roleSet,
	TENANT_ID_HEADER_KEY,
	type IRoleConfig,
	type RoleSet,
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

type BaseActionContext<P extends Parse.Cloud.Params = Parse.Cloud.Params> = {
	req: Parse.Cloud.FunctionRequest /* <P> */;
	t: ReturnType<typeof getT>;
	locale: AppLocale;
	z: CustomZod;
	params: P;
};

type ActionContext2<P extends Parse.Cloud.Params = Parse.Cloud.Params> = BaseActionContext<P> & {
	user?: Parse.User;
};

type ActionContext1<P extends Parse.Cloud.Params = Parse.Cloud.Params> = BaseActionContext<P> & {
	user: Parse.User;
};

type ParseFunctionEnhancedParams<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	| {
			requireUser: true;
			allowedRoles?: IRoleConfig[] | RoleSet | undefined;
			action: (ctx: ActionContext1<P>) => Promise<T>;
			requireMasterKey?: boolean;
	  }
	| {
			requireUser?: false | undefined;
			allowedRoles?: undefined;
			action: (ctx: ActionContext2<P>) => Promise<T>;
			requireMasterKey?: boolean;
	  }
) & {
	validateParams?: ({ params, z }: { params: Parse.Cloud.Params; z: CustomZod }) => P;
};

export const parseFunctionEnhanced = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
	params: ParseFunctionEnhancedParams<P, T>,
) => {
	const actionBuilder = parseFunction<P, T>(async (req) => {
		const { requireUser, action, allowedRoles = roleSet.ALL, validateParams, requireMasterKey } = params;

		const { user } = req;

		const localeInHeader = getParseFunctionHeader(req, LOCALE_HEADER_KEY);
		const locale = getCorrectLocale(localeInHeader);
		const t = getT(locale);

		if (requireMasterKey && !req.master) {
			throw new HttpException(403, t('master-key-only-function'));
		}

		const z = new CustomZod({ i18n: i18nextServer, locale });

		if (!requireUser) {
			const validatedParams = validateParams?.({ params: req.params, z });
			return action({ req, t, user, locale, z, params: validatedParams || req.params });
		}

		if (!user) {
			throw new HttpException(401, t('item-is-required', { item: t('authentication') }));
		}

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const cloudInstallationId = await getCurrentInstallationId();
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const { directAccess } = getInternalConfig();

		// verify ip address if the request is not from the cloud functions and from an user with a session token
		// in other words: verify if the call is not from our cloud code (not from our server itself)
		// * especially necessary if directAccess is set to false
		const definitelyNotFromCloud = directAccess && req.installationId !== 'cloud';
		const alsoNotFromCloud = !directAccess && req.installationId !== cloudInstallationId;

		const fromCloudEnvironment = !(definitelyNotFromCloud || alsoNotFromCloud);

		const userHasRolePromise = new RoleService(USE_MASTER_KEY).hasRole(user, allowedRoles);

		if (fromCloudEnvironment) {
			const userHasRole = await userHasRolePromise;

			// verify the roles
			if (!userHasRole) {
				throw new HttpException(403, t('unauthorized'));
			}

			const validatedParams = validateParams?.({ params: req.params, z });
			return action({ req, t, user, locale, z, params: validatedParams || req.params });
		}

		// verify the ip address
		const sessionToken = user.getSessionToken();

		const sessionPromise = new Parse.Query(Parse.Session)
			.equalTo('sessionToken', sessionToken)
			.select(['ipAddress'])
			.first({ sessionToken });

		const [session, userHasRole] = await Promise.all([sessionPromise, userHasRolePromise]);

		const localMatchConditionIp = global.LOCAL && session?.get('ipAddress') !== req.ip;
		const onlineMatchConditionIp =
			!global.LOCAL && session?.get('ipAddress') !== getParseFunctionHeader(req, 'X-Forwarded-For');

		if (localMatchConditionIp || onlineMatchConditionIp) {
			throw new Error(t('invalid-session'));
		}

		if (!userHasRole) {
			throw new HttpException(403, t('unauthorized'));
		}

		const validatedParams = validateParams?.({ params: req.params, z });
		return action({ req, user, t, locale, z, params: validatedParams || req.params });
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

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const cloudInstallationId = await getCurrentInstallationId();
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const { directAccess } = getInternalConfig();

		// verify ip address if the request is not from the cloud functions and from an user with a session token
		// in other words: verify if the call is not from our cloud code (not from our server itself)
		// * especially necessary if directAccess is set to false
		const definitelyNotFromCloud = directAccess && req.installationId !== 'cloud';
		const alsoNotFromCloud = !directAccess && req.installationId !== cloudInstallationId;

		const fromCloudEnvironment = !(definitelyNotFromCloud || alsoNotFromCloud);

		if (fromCloudEnvironment) {
			return trigger({ req, t, locale });
		}

		if (req.user) {
			// verify the ip address
			const sessionToken = req.user.getSessionToken();

			const session = await new Parse.Query(Parse.Session)
				.equalTo('sessionToken', sessionToken)
				.select(['ipAddress'])
				.first({ sessionToken });

			const localMatchConditionIp = global.LOCAL && session?.get('ipAddress') !== req.ip;
			const onlineMatchConditionIp =
				!global.LOCAL && session?.get('ipAddress') !== getParseFunctionHeader(req, 'X-Forwarded-For');

			if (localMatchConditionIp || onlineMatchConditionIp) {
				throw new Error(t('invalid-session'));
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
				throw new Error(t('item-is-required', { item: t('authentication') }));
			}

			if (req.triggerName === 'beforeFind') {
				const tenantIdInHeaders = getParseFunctionHeader(req, TENANT_ID_HEADER_KEY);
				const tenantIdInQuery: string | undefined = _.get(req.query?.toJSON(), 'where.tenant.objectId');

				const tenantId = tenantIdInHeaders || tenantIdInQuery;

				if (!tenantId) {
					throw new Error(t('unauthorized'));
				}

				const tenantObject = new ParseTenant();
				tenantObject.id = tenantId;

				const isUserMemberOfTenant = await TenantService.isUserMemberOfTenant({ user: req.user, tenant: tenantObject });

				if (!isUserMemberOfTenant) {
					throw new Error(t('unauthorized'));
				}

				// ! fetch user's permissions and apply them to the query

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

// ! There is no need for a multi-tenant parseFunction wrapper at least for now
// ! If you want to apply tenant queries better to validate tenants in the triggers instead
// type MultiTenantActionContext2<P extends Parse.Cloud.Params = Parse.Cloud.Params> = ActionContext2<P> & {
// 	fromPublic: boolean;
// 	fromStaff: boolean;
// 	fromTenantMember: boolean;
// };

// type MultiTenantActionContext1<P extends Parse.Cloud.Params = Parse.Cloud.Params> = ActionContext1<P>;

// type MultiTenantParseFunctionEnhancedParams<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
// 	| {
// 			requireUser: true;
// 			allowedRoles: IRoleConfig[];
// 			action: (ctx: MultiTenantActionContext1<P>) => Promise<T>;
// 	  }
// 	| {
// 			requireUser: false;
// 			action: (ctx: MultiTenantActionContext2<P>) => Promise<T>;
// 			allowedRoles?: undefined;
// 	  }
// ) & {
// 	validateParams: ({ params, z }: { params: Parse.Cloud.Params; z: CustomZod }) => P;
// };

// export const multiTenantParseFunctionEnhanced = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
// 	params: MultiTenantParseFunctionEnhancedParams<P, T>,
// ) => {
// 	const { action, requireUser, allowedRoles, validateParams } = params;

// 	if (!requireUser) {
// 		return parseFunctionEnhanced<P, T>({
// 			requireUser,
// 			allowedRoles,
// 			validateParams,
// 			action: async ({ locale, req, t, user, z }) => {
// 				// eslint-disable-next-line @typescript-eslint/naming-convention
// 				const { fromPublic, fromStaff: _fromStaff } = req.params;

// 				const fromTenantMember = !fromPublic && !_fromStaff;

// 				let fromStaff = _fromStaff;

// 				if (fromPublic) {
// 					if (user) {
// 						user.set('sessionToken', '');
// 					}

// 					fromStaff = false;
// 				}

// 				if (fromStaff) {
// 					if (!user) {
// 						throw new Error(t('item-is-required', { item: t('authentication') }));
// 					}

// 					const isStaff = await new RoleService(USE_MASTER_KEY).hasRole(user, roleSet.ABOVE_STAFF_CONTRIBUTOR);

// 					if (!isStaff) {
// 						throw new Error(t('user-is-not-staff'));
// 					}
// 				}

// 				const validatedParams = validateParams({ params: req.params, z });
// 				return action({ req, user, t, locale, fromPublic, fromStaff, fromTenantMember, z, params: validatedParams });
// 			},
// 		});
// 	}

// 	return parseFunctionEnhanced<P, T>({
// 		requireUser,
// 		allowedRoles,
// 		validateParams,
// 		action,
// 	});
// };
