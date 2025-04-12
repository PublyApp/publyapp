import _ from 'lodash';
import Config from 'parse-server/lib/Config.js';
import RestWrite from 'parse-server/lib/RestWrite.js';

import dayjs from 'dayjs';
import type { AggregateOptions, Db, MongoClient } from 'mongodb';

import { CLOUD_INSTALLATION_ID, USE_MASTER_KEY } from '../constants';

export const reOrderObjects = <T extends Parse.Object = Parse.Object>(
	ids: string[],
	objects: T[],
) => {
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

export const setCurrentInstallationId = async (/* newId: string */) => {
	const CURRENT_INSTALLATION_KEY = 'currentInstallation';

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	// return
	await Parse.Storage.setItemAsync(
		CURRENT_INSTALLATION_KEY,
		/* newId */ CLOUD_INSTALLATION_ID,
	);
	Parse.CoreManager.getInstallationController()._setInstallationIdCache(
		/* newId */ CLOUD_INSTALLATION_ID,
	);
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
export const aggregate = async (
	className: string,
	pipeline: Parse.PipelineStage[],
	options: AggregateOptions = {},
) => {
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

	const results = await collection
		.aggregate(pipeline, aggregationOptions)
		.toArray();

	return results;
};

export type CreateSessionOptions<
	AdditionalSessionData extends Record<string, unknown> = Record<
		string,
		unknown
	>,
> = {
	userId: string;
	action?: string;
	authProvider?: string;
	installationId?: string;
	additionalSessionData?: AdditionalSessionData;
	sessionToken?: string;
};

type CreateSessionResult<
	AdditionalSessionData extends Record<string, unknown> = Record<
		string,
		unknown
	>,
> = {
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
	AdditionalSessionData extends Record<string, unknown> = Record<
		string,
		unknown
	>,
>(
	options: CreateSessionOptions<AdditionalSessionData>,
): Promise<CreateSessionResult<AdditionalSessionData>> => {
	const {
		userId,
		action = 'login',
		authProvider = 'password',
		installationId,
		additionalSessionData,
	} = options;
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

export const setGlobalConfig = async (
	attributes: Record<string, { value: Serializable; masterKeyOnly?: boolean }>,
) => {
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

export const parseFields = [
	'_hashed_password',
	'_perishable_token',
	'_email_verify_token',
	'_session_token',
	'ACL',
	'createdAt',
	'updatedAt',
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const removeParseFields = (
	obj: Record<string, any>,
	omitFields?: string[],
) => {
	const newObj = _.omit(obj, omitFields || parseFields);
	return newObj;
};
