import path from 'path';

import ParseServer, { logger } from 'parse-server';

import FSFilesAdapter from '@parse/fs-files-adapter';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import express from 'express';
import ParseDashboard from 'parse-dashboard';

import { endPoint } from '@/shared/lib/constants';

import { createIndexes, createRolesIfNotExists, createUploadDirIfNotExists } from './helpers/helpers';
import { corsWhiteList, FILE_UPLOAD_DESTINATION } from './lib/constants';
import { env, envSchema, setAppEnv } from './lib/env';
import { consoleTransport } from './lib/logger';
import { multerConfig } from './lib/multer';
import { cors } from './middlewares/cors.middleware';
import errorMiddleware from './middlewares/error.middleware';
import protectionMiddleware from './middlewares/protection.middleware';
import AppFileSchema from './resources/appFile/appFile.schema';
import AwesomeLinkSchema from './resources/awesomeLink/awesomeLink.schema';
import { handleUploadManyFiles, handleUploadSingleFile } from './resources/file/file.controller';
import PostSchema from './resources/post/post.schema';
import RoleSchema from './resources/role/role.schema';
import UserSchema from './resources/user/user.schema';
import WebHostSchema from './resources/webHost/webHost.schema';

const bootstrap = async () => {
	global.LOCAL = process.env.ONLINE !== 'true';
	global.MODE = process.env.MODE || 'local';

	// --------------------------------------------------------------------------------------//
	//                    override process.env with values in .env file                      //
	// --------------------------------------------------------------------------------------//
	if (global.LOCAL) {
		const envFileName = `.env.${global.MODE}`;
		const envConfig = dotenv.config({ path: path.resolve(__dirname, '..', envFileName) });
		dotenvExpand.expand(envConfig);
	}

	// --------------------------------------------------------------------------------------//
	//                                Type check process.env                                 //
	// --------------------------------------------------------------------------------------//
	const checkedEnv = envSchema.parse(process.env);
	setAppEnv(checkedEnv);

	const { DATABASE_URI, PARSE_APP_ID, PARSE_MASTER_KEY, PARSE_SERVER_URL, PORT, PARSE_PATH, EXPRESS_FILES_MOUNT_PATH } =
		env;

	// --------------------------------------------------------------------------------------//
	//                            setup express and parse server                             //
	// --------------------------------------------------------------------------------------//
	const app = express();

	// setup middlewares
	app.use(cors({ whiteList: global.LOCAL ? corsWhiteList.LOCAL : corsWhiteList.ONLINE }));
	app.use(express.urlencoded({ extended: false }));
	app.use(express.json());
	app.use(EXPRESS_FILES_MOUNT_PATH, express.static(FILE_UPLOAD_DESTINATION));

	// File System adapter for Parse
	const fsAdapter = new FSFilesAdapter({
		filesSubDirectory: 'parse-uploads', // optional, defaults to ./files
		// encryptionKey: 'local-file-encryption-key', // optional, but mandatory if you want to encrypt files
	});

	// initialize parse server
	const parseServer = new ParseServer({
		appId: PARSE_APP_ID,
		masterKey: PARSE_MASTER_KEY,
		cloud: path.resolve(__dirname, './cloud/_index'),
		databaseURI: DATABASE_URI,
		serverURL: PARSE_SERVER_URL,
		publicServerURL: PARSE_SERVER_URL,
		filesAdapter: fsAdapter,
		// preserveFileName: true,
		// =============================================
		logLevel: 'silly', // this seem to be not working at all
		allowClientClassCreation: false,
		schema: {
			strict: true,
			definitions: [RoleSchema, UserSchema, PostSchema, WebHostSchema, AppFileSchema, AwesomeLinkSchema],
		},
		masterKeyIps: ['0.0.0.0/0', '::1'], // ! Allowing all ips is dangerous
		allowExpiredAuthDataToken: false,
		encodeParseObjectInCloudFunction: true,
		// allowHeaders: ['Access-Control-Expose-Headers', 'access-control-expose-headers', 'Etag'],
		directAccess: true,
	});

	// setup a better console transport for our logger
	logger.adapter.addTransport(consoleTransport);

	await parseServer.start();

	app.use(PARSE_PATH, parseServer.app);

	// set Routes
	app.post(
		endPoint.uploadSingleFile,
		protectionMiddleware({ withAuth: true, withKey: false }),
		multerConfig.single('file'),
		handleUploadSingleFile,
	);

	app.post(
		endPoint.uploadManyFiles,
		protectionMiddleware({ withAuth: true, withKey: false }),
		multerConfig.array('files'),
		handleUploadManyFiles,
	);

	// set error middleware // ! must be after all routes definition (I am wondering if I should make it after the parse dashboard also)
	app.use(errorMiddleware);

	// --------------------------------------------------------------------------------------//
	//                         setup parse dashboard when in local                          //
	// --------------------------------------------------------------------------------------//
	if (global.LOCAL) {
		const dashboard = new ParseDashboard(
			{
				apps: [
					{
						serverURL: PARSE_SERVER_URL, // ! localhost only
						appId: PARSE_APP_ID,
						masterKey: PARSE_MASTER_KEY,
						appName: 'Devist Express Dash Local',
					},
				],
			},
			{
				// allowInsecureHTTP: false,
				port: PORT,
			},
		);

		app.use('/pdash', dashboard);
	}

	// --------------------------------------------------------------------------------------//
	//                                    run the server                                     //
	// --------------------------------------------------------------------------------------//
	app.listen(PORT, global.LOCAL ? 'localhost' : '0.0.0.0', () => {
		logger.info('====================================');
		logger.info(`   server running on port ${PORT}   `);
		logger.info('====================================');
	});

	// Manually create nested keys indexes
	// because they are not supported by Parse server yet
	createIndexes();

	// create the roles
	createRolesIfNotExists();

	// create the upload folder
	createUploadDirIfNotExists();
};

bootstrap();
