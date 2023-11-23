import { logger } from 'parse-server';
import Config from 'parse-server/lib/Config';

import _ from 'lodash';
import type { AggregateOptions, Db, MongoClient } from 'mongodb';
import type { PipelineStage } from 'mongoose';
import { ZodError } from 'zod';

import { LOCALE_HEADER_KEY, type IRoleConfig } from '@devist/shared/lib/constants';
import { defaultLocale } from '@devist/shared/lib/i18n/resources';

import { pageToSkip } from '@server/utils/any.utils';

import { USE_MASTER_KEY } from './constants';
import { getT } from './i18n';

type ParseInnerFunction<T = unknown> =
	| ((req: Parse.Cloud.TriggerRequest) => Promise<T>)
	| ((req: Parse.Cloud.FunctionRequest) => Promise<T>);

export const parseFunction = <T = unknown>(innerFunction: ParseInnerFunction<T>) => {
	return async (req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest): Promise<T> => {
		try {
			const result = await innerFunction(req as Parse.Cloud.TriggerRequest & Parse.Cloud.FunctionRequest);
			return result;
		} catch (error: unknown) {
			if (global.LOCAL) {
				// eslint-disable-next-line no-console
				console.trace(error);
			}

			let message;

			// get message for generic errors
			if (_.isObject(error) && 'message' in error) {
				message = error.message;
			} else {
				message = 'Unknown error';
			}

			// get zod errors message
			if (error instanceof ZodError) {
				message = error.issues[0].message;
			}

			logger.error(error);
			return Promise.reject(message);
		}
	};
};

type ActionContext2 = {
	req: Parse.Cloud.FunctionRequest;
	t: ReturnType<typeof getT>;
	user?: Parse.User;
};

type ActionContext1 = {
	req: Parse.Cloud.FunctionRequest;
	t: ReturnType<typeof getT>;
	user: Parse.User;
};

type ParseFromParams =
	| {
			requireUser: true;
			allowedRoles: IRoleConfig[];
			action: (ctx: ActionContext1) => Promise<unknown>;
	  }
	| {
			requireUser: false;
			action: (ctx: ActionContext2) => Promise<unknown>;
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

export const parseFrom = (params: ParseFromParams) => {
	const actionBuilder = parseFunction(async (req: Parse.Cloud.FunctionRequest) => {
		const { requireUser, action, allowedRoles } = params;

		const { user, headers } = req;

		const locale = headers[LOCALE_HEADER_KEY] as string | undefined;

		const t = getT(locale || defaultLocale);

		if (!requireUser) {
			return action({ req, t, user });
		}

		if (!user) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			throw new Error(t('common:actionRequireAuth')!);
		}

		// verify the roles
		const userHasRole = await hasRole(user, allowedRoles);

		if (!userHasRole) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			throw new Error(t('common:insufficientRoleForAction')!);
		}

		return action({ req, user, t });
	});

	return actionBuilder;
};

type TriggerContext = {
	req: Parse.Cloud.TriggerRequest;
	t: ReturnType<typeof getT>;
};

type ParseTriggerParams = {
	trigger: (ctx: TriggerContext) => Promise<void>;
};

export const parseTrigger = (params: ParseTriggerParams) => {
	const triggerBuilder = parseFunction(async (req: Parse.Cloud.TriggerRequest) => {
		const { trigger } = params;

		const { headers } = req;

		const locale = headers[LOCALE_HEADER_KEY] as string | undefined;

		const t = getT(locale || defaultLocale);

		return trigger({ req, t });
	});

	return triggerBuilder;
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
