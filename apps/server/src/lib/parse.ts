import { SchemaMigrations, type Schema } from 'parse-server';
import Config from 'parse-server/lib/Config';

import _ from 'lodash';
import type { AggregateOptions, Db, MongoClient } from 'mongodb';
import type { PipelineStage } from 'mongoose';
import { ZodError } from 'zod';

import { className as classNames, LOCALE_HEADER_KEY, type IRoleConfig } from '@devist/shared/lib/constants';
import { appLocales, defaultLocale, type AppLocale } from '@devist/shared/lib/i18n/resources';

import { pageToSkip } from '@/server/utils/any.utils';

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

type ActionContext2 = {
	req: Parse.Cloud.FunctionRequest;
	t: ReturnType<typeof getT>;
	locale: AppLocale;
	user?: Parse.User;
};

type ActionContext1 = {
	req: Parse.Cloud.FunctionRequest;
	t: ReturnType<typeof getT>;
	locale: AppLocale;
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

const hasRole = async (user: Parse.User, roles: IRoleConfig[]) => {
	const foundRole = await new Parse.Query(Parse.Role)
		.equalTo('users', user)
		.containedIn(
			'code',
			roles.map((config) => {
				return config.code;
			}),
		)
		.first(USE_MASTER_KEY);
	return !!foundRole;
};

export const parseFrom = <T = unknown>(params: ParseFromParams<T>) => {
	const innerFunction = async (req: Parse.Cloud.FunctionRequest) => {
		const { requireUser, action, allowedRoles } = params;

		const { user, headers } = req;

		const localeInHeader: string | undefined = headers?.[LOCALE_HEADER_KEY];

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

		// verify the roles
		const userHasRole = await hasRole(user, allowedRoles);

		if (!userHasRole) {
			throw new Error(t('common:insufficientRoleForAction'));
		}

		return action({ req, user, t, locale });
	};

	const actionBuilder = parseFunction<T>(innerFunction as never);

	return actionBuilder;
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

		const { headers } = req;

		const localeInHeader: string | undefined = headers?.[LOCALE_HEADER_KEY];

		const locale: AppLocale = appLocales.includes(localeInHeader as never)
			? (localeInHeader as AppLocale)
			: defaultLocale;

		const t = getT(locale);

		return trigger({ req, t, locale });
	});

	return triggerBuilder;
};

export const multiTenantTrigger = (params: ParseTriggerParams) => {
	return parseTrigger({
		trigger: async ({ locale, req, t }) => {
			const { trigger } = params;

			// maybe it's better to alter the originalQuery instead

			// in the case of a CREATE or READ or UPDATE or DELETE operation
			// we need to check if the tenant of the object and the tenant of the user match
			if (req.original) {
				const objectTenant = req.original.get('tenant');
				const userTenant = req.user?.get('tenant');

				if (objectTenant?.id !== userTenant?.id) {
					throw new Error('object tenant and user tenant do not match');
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

/**
 * More configurable aggregation method than Parse query's aggregate method.
 * Use this function when you want to provide other options than Parse Query's aggregate method.
 * For example here I specified a collation so when I am using sort, the relut will be sorted in an insensitive case manner.
 * @param className collection name
 * @param pipeline aggregation pipeline stages
 * @param options aggregation options
 * @returns a promise containing the documents
 */
export const aggregate = async (className: string, pipeline: PipelineStage[], options: AggregateOptions = {}) => {
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

export const findRoleByCode = async (code: number, useMasterKey = false) => {
	const roleQuery = new Parse.Query(Parse.Role);
	return roleQuery.equalTo('code', code).first({ useMasterKey });
};

export const assignRoleToUser = async (user: Parse.User, role: Parse.Role, useMasterKey = false) => {
	const relation = role.getUsers();
	relation.add(user);
	return role.save(null, { useMasterKey });
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

export const defineSchema = <T extends Record<string, unknown>>(className: string, schema: Schema<T>) => {
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
		targetClass: classNames.TENANT,
	};
	// eslint-disable-next-line no-param-reassign
	schema.fields = schemaFields;

	return defineSchema(className, schema);
};
