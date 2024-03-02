import { SchemaMigrations, type Schema } from 'parse-server';
import Config from 'parse-server/lib/Config.js';
import RestWrite from 'parse-server/lib/RestWrite.js';

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
import { appLocales, defaultLocale, type AppLocale } from '@devist/shared/lib/i18n/resources';

import { pageToSkip } from '@/server/utils/any.utils';

import RoleService from '../resources/role/role.service';

import { DEFAULT_CLP, USE_MASTER_KEY } from './constants';
import { getT } from './i18n';

type ParseInnerFunction<T = unknown> =
	| ((req: Parse.Cloud.TriggerRequest) => Promise<T>)
	| ((req: Parse.Cloud.FunctionRequest) => Promise<T>);
// interface ParseInnerFunction<T = unknown> {
// 	(req: Parse.Cloud.TriggerRequest): Promise<T>;
// 	(req: Parse.Cloud.FunctionRequest): Promise<T>;
// }

export const parseFunction = <T = unknown>(innerFunction: ParseInnerFunction<T>) => {
	return async (req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest): Promise<T> => {
		try {
			const result = await innerFunction(
				req as never /* as Parse.Cloud.TriggerRequest & Parse.Cloud.FunctionRequest */,
			);
			return result;
		} catch (error: unknown) {
			let message = 'Unknown error';

			// get zod errors message
			if (error instanceof ZodError) {
				message = error.issues[0].message;

				return Promise.reject(message);
			}

			return Promise.reject(error);
		}
	};
};

type BaseActionContext = {
	req: Parse.Cloud.FunctionRequest;
	t: ReturnType<typeof getT>;
	locale: AppLocale;
};

type ActionContext2 = BaseActionContext & {
	user?: Parse.User;
};

type ActionContext1 = BaseActionContext & {
	user: Parse.User;
};

type ParseFromParams<T = unknown> =
	| {
			requireUser: true;
			allowedRoles: IRoleConfig[];
			action: (ctx: ActionContext1) => Promise<T>;
	  }
	| {
			requireUser: false;
			action: (ctx: ActionContext2) => Promise<T>;
			allowedRoles?: undefined;
	  };

export const parseFrom = <T = unknown>(params: ParseFromParams<T>) => {
	const innerFunction = async (req: Parse.Cloud.FunctionRequest) => {
		const { requireUser, action, allowedRoles } = params;

		const { user, headers } = req;

		const localeInHeader: string | undefined = headers?.[_.toLower(LOCALE_HEADER_KEY)];

		const locale: AppLocale = appLocales.includes(localeInHeader as never)
			? (localeInHeader as AppLocale)
			: defaultLocale;

		const t = getT(locale);

		if (!requireUser) {
			return action({ req, t, user, locale });
		}

		if (!user) {
			throw new Error(t('common:actionRequireAuth'));
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
		const onlineMatchConditionIp = !global.LOCAL && session?.get('ipAddress') !== req.headers?.['x-forwarded-for'];

		// ! we assume that we will never call cloud functions from server cloud code
		if (localMatchConditionIp || onlineMatchConditionIp) {
			throw new Error(t('common:sessionInvalid'));
		}

		if (!userHasRole) {
			throw new Error(t('common:insufficientRoleForAction'));
		}

		return action({ req, user, t, locale });
	};

	const actionBuilder = parseFunction<T>(innerFunction as never);

	return actionBuilder;
};

type MultiTenantActionContext2 = ActionContext2 & {
	fromPublic: boolean;
	fromStaff: boolean;
	fromTenantMember: boolean;
};

type MultiTenantActionContext1 = ActionContext1;

type MultiTenantParseFromParams<T = unknown> =
	| {
			requireUser: true;
			allowedRoles: IRoleConfig[];
			action: (ctx: MultiTenantActionContext1) => Promise<T>;
	  }
	| {
			requireUser: false;
			action: (ctx: MultiTenantActionContext2) => Promise<T>;
			allowedRoles?: undefined;
	  };

export const multiTenantParseFrom = <T = unknown>(params: MultiTenantParseFromParams<T>) => {
	const { action, requireUser, allowedRoles } = params;

	if (!requireUser) {
		return parseFrom<T>({
			requireUser,
			allowedRoles,
			action: async ({ locale, req, t, user }) => {
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
						throw new Error(t('User is required'));
					}

					const isStaff = await new RoleService(USE_MASTER_KEY).hasRole(user, roleSet.ABOVE_STAFF_CONTRIBUTOR);

					if (!isStaff) {
						throw new Error(t('User is not staff'));
					}
				}

				return action({ req, user, t, locale, fromPublic, fromStaff, fromTenantMember });
			},
		});
	}

	return parseFrom<T>({
		requireUser,
		allowedRoles,
		action,
	});
};

type TriggerContext = {
	req: Parse.Cloud.TriggerRequest;
	t: ReturnType<typeof getT>;
	locale: AppLocale;
};

type ParseTriggerParams = {
	trigger: (ctx: TriggerContext) => Promise<void>;
};

export const parseTrigger = (params: ParseTriggerParams) => {
	const triggerBuilder = parseFunction(async (req: Parse.Cloud.TriggerRequest) => {
		const { trigger } = params;

		const { headers, context } = req;

		// eslint-disable-next-line @typescript-eslint/naming-convention
		let _headers: Record<string, unknown> = {};

		if (_.isObject(headers) && !_.isEmpty(headers)) {
			_headers = headers as never;
		} else if (_.isObject(context?.headers) && !_.isEmpty(context.headers)) {
			_headers = context.headers as never;
		}

		// eslint-disable-next-line @typescript-eslint/naming-convention
		const _localeInHeaders = _headers[_.toLower(LOCALE_HEADER_KEY)];
		const localeInHeaders = _.isString(_localeInHeaders) ? _localeInHeaders : undefined;

		const locale: AppLocale = appLocales.includes(localeInHeaders as never)
			? (localeInHeaders as AppLocale)
			: defaultLocale;

		const t = getT(locale);

		// ! not a good idea in my opinion after reconsideration
		// // we are not allowing any operations outside the cloud functions
		// if (req.installationId !== 'cloud') {
		// 	throw new Error(t('Operations outside the cloud functions are not allowed'));
		// }

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const cloudInstallationId = await getCurrentInstallationId();
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const { directAccess } = getConfig();

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
				const onlineMatchConditionIp = !global.LOCAL && session?.get('ipAddress') !== req.headers?.['x-forwarded-for'];

				if (localMatchConditionIp || onlineMatchConditionIp) {
					throw new Error(t('common:sessionInvalid'));
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

export const multiTenantTrigger = (params: MultiTenantTriggerParams) => {
	return parseTrigger({
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
					throw new Error(t('Tenant id is required'));
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

export const getConfig = () => {
	return Config.get(Parse.applicationId);
};

export const getMongoClient = (): MongoClient => {
	const config = getConfig();
	return config.database.adapter.client;
};

export const getDatabase = (): Db => {
	const config = getConfig();
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

export type FunctionReturn<T> = T extends (...args: never[]) => Promise<infer R> ? R : never;

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
	const config = getConfig();

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
