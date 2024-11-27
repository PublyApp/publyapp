/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-classes-per-file */

// declare module 'parse-server';
declare module 'parse-server/lib/Config.js';
declare module 'parse-server/lib/Config';

declare module 'parse-server/lib/Auth.js';
declare module 'parse-server/lib/Auth';

declare module 'parse-server/lib/RestWrite.js';
declare module 'parse-server/lib/RestWrite';

declare module 'parse-server/lib/Routers/UsersRouter';
declare module 'parse-server/lib/Routers/UsersRouter.js';

// declare module 'parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection';
// declare module 'parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection.js';

declare module 'parse-dashboard';
declare module '@parse/fs-files-adapter';

// declare module 'parse-server';
// declare module 'parse-server/lib/logger';
// declare module 'parse-server/lib/defaults';
// declare module 'parse-server/lib/Controllers/LoggerController';
// declare module 'parse-server/lib/Adapters/Logger/WinstonLoggerAdapter';

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                        ######                                        //
//                                                                                      //
// --------------------------------------------------------------------------------------//

declare module 'parse-server/lib/index.js' {
	export * from 'parse-server';
}

declare module 'parse-server' {
	import type { OmitBaseAttributes } from 'parse';

	import type { Application, RequestHandler } from 'express';

	import type LoggerAdapter from '@/server/lib/parse/interfaces/LoggerAdapter';
	import type MailAdapter from '@/server/lib/parse/interfaces/MailAdapter';

	export type LogLevelEnum = 'error' | 'warn' | 'info' | 'debug' | 'verbose' | 'silly' | 'silent';

	export type ParseServerOptions = {
		// Required options
		appId: string;
		cloud: string | (() => Promise<void>);
		databaseURI: string;
		masterKey: string;
		publicServerURL: string;
		serverURL: string;

		// Options I actually use
		allowClientClassCreation?: boolean;
		schema?: {
			strict?: boolean;
			definitions: SchemaMigrations.JSONSchema[];
		};
		masterKeyIps?: string[];
		allowExpiredAuthDataToken?: boolean;

		silent?: boolean;
		logLevel?: LogLevelEnum;
		logLevels?: {
			cloudFunctionError: LogLevelEnum;
			cloudFunctionSuccess: LogLevelEnum;
			triggerAfter: LogLevelEnum;
			triggerBeforeError: LogLevelEnum;
			triggerBeforeSuccess: LogLevelEnum;
		};

		emailAdapter?: MailAdapter;
		loggerAdapter?: LoggerAdapter;
		enableExpressErrorHandler?: boolean;

		// Other options
		filesAdapter?: any;
		accountLockout?: AccountLockoutOptions;
		allowCustomObjectId?: boolean;
		allowHeaders?: string[];
		allowOrigin?: string | string[];
		analyticsAdapter?: any;
		appName?: string;
		auth?: Record<string, any>;
		cacheAdapter?: any;
		cacheMaxSize?: number;
		cacheTTL?: number;
		clientKey?: string;
		cluster?: number | boolean;
		collectionPrefix?: string;
		customPages?: CustomPagesOptions;
		databaseAdapter?: any;
		databaseOptions?: DatabaseOptions;
		defaultLimit?: number;
		directAccess?: boolean;
		middleware?: string | RequestHandler /*  | RequestHandler[] */;
		sessionLength?: number; // in seconds, defaults to one year
		verifyUserEmails?: boolean;
		preventLoginWithUnverifiedEmail?: boolean;
		preventSignupWithUnverifiedEmail?: boolean; // ! wtf?
		emailVerifyTokenReuseIfValid?: boolean;
		emailVerifyTokenValidityDuration?: number;
		enableAnonymousUsers?: boolean;
		enableCollationCaseComparison?: boolean;
		encodeParseObjectInCloudFunction?: boolean;
	} & Record<string, any>;

	type AccountLockoutOptions = {
		duration?: number;
		threshold?: number;
		unlockOnPasswordReset?: boolean;
	};

	type CustomPagesOptions = {
		choosePassword?: string;
		expiredVerificationLink?: string;
		invalidLink?: string;
		invalidPasswordResetLink?: string;
		invalidVerificationLink?: string;
		linkSendFail?: string;
		linkSendSuccess?: string;
		parseFrameURL?: string;
		passwordResetSuccess?: string;
		verifyEmailSuccess?: string;
	};

	type DatabaseOptions = {
		enableSchemaHooks?: boolean;
		schemaCacheTtl?: number;
	};

	export class ParseServer {
		constructor(options: ParseServerOptions);
		start(): Promise<void>;
		app: Application;
	}

	export default ParseServer;

	// --------------------------------------------------------------------------------------//
	//                                types from goplan-app                                  //
	// --------------------------------------------------------------------------------------//
	export type FieldValueType =
		| 'String'
		| 'Boolean'
		| 'File'
		| 'Number'
		| 'Relation'
		| 'Pointer'
		| 'Date'
		| 'GeoPoint'
		| 'Polygon'
		| 'Array'
		| 'Object';

	interface FieldInterface {
		type: FieldValueType;
		targetClass?: string;
		required?: boolean;
		defaultValue?: number | string | unknown;
	}

	type ClassNameType = '_User' | '_Role' | string;

	export interface ProtectedFieldsInterface {
		[key: string]: string[];
	}

	type FieldsInterface<T extends Record<string, any> = Record<string, any>> = {
		[P in keyof OmitBaseAttributes<T>]: FieldInterface;
	};
	// interface FieldsInterface<T extends Record<string, any> = Record<string, any>> {
	// [key: string]: FieldInterface;
	// }

	export interface IndexInterface {
		[key: string]: number;
	}

	export interface IndexesInterface {
		[key: string]: IndexInterface;
	}

	export type CLPOperation = 'find' | 'count' | 'get' | 'update' | 'create' | 'delete';
	type CLPPermission =
		| 'requiresAuthentication'
		| '*'
		// @Typescript 4.1+
		| `user:${string}`
		| `role:${string}`;
	type CLPInfo = { [key: string]: boolean };
	type CLPData = { [key: string]: CLPOperation[] };
	// type CLPValue = { [key: string]: boolean };
	// type CLPInterface = { [key: string]: CLPValue };
	// type CLPInterface = { [key: CLPPermission]: boolean };
	type CLPInterface = Partial<Record<CLPPermission, boolean>>;

	export interface CPLsInterface {
		find?: CLPInterface;
		count?: CLPInterface;
		get?: CLPInterface;
		update?: CLPInterface;
		create?: CLPInterface;
		delete?: CLPInterface;
		addField?: CLPInterface;
		protectedFields?: ProtectedFieldsInterface;
	}

	export interface JSONSchema<T extends Record<string, any> = Record<string, any>> {
		fields: FieldsInterface<T>;
		indexes: IndexesInterface;
		classLevelPermissions: CPLsInterface;
		className: string;
	}

	export interface MigrationsOptions {
		schemas: JSONSchema[];
		strict: boolean;
		deleteExtraFields: boolean;
		recreateModifiedFields: boolean;
	}

	export type Schema<T> = Omit<JSONSchema<T>, 'className'>;

	export namespace SchemaMigrations {
		class CLP {
			static allow(perms: CLPData): CLPInterface;
		}

		function makeSchema<T extends Record<string, any> = Record<string, any>>(
			className: ClassNameType,
			schema: Schema<T>,
		): JSONSchema<T>;
	}

	// logger instance
	// eslint-disable-next-line import/no-unresolved
	// export { logger } from 'parse-server/lib/logger';
}

declare module 'parse-server/lib/logger.js' {
	export * from 'parse-server/lib/logger';
}

declare module 'parse-server/lib/logger' {
	// eslint-disable-next-line import/no-unresolved
	import type { LoggerController } from 'parse-server/lib/Controllers/LoggerController';

	// export const logger: LoggerController;

	export function setLogger(replacementLogger: LoggerController): void;

	export function getLogger(): LoggerController;
}

declare module 'parse-server/lib/defaults' {
	const defaults: {
		logsFolder: string;
		jsonLogs: string;
		verbose: boolean;
		silent: boolean;
	};
	export default defaults;
}

declare module 'parse-server/lib/defaults.js' {
	export * from 'parse-server/lib/defaults';
	import defaults from 'parse-server/lib/defaults';

	export default defaults;
}

declare module 'parse-server/lib/Controllers/LoggerController' {
	// eslint-disable-next-line import/no-unresolved
	import type { WinstonLoggerAdapter } from 'parse-server/lib/Adapters/Logger/WinstonLoggerAdapter';

	export type LogLevel = 'info' | 'error' | 'warn' | 'verbose' | 'debug' | 'silly';

	type LogRequestParams = { method: string; url: string; headers: any; body: any };
	type LogResponseParams = { method: string; url: string; result: any };

	// ! I Only typed important methods
	/* eslint-disable @typescript-eslint/no-explicit-any */
	export class LoggerController /*  extends AdaptableController */ {
		adapter: WinstonLoggerAdapter;

		log(level: LogLevel, ...args: any[]);

		info(...args: any[]): void;

		error(...args: any[]): void;

		warn(...args: any[]);

		verbose(...args: any[]);

		debug(...args: any[]);

		silly(...args: any[]);

		logRequest(request: LogRequestParams): void;

		logResponse(response: LogResponseParams): void;

		truncateLogMessage(string: string): string;
	}
}

declare module 'parse-server/lib/Adapters/Logger/WinstonLoggerAdapter' {
	class WinstonLoggerAdapter {
		addTransport(transport: any);
	}
}

declare module 'parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection.js' {
	import MongoSchemaCollectionModule from 'parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection';

	export default {
		default: MongoSchemaCollectionModule.default,
	};
}

declare module 'parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection' {
	class MongoSchemaCollection {
		static parseFieldTypeToMongoFieldType(options: { type: string; targetClass?: string }): string;
	}

	export default {
		default: MongoSchemaCollection,
	};
}

declare module 'parse-server/lib/cryptoUtils.js' {
	export * from 'parse-server/lib/cryptoUtils';
}

declare module 'parse-server/lib/cryptoUtils' {
	export function randomHexString(size: number): string;
	export function randomString(size: number): string;
	export function newObjectId(size: number = 10): string;
	export function newToken(): string;
	export function md5Hash(string: string): string;
}

declare module 'parse-server/lib/password.js' {
	export * from 'parse-server/lib/password';
}

declare module 'parse-server/lib/password' {
	export function hash(password: string): string;
	export function compare(password: string, hashedPassword: string): boolean;
}
