/* eslint-disable max-classes-per-file */
// declare module 'parse-server';
declare module 'parse-server/lib/Config';

declare module 'parse-server' {
	import type { Application } from 'express';

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
}
