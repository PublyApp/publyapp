import Config from 'parse-server/lib/Config.js';
import RestWrite from 'parse-server/lib/RestWrite.js';

import dayjs from 'dayjs';
import _ from 'lodash';
import type { AggregateOptions, Db, MongoClient } from 'mongodb';
import { ZodError } from 'zod';

import {
	className as appClassName,
	LOCALE_HEADER_KEY,
	roleSet,
	TENANT_ID_HEADER_KEY,
	type IRoleConfig,
	type RoleSet,
} from '@devist/shared/lib/constants';
import { type AppLocale } from '@devist/shared/lib/i18n/resources';

import RoleService from '@/server/modules/auth/role/role.service';
// import TenantService from '@/server/modules/auth/tenant/tenant.service';
import { pageToSkip } from '@/server/utils/any.utils';
import CustomZod from '@/shared/lib/zod/CustomZod';

import { CLOUD_INSTALLATION_ID, USE_MASTER_KEY } from '../constants';
import { getCorrectLocale, getT, i18nextServer } from '../i18n';

export const getParseFunctionHeader = (
	req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest,
	key: string,
): string | undefined => {
	return _.get(req, `req.headers.${key}`) || _.get(req, `req.headers.${_.toLower(key)}`);
};

type ParseFunction<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	req: Parse.Cloud.FunctionRequest<P>,
) => Promise<T>;

type ParseTrigger<P extends Parse.Object = Parse.Object, T = unknown> = (
	req: Parse.Cloud.TriggerRequest<P>,
) => Promise<T>;

type ParseJob<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	req: Parse.Cloud.JobRequest<P>,
) => Promise<T>;

type ParseInnerFunction<
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
	O extends Parse.Object = Parse.Object,
> = ParseFunction<P, T> | ParseTrigger<O, T> | ParseJob<P, T>;

type CloudFunction = {
	<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
		innerFunction: ParseFunction<P, T>,
	): ParseFunction<P, T>;
	<P extends Parse.Object = Parse.Object, T = unknown>(innerFunction: ParseTrigger<P, T>): ParseTrigger<P, T>;
	<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(innerFunction: ParseJob<P, T>): ParseJob<P, T>;
};

const isTriggerRequest = (
	req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest,
): req is Parse.Cloud.TriggerRequest => {
	return !_.isNil((req as Parse.Cloud.TriggerRequest).triggerName);
};

export const cloudFunction: CloudFunction = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
	innerFunction: ParseInnerFunction<P, T>,
) => {
	return async (
		req: Parse.Cloud.FunctionRequest<P> | Parse.Cloud.TriggerRequest | Parse.Cloud.JobRequest<P>,
	): Promise<T> => {
		try {
			const result = await innerFunction(req as never);
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
				return Promise.reject(message);
			}

			if (error instanceof Error) {
				return Promise.reject(error);
			}

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
			throw new Error(t('master-key-only-function'));
		}

		const z = new CustomZod({ i18n: i18nextServer, locale });

		if (!requireUser) {
			const validatedParams = validateParams?.({ params: req.params, z });
			return action({ req, t, user, locale, z, params: validatedParams || req.params });
		}

		if (!user) {
			throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, t('item-is-required', { item: t('authentication') }));
		}

		// verify the ip address
		const sessionToken = user.getSessionToken();

		const sessionPromise = new Parse.Query(Parse.Session)
			.equalTo('sessionToken', sessionToken)
			.select(['ipAddress'])
			.first({ sessionToken });

		// verify the roles
		const userHasRolePromise = new RoleService(USE_MASTER_KEY).hasRole(user, allowedRoles);

		const [session, userHasRole] = await Promise.all([sessionPromise, userHasRolePromise]);

		const localMatchConditionIp = global.LOCAL && session?.get('ipAddress') !== req.ip;
		const onlineMatchConditionIp =
			!global.LOCAL && session?.get('ipAddress') !== getParseFunctionHeader(req, 'X-Forwarded-For');

		// ! we assume that we will never call cloud functions from server cloud code
		if (localMatchConditionIp || onlineMatchConditionIp) {
			throw new Error(t('invalid-session'));
		}

		if (!userHasRole) {
			throw new Error(t('unauthorized'));
		}

		const validatedParams = validateParams?.({ params: req.params, z });
		return action({ req, user, t, locale, z, params: validatedParams || req.params });
	});

	return actionBuilder;
};

// ! There is no need for a multi-tenant parseFunction wrapper
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

		if (definitelyNotFromCloud || alsoNotFromCloud) {
			if (req.user) {
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
		} // else: if from cloud, no need to check because it is us who perform calls in our server environment

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

			if (req.triggerName === 'beforeFind') {
				const tenantIdInHeaders = getParseFunctionHeader(req, TENANT_ID_HEADER_KEY);

				if (!tenantIdInHeaders) {
					if (!_.get(req.query?.toJSON(), 'where.tenant')) {
						throw new Error(t('unauthorized'));
					}

					// // TODO: verify if user is member of requested tenant ???
					// const isUserMemberOfTenant = await TenantService.isUserMemberOfTenant({ user: req.user, tenant });

					// if (!isUserMemberOfTenant) {
					// 	throw new Error(t('unauthorized'));
					// }

					return trigger({ locale, req, t });
				}

				// // TODO: verify if user is member of requested tenant ???
				// const isUserMemberOfTenant = await TenantService.isUserMemberOfTenant({ user: req.user, tenant });

				// if (!isUserMemberOfTenant) {
				// 	throw new Error(t('unauthorized'));
				// }

				const tenant = new Parse.Object(appClassName.TENANT);
				tenant.id = tenantIdInHeaders;
				req.query?.equalTo('tenant', tenant);
			}

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

			return trigger({ locale, req, t });
		},
	});
};

export const reOrderObjects = <T extends Parse.Object = Parse.Object>(ids: string[], objects: T[]) => {
	const objectsMap = new Map<string, T>();

	objects.forEach((iWebHost) => {
		objectsMap.set(iWebHost.id, iWebHost);
	});

	const orderedObjects: T[] = [];

	ids.forEach((id) => {
		const inMap = objectsMap.get(id);

		if (inMap) {
			orderedObjects.push(inMap);
		}
	});

	return orderedObjects;
};

export const parseJob = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
	innerFunction: ParseJob<P, T>,
) => {
	return cloudFunction<P, T>(innerFunction);
};

export const getInternalConfig = () => {
	return Config.get(Parse.applicationId);
};

export const getMongoClient = (): MongoClient => {
	const config = getInternalConfig();
	return config.database.adapter.client;
};

export const getDatabase = (): Db => {
	const config = getInternalConfig();
	return config.database.adapter.database;
};

export const getCurrentInstallationId = async () => {
	return Parse.CoreManager.getInstallationController().currentInstallationId();
};

export const setCurrentInstallationId = async (/* newId: string */) => {
	const CURRENT_INSTALLATION_KEY = 'currentInstallation';

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	// return
	await Parse.Storage.setItemAsync(CURRENT_INSTALLATION_KEY, /* newId */ CLOUD_INSTALLATION_ID);
	Parse.CoreManager.getInstallationController()._setInstallationIdCache(/* newId */ CLOUD_INSTALLATION_ID);
};

/**
 * More configurable aggregation method than Parse query's aggregate method.
 * Use this function when you want to provide other options than Parse Query's aggregate method.
 * For example here I specified a collation so when I am using sort, the relut will be sorted in an insensitive case manner.
 * @param className collection name
 * @param pipeline aggregation pipeline stages
 * @param options aggregation options
 * @returns a promise containing the documents
 */
export const aggregate = async (className: string, pipeline: Parse.PipelineStage[], options: AggregateOptions = {}) => {
	const collection = getDatabase().collection(className);

	const aggregationOptions = _.merge(
		{
			collation: {
				locale: 'en_US',
				strength: 2,
			},
		},
		options,
	);

	const results = await collection.aggregate(pipeline, aggregationOptions).toArray();

	return results;
};

export type QueryOptions = {
	select?: string[];
	include?: string[];
	exclude?: string[];
};

export const applyQueryOptions = (query: Parse.Query, options: QueryOptions) => {
	if (options.exclude) {
		query.exclude(options.exclude as never);
	}

	if (options.select) {
		query.select(options.select as never);
	}

	if (options.include) {
		query.include(options.include as never);
	}
};

export type LimitAndSkipOptions =
	| {
			type: 'limit';
			limit: number;
			skip: number;
	  }
	| {
			type: 'page';
			page: number;
			pageSize: number;
	  };

export const applySkipAndLimit = (query: Parse.Query, options: LimitAndSkipOptions) => {
	if (options.type === 'limit') {
		query.skip(options.skip).limit(options.limit);
	}

	if (options.type === 'page') {
		const skip = pageToSkip(options.page);
		query.skip(skip).limit(options.pageSize);
	}
};

export const applySorting = (query: Parse.Query, sorting: { id: string; desc: boolean }[]) => {
	for (const element of sorting) {
		if (element.desc) {
			query.addDescending(element.id as never);
		} else {
			query.addAscending(element.id as never);
		}
	}
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FunctionReturn<T extends ParseFunction<any, any>> = Awaited<ReturnType<T>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FunctionParams<T extends ParseFunction<any, any>> = Parameters<T>[0]['params'];

export type CreateSessionOptions<AdditionalSessionData extends Record<string, unknown> = Record<string, unknown>> = {
	userId: string;
	action?: string;
	authProvider?: string;
	installationId?: string;
	additionalSessionData?: AdditionalSessionData;
	sessionToken?: string;
};

type CreateSessionResult<AdditionalSessionData extends Record<string, unknown> = Record<string, unknown>> = {
	sessionToken: string;
	user: {
		__type: string;
		className: string;
		objectId: string;
	};
	createdWith: {
		action: string;
		authProvider: string;
	};
	expiresAt: unknown; // todo: fix this
} & AdditionalSessionData;

/**
 * creates a session using the masterKey,
 * code taken from Parse.UsersRouter's handleLogin
 * @param {CreateSessionOptions} options
 * @param {string} options.userId
 * @param {string} options.action can be 'login' or 'signup' or 'masterKey' or whatever, defaults to 'login'
 * @param {string} options.authProvider can be 'password' or 'facebook' (or 'google'...), defaults to 'password'
 * @param {string} options.installationId
 * @param {object} options.additionalSessionData additional fields that will be added to the session object
 *
 */
export const createSessionServer = async <
	AdditionalSessionData extends Record<string, unknown> = Record<string, unknown>,
>(
	options: CreateSessionOptions<AdditionalSessionData>,
): Promise<CreateSessionResult<AdditionalSessionData>> => {
	const { userId, action = 'login', authProvider = 'password', installationId, additionalSessionData } = options;
	const config = getInternalConfig();

	const result = RestWrite.createSession(config, {
		userId,
		createdWith: {
			action,
			authProvider,
		},
		installationId,
		additionalSessionData,
	});

	const { sessionData, createSession } = result;

	await createSession();

	return sessionData;
};

type EncodedDateType =
	| string
	| number
	| {
			__type: 'Date';
			iso: string;
	  }
	| null
	| undefined;

export const toIsoString = (value: EncodedDateType) => {
	// if (_.isNil(value)) {
	// 	return undefined;
	// }

	if (_.isString(value)) {
		return dayjs(value).toISOString();
	}

	if (_.isNumber(value)) {
		return dayjs(value).toISOString();
	}

	if (_.isObject(value)) {
		return dayjs(value.iso).toISOString();
	}

	return undefined;
};

export const getGlobalConfig = async () => {
	const config = await Parse.Config.get(USE_MASTER_KEY);
	return config;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Serializable = string | number | Record<string, any> | any[] | boolean;

export const setGlobalConfig = async (attributes: Record<string, { value: Serializable; masterKeyOnly?: boolean }>) => {
	const entries = _.entries(attributes);

	const param1: Record<string, Serializable> = {};
	const param2: Record<string, boolean> = {};

	entries.forEach(([key, { value, masterKeyOnly }]) => {
		param1[key] = value;

		if (!_.isNil(masterKeyOnly)) {
			param2[key] = masterKeyOnly;
		}
	});

	const config = await Parse.Config.save(param1, param2);
	return config;
};
