import { SchemaMigrations, type Schema } from 'parse-server';
import Config from 'parse-server/lib/Config.js';
import RestWrite from 'parse-server/lib/RestWrite.js';

import dayjs from 'dayjs';
import _ from 'lodash';
import type { AggregateOptions, Db, MongoClient } from 'mongodb';
import { ZodError } from 'zod';

import {
	className as _className,
	LOCALE_HEADER_KEY,
	roleSet,
	TENANT_ID_HEADER_KEY,
	type IRoleConfig,
} from '@devist/shared/lib/constants';
import { type AppLocale } from '@devist/shared/lib/i18n/resources';

import { pageToSkip } from '@/server/utils/any.utils';
import CustomZod from '@/shared/lib/zod/CustomZod';

import RoleService from '../../resources/role/role.service';
import { DEFAULT_CLP, USE_MASTER_KEY } from '../constants';
import { getCorrectLocale, getT } from '../i18n';

export const getParseFunctionHeader = (
	req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest,
	key: string,
): string | undefined => {
	return req.headers?.[key] || req.headers?.[_.toLower(key)];
};

type ParseTrigger<T = unknown> = (req: Parse.Cloud.TriggerRequest) => Promise<T>;
type ParseFunction<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	req: Parse.Cloud.FunctionRequest<P>,
) => Promise<T>;

type ParseInnerFunction<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> =
	| ParseFunction<P, T>
	| ParseTrigger<T>;
// interface ParseInnerFunction<T = unknown> {
// 	(req: Parse.Cloud.TriggerRequest): Promise<T>;
// 	(req: Parse.Cloud.FunctionRequest): Promise<T>;
// }

type CloudFunction = {
	<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
		innerFunction: ParseFunction<P, T>,
	): ParseFunction<P, T>;
	<T = unknown>(innerFunction: ParseTrigger<T>): ParseTrigger<T>;
};

const isTriggerRequest = (
	req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest,
): req is Parse.Cloud.TriggerRequest => {
	return !_.isNil((req as Parse.Cloud.TriggerRequest).triggerName);
};

export const cloudFunction: CloudFunction = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
	innerFunction: ParseInnerFunction<P, T>,
) => {
	return async (req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest<P>): Promise<T> => {
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
			allowedRoles?: IRoleConfig[] | undefined;
			action: (ctx: ActionContext1<P>) => Promise<T>;
	  }
	| {
			requireUser?: false | undefined;
			allowedRoles?: undefined;
			action: (ctx: ActionContext2<P>) => Promise<T>;
	  }
) & {
	validateParams?: ({ params, z }: { params: Parse.Cloud.Params; z: CustomZod }) => P;
};

export const parseFunctionEnhanced = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
	params: ParseFunctionEnhancedParams<P, T>,
) => {
	const actionBuilder = parseFunction<P, T>(async (req) => {
		const { requireUser, action, allowedRoles = roleSet.ALL, validateParams } = params;

		const { user } = req;

		const localeInHeader = getParseFunctionHeader(req, LOCALE_HEADER_KEY);
		const locale = getCorrectLocale(localeInHeader);
		const t = getT(locale);
		const z = new CustomZod(t);

		if (!requireUser) {
			const validatedParams = validateParams?.({ params: req.params, z });
			return action({ req, t, user, locale, z, params: validatedParams || req.params });
		}

		if (!user) {
			throw new Error(t('item-is-required', { item: t('authentication') }));
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
			!global.LOCAL && session?.get('ipAddress') !== getParseFunctionHeader(req, 'X-forwarded-For');

		// ! we assume that we will never call cloud functions from server cloud code
		if (localMatchConditionIp || onlineMatchConditionIp) {
			throw new Error(t('invalid-session'));
		}

		if (!userHasRole) {
			throw new Error(t('insufficient-role'));
		}

		const validatedParams = validateParams?.({ params: req.params, z });
		return action({ req, user, t, locale, z, params: validatedParams || req.params });
	});

	return actionBuilder;
};

type MultiTenantActionContext2<P extends Parse.Cloud.Params = Parse.Cloud.Params> = ActionContext2<P> & {
	fromPublic: boolean;
	fromStaff: boolean;
	fromTenantMember: boolean;
};

type MultiTenantActionContext1<P extends Parse.Cloud.Params = Parse.Cloud.Params> = ActionContext1<P>;

type MultiTenantParseFunctionEnhancedParams<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown> = (
	| {
			requireUser: true;
			allowedRoles: IRoleConfig[];
			action: (ctx: MultiTenantActionContext1<P>) => Promise<T>;
	  }
	| {
			requireUser: false;
			action: (ctx: MultiTenantActionContext2<P>) => Promise<T>;
			allowedRoles?: undefined;
	  }
) & {
	validateParams: ({ params, z }: { params: Parse.Cloud.Params; z: CustomZod }) => P;
};

export const multiTenantParseFunctionEnhanced = <P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
	params: MultiTenantParseFunctionEnhancedParams<P, T>,
) => {
	const { action, requireUser, allowedRoles, validateParams } = params;

	if (!requireUser) {
		return parseFunctionEnhanced<P, T>({
			requireUser,
			allowedRoles,
			validateParams,
			action: async ({ locale, req, t, user, z }) => {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				const { fromPublic, fromStaff: _fromStaff } = req.params;

				const fromTenantMember = !fromPublic && !_fromStaff;

				let fromStaff = _fromStaff;

				if (fromPublic) {
					if (user) {
						user.set('sessionToken', '');
					}

					fromStaff = false;
				}

				if (fromStaff) {
					if (!user) {
						throw new Error(t('item-is-required', { item: t('authentication') }));
					}

					const isStaff = await new RoleService(USE_MASTER_KEY).hasRole(user, roleSet.ABOVE_STAFF_CONTRIBUTOR);

					if (!isStaff) {
						throw new Error(t('user-is-not-staff'));
					}
				}

				const validatedParams = validateParams({ params: req.params, z });
				return action({ req, user, t, locale, fromPublic, fromStaff, fromTenantMember, z, params: validatedParams });
			},
		});
	}

	return parseFunctionEnhanced<P, T>({
		requireUser,
		allowedRoles,
		validateParams,
		action,
	});
};

type TriggerContext = {
	req: Parse.Cloud.TriggerRequest;
	t: ReturnType<typeof getT>;
	locale: AppLocale;
};

export const parseTrigger = <T = unknown>(innerFunction: ParseTrigger<T>) => {
	return cloudFunction<T>(innerFunction);
};

type ParseTriggerEnhancedParams = {
	trigger: (ctx: TriggerContext) => Promise<void>;
};

export const parseTriggerEnhanced = (params: ParseTriggerEnhancedParams) => {
	const triggerBuilder = parseTrigger(async (req /* : Parse.Cloud.TriggerRequest */) => {
		const { trigger } = params;

		const localeInHeaders = getParseFunctionHeader(req, LOCALE_HEADER_KEY);
		const localeInContext = _.isString(req.context?.locale) ? req.context.locale : undefined;

		const locale = getCorrectLocale(localeInContext || localeInHeaders);
		const t = getT(locale);

		// ! not a good idea in my opinion after reconsideration
		// // we are not allowing any operations outside the cloud functions
		// if (req.installationId !== 'cloud') {
		// 	throw new Error(t('Operations outside the cloud functions are not allowed'));
		// }

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const cloudInstallationId = await getCurrentInstallationId();
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const { directAccess } = getInternalConfig();

		// verify ip address if the request is not from the cloud functions and from an user with a session token
		// * especially necessary if directAccess is set to false
		if (
			(directAccess && req.installationId !== 'cloud') ||
			(!directAccess && req.installationId !== cloudInstallationId)
		) {
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

			const { headers, context } = req;
			const fromPublic = context?.fromPublic;
			const fromStaff = context?.fromStaff;

			// eslint-disable-next-line @typescript-eslint/naming-convention
			let _headers: Record<string, unknown> = {};

			if (_.isObject(headers) && !_.isEmpty(headers)) {
				_headers = headers as never;
			} else if (_.isObject(context?.headers) && !_.isEmpty(context.headers)) {
				_headers = context.headers as never;
			}

			// eslint-disable-next-line @typescript-eslint/naming-convention
			const _tenantId = _headers[_.toLower(TENANT_ID_HEADER_KEY)];
			const tenantId = _.isString(_tenantId) ? _tenantId : undefined;

			if (req.triggerName === 'beforeFind') {
				if (!tenantId && !req.master && !fromStaff && !fromPublic) {
					throw new Error(t('item-is-required', { item: 'tenantId' }));
				}

				// if (isPublic) {
				// 	return trigger({ locale, req, t });
				// }

				if (tenantId) {
					req.query?.equalTo('tenant', tenantId);
					return trigger({ locale, req, t, tenantId });
				}
			}

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

// export type FunctionReturn<T> = T extends (...args: never[]) => Promise<infer R> ? R : never;
// export type FunctionParams<T> = T extends (...args: infer P) => Promise<never> ? P : never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FunctionReturn<T extends ParseFunction<any, any>> = Awaited<ReturnType<T>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FunctionParams<T extends ParseFunction<any, any>> = Parameters<T>[0]['params'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defineSchema = <T extends Record<string, any> = Record<string, any>>(
	className: string,
	schema: Partial<Omit<Schema<T>, 'fields'>> & Pick<Schema<T>, 'fields'>,
) => {
	const fields = schema.fields || undefined;
	const classLevelPermissions = schema.classLevelPermissions || DEFAULT_CLP;
	const indexes = schema.indexes || {};

	return SchemaMigrations.makeSchema(className, {
		fields,
		classLevelPermissions,
		indexes,
	});
};

export const defineMultiTenantSchema = <T extends Record<string, unknown>>(className: string, schema: Schema<T>) => {
	const schemaFields = schema.fields || {};
	(schemaFields as Record<string, unknown>).tenant = {
		type: 'Pointer',
		required: true,
		targetClass: _className.TENANT,
	};
	// eslint-disable-next-line no-param-reassign
	schema.fields = schemaFields;

	return defineSchema(className, schema);
};

// export const checkFromWho = ({ fromPublic, fromStaff, sessionToken, t }: { fromPublic: string | undefined, fromStaff: string | undefined, sessionToken?: string, t: TFunction }) => {
// 	if (fromPublic) {
// 		sessionToken = undefined;
// 		fromStaff = false;
// 	}

// 	if (fromStaff) {
// 		if (!user) {
// 			throw new Error(t('User is required'));
// 		}

// 		const isStaff = await hasRole(user, roleSet.ABOVE_STAFF_CONTRIBUTOR);

// 		if (!isStaff) {
// 			throw new Error(t('User is not staff'));
// 		}
// 	}
// };

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
 * code taken from Parse.UsersRouter's handleLogIn
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
