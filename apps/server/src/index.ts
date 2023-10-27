import path from 'path';

import ParseServer, { logger } from 'parse-server';

import FSFilesAdapter from '@parse/fs-files-adapter';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import express from 'express';
import ParseDashboard from 'parse-dashboard';

import { handleUploadSingleFile } from './controllers/file.controller';
import { createIndexes, createRolesIfNotExist, createUploadDirIfNotExist } from './helpers/helpers';
import { cors } from './middlewares/cors.middleware';
import errorMiddleware from './middlewares/error.middleware';
import protectionMiddleware from './middlewares/protection.middleware';
import AppFileSchema from './schemas/appFile.schema';
import PostSchema from './schemas/post.schema';
import RoleSchema from './schemas/role.schema';
import WebHostSchema from './schemas/webHost.schema';
import { corsWhiteList, FILE_UPLOAD_DESTINATION } from './utils/constants';
import { env, envSchema, setAppEnv } from './utils/env';
import { consoleTransport } from './utils/logger';
import { multerConfig } from './utils/multer';

const bootstrap = async () => {
	// --------------------------------------------------------------------------------------//
	//                                 set the global vars                                  //
	// --------------------------------------------------------------------------------------//
	global.FORCE_PROD = false;
	global.FORCE_PREPROD = false;

	// * The ONLINE environment variable is to set only in your host provider's interface
	global.LOCAL = !process.env.ONLINE;
	// * The PRODUCTION environment variable is to set only in your host provider's interface
	global.PRODUCTION = Boolean(process.env.PRODUCTION);

	// --------------------------------------------------------------------------------------//
	//                           determine which .env file to load                           //
	// --------------------------------------------------------------------------------------//
	let envFileName = '.env.local';

	if ((!global.LOCAL && !global.PRODUCTION) || global.FORCE_PREPROD) {
		envFileName = '.env.preprod';
	} else if (global.PRODUCTION || global.FORCE_PROD) {
		envFileName = '.env.production';
	}

	if (global.LOCAL) {
		const envConfig = dotenv.config({ path: path.resolve(__dirname, '..', envFileName) });
		dotenvExpand.expand(envConfig);
	}

	// --------------------------------------------------------------------------------------//
	//                                Type check process.env                                //
	// --------------------------------------------------------------------------------------//
	const checkedEnv = envSchema.parse(process.env);
	setAppEnv(checkedEnv);

	const { DATABASE_URI, PARSE_APP_ID, PARSE_MASTER_KEY, PARSE_SERVER_URL, PORT, PARSE_PATH } = env;

	// --------------------------------------------------------------------------------------//
	//                            setup express and parse server                            //
	// --------------------------------------------------------------------------------------//
	const app = express();

	// setup middlewares
	app.use(cors({ whiteList: global.LOCAL ? corsWhiteList.LOCAL : corsWhiteList.ONLINE }));
	app.use(express.urlencoded({ extended: false }));
	app.use(express.json());
	app.use('/app/files', express.static(FILE_UPLOAD_DESTINATION));

	// File System adapter for Parse
	const fsAdapter = new FSFilesAdapter({
		filesSubDirectory: 'parse-uploads', // optional, defaults to ./files
		// encryptionKey: 'local-file-encryption-key', // optional, but mandatory if you want to encrypt files
	});

	// initialize parse server
	const parseServer = new ParseServer({
		appId: PARSE_APP_ID,
		masterKey: PARSE_MASTER_KEY,
		cloud: path.resolve(__dirname, './cloud/index'),
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
			definitions: [RoleSchema, PostSchema, WebHostSchema, AppFileSchema],
		},
		masterKeyIps: ['0.0.0.0/0', '::1'], // ! Allowing all ips is dangerous
		allowExpiredAuthDataToken: false,
	});

	// setup a better console transport for our logger
	logger.adapter.addTransport(consoleTransport);

	await parseServer.start();

	app.use(PARSE_PATH, parseServer.app);

	// set Routes
	app.post(
		'/upload-file-single',
		protectionMiddleware({ withAuth: true, withKey: false }),
		multerConfig.single('file'),
		handleUploadSingleFile,
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
	app.listen(PORT, () => {
		logger.info('====================================');
		logger.info(`   server running on port ${PORT}   `);
		logger.info('====================================');
	});

	// Manually create nested keys indexes
	// because they are not supported by Parse server yet
	createIndexes();

	// create the roles
	createRolesIfNotExist();

	// create the upload folder
	createUploadDirIfNotExist();
};

bootstrap();
