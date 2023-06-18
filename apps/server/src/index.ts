import path from 'path';

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import ParseServer from 'parse-server';

import { createRolesIfNotExist } from './utils/role.utils';
import RoleSchema from './schemas/role.schema';

const bootstrap = async () => {
	// --------------------------------------------------------------------------------------//
	//                                 set the global vars                                  //
	// --------------------------------------------------------------------------------------//
	global.FORCE_PROD = false;
	global.FORCE_PREPROD = false;

	// * The ONLINE environment variable is to set only in your host provider's interface
	global.LOCAL = !process.env.ONLINE;
	global.PRODUCTION = false;

	// --------------------------------------------------------------------------------------//
	//                           determine which .env file to load                           //
	// --------------------------------------------------------------------------------------//
	let envFileName = '.env.local';

	if ((!global.LOCAL && !global.PRODUCTION) || global.FORCE_PREPROD) {
		envFileName = '.env.preprod';
	} else if (global.PRODUCTION || global.FORCE_PROD) {
		envFileName = '.env.production';
	}

	dotenv.config({ path: path.resolve(__dirname, '..', envFileName) });

	// --------------------------------------------------------------------------------------//
	//                          set the mainly important constants                          //
	// --------------------------------------------------------------------------------------//
	const PORT = Number(process.env.PORT) || 1337;
	const MASTER_KEY = process.env.MASTER_KEY || 'local-master-key';
	const DATABASE_URI = process.env.DATABASE_URI || 'mongodb://localhost:27017/aktivpost-local';
	const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

	// --------------------------------------------------------------------------------------//
	//                            setup express ans parse server                            //
	// --------------------------------------------------------------------------------------//
	const app = express();

	// setup middlewares
	app.use(cors({ origin: '*' }));
	app.use(express.urlencoded({ extended: false }));
	app.use(express.json());

	// initialize parse server
	const parseServer = new ParseServer({
		appId: 'aktivpost',
		masterKey: MASTER_KEY,
		cloud: path.resolve(__dirname, './cloud/index'),
		databaseUri: DATABASE_URI,
		serverURL: `${SERVER_URL}/parse`,
		publicServerURL: `${SERVER_URL}/parse`,
		// =============================================
		allowClientClassCreation: false,
		schema: {
			strict: true,
			definitions: [RoleSchema],
		},
		masterKeyIps: ['0.0.0.0/0', '::1'],
		allowExpiredAuthDataToken: false,
	});

	await parseServer.start();

	app.use('/parse', parseServer.app);

	// --------------------------------------------------------------------------------------//
	//                                    run the server                                     //
	// --------------------------------------------------------------------------------------//
	app.listen(PORT, () => {
		console.log('====================================');
		console.log(`   server running on port ${PORT}   `);
		console.log('====================================');
	});

	// --------------------------------------------------------------------------------------//
	//                                   create the roles                                    //
	// --------------------------------------------------------------------------------------//
	createRolesIfNotExist();
};

bootstrap();
