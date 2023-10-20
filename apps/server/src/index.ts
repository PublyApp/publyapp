import path from 'path';

import ParseServer, { logger } from 'parse-server';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import express from 'express';
import ParseDashboard from 'parse-dashboard';

// import { z } from 'zod';

import { createIndexes, createRolesIfNotExist, initCloudinary } from './helpers/helpers';
import { cors } from './middlewares/cors.middleware';
import FilesRoute from './routes/file.routes';
import PostSchema from './schemas/post.schema';
import RoleSchema from './schemas/role.schema';
import WebHostSchema from './schemas/webHost.schema';
import { whiteList } from './utils/constants';
import { consoleTransport } from './utils/logger';

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
	// process.env = z.parse(envSchema);

	// --------------------------------------------------------------------------------------//
	//                          set the mainly important constants                          //
	// --------------------------------------------------------------------------------------//
	const PORT = Number(process.env.PORT) || 1337;
	const MASTER_KEY = process.env.MASTER_KEY || 'local-master-key';
	const DATABASE_URI = process.env.DATABASE_URI || 'mongodb://localhost:27017/devist-local';
	const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
	const APP_ID = process.env.APP_ID || 'devist';

	// logger.info(`MASTER_KEY: ${MASTER_KEY}`);

	// --------------------------------------------------------------------------------------//
	//                            setup express and parse server                            //
	// --------------------------------------------------------------------------------------//
	const app = express();

	// setup middlewares
	app.use(cors({ whiteList: global.LOCAL ? whiteList.LOCAL : whiteList.ONLINE }));
	app.use(express.urlencoded({ extended: false }));
	app.use(express.json());

	// initialize parse server
	const parseServer = new ParseServer({
		appId: APP_ID,
		masterKey: MASTER_KEY,
		cloud: path.resolve(__dirname, './cloud/index'),
		databaseURI: DATABASE_URI,
		serverURL: `${SERVER_URL}/parse`,
		publicServerURL: `${SERVER_URL}/parse`,
		// =============================================
		logLevel: 'silly', // this seem to be not working at all
		allowClientClassCreation: false,
		schema: {
			strict: true,
			definitions: [RoleSchema, PostSchema, WebHostSchema],
		},
		masterKeyIps: ['0.0.0.0/0', '::1'], // ! Allowing all ips is dangerous
		allowExpiredAuthDataToken: false,
	});

	// setup a better console transport for our logger
	logger.adapter.addTransport(consoleTransport);

	await parseServer.start();

	app.use('/parse', parseServer.app);

	// set Routes
	const fileRoutes = new FilesRoute();
	app.use('/', fileRoutes.router);

	// set error middleware // ! must be after all routes definition (I am wondering if I should make it after the parse dashboard as)

	// --------------------------------------------------------------------------------------//
	//                         setup parse dashboard when in local                          //
	// --------------------------------------------------------------------------------------//
	if (global.LOCAL) {
		const dashboard = new ParseDashboard(
			{
				apps: [
					{
						serverURL: `${SERVER_URL}/parse`, // ! localhost only
						appId: APP_ID,
						masterKey: MASTER_KEY,
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

	// --------------------------------------------------------------------------------------//
	//    Manually create nested keys indexes that are not supported by Parse server yet    //
	// --------------------------------------------------------------------------------------//
	createIndexes();

	// --------------------------------------------------------------------------------------//
	//                                   create the roles                                    //
	// --------------------------------------------------------------------------------------//
	createRolesIfNotExist();

	// --------------------------------------------------------------------------------------//
	//                                 Init cloudinary SDK                                  //
	// --------------------------------------------------------------------------------------//
	initCloudinary();
};

bootstrap();
