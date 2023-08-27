/* eslint-disable max-classes-per-file */
// declare module 'parse-server';
declare module 'parse-server/lib/Config';

declare module 'parse-server' {
	import type { Application } from 'express';
	// eslint-disable-next-line import/no-unresolved

	export type ParseServerOptions = {
		appId: string;
		masterKey: string;
		cloud: string;
		databaseURI: string;
		serverURL: string;
		publicServerURL: string;
		// =============================================
		allowClientClassCreation?: boolean;
		schema?: {
			strict?: boolean;
			definitions: SchemaMigrations.JSONSchema[];
		};
		masterKeyIps?: string[];
		allowExpiredAuthDataToken?: boolean;
		logLevel?: string;
	} & Record<string, any>;

	export default class ParseServer {
		constructor(options: ParseServerOptions);
		start(): Promise<void>;
		app: Application;
	}

	// --------------------------------------------------------------------------------------//
	//                                types from goplan-app                                  //
	// --------------------------------------------------------------------------------------//
	export namespace SchemaMigrations {
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

		interface FieldsInterface {
			[key: string]: FieldInterface;
		}

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
			| /* @Typescript 4.1+ `user:${string}` | `role:${string}` */ string;
		type CLPInfo = { [key: string]: boolean };
		type CLPData = { [key: string]: CLPOperation[] };
		// type CLPValue = { [key: string]: boolean };
		// type CLPInterface = { [key: string]: CLPValue };
		// type CLPInterface = { [key: CLPPermission]: boolean };
		type CLPInterface = Record<CLPPermission, boolean>;

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

		export interface JSONSchema {
			fields: FieldsInterface;
			indexes: IndexesInterface;
			classLevelPermissions: CPLsInterface;
		}

		export interface MigrationsOptions {
			schemas: JSONSchema[];
			strict: boolean;
			deleteExtraFields: boolean;
			recreateModifiedFields: boolean;
		}

		export class CLP {
			static allow(perms: CLPData): CLPInterface;
		}

		function makeSchema(className: ClassNameType, schema: Omit<JSONSchema, 'className'>): JSONSchema;
	}

	// logger instance
	// eslint-disable-next-line import/no-unresolved
	export { logger } from 'parse-server/lib/logger';
}

declare module 'parse-server/lib/logger' {
	// eslint-disable-next-line import/no-unresolved
	import { LoggerController } from 'parse-server/lib/Controllers/LoggerController';

	export const logger: LoggerController;

	export function setLogger(replacementLogger: LoggerController): void;
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

declare module 'parse-server/lib/Controllers/LoggerController' {
	// eslint-disable-next-line import/no-unresolved
	import { WinstonLoggerAdapter } from 'parse-server/lib/Adapters/Logger/WinstonLoggerAdapter';

	export type LogLevel = 'info' | 'error' | 'warn' | 'verbose' | 'debug' | 'silly';

	type LogRequestParams = { method: string; url: string; headers: any; body: any };
	type LogResponseParams = { method: string; url: string; result: any };

	// I Only typed important methods
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
		addTransport(transport: any); // TODO: idk
	}
}
