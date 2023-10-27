/* eslint-disable max-classes-per-file */
import DefaultParseServer from 'parse-server';

import type { Express } from 'express';

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
		// definitions: SchemaMigrations.JSONSchema[];
		definitions: any[]; // TODO: ?
	};
	masterKeyIps?: string[];
	allowExpiredAuthDataToken?: boolean;
	logLevel?: string;
	// filesAdapter?: any;
};

// type AppOptions = {
// 	maxUploadSize: string;
// 	appId, directAccess, pages, rateLimit = []
// };

export default class ParseServer extends DefaultParseServer {
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor
	constructor(options: ParseServerOptions) {
		super(options);
	}

	async start(): Promise<this> {
		return super.start();
	}

	get app(): Express {
		return super.app;
	}

	async handleShutdown(): Promise<void> {
		return super.handleShutdown();
	}

	// TODO: type options
	static app(options: any): Express {
		return DefaultParseServer.app(options);
	}

	// TODO: types
	static promiseRouter({ appId }): any {
		return DefaultParseServer.promiseRouter();
	}

	async startApp(options: ParseServerOptions): Promise<this> {
		return super.startApp(options);
	}

	static async startApp(options: ParseServerOptions): Promise<ParseServer> {
		return DefaultParseServer.startApp(options);
	}

	static async verifyServerUrl(): Promise<void | boolean> {
		return DefaultParseServer.verifyServerUrl();
	}

	// todo liveQuery methods ??
}
