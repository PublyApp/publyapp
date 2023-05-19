import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import ParseServer from 'parse-server';
import path from 'path';

const bootstrap = async () => {
	//--------------------------------------------------------------------------------------//
	//                                 set the global vars                                  //
	//--------------------------------------------------------------------------------------//
	global.FORCE_PROD = false;
	global.FORCE_PREPROD = false;

	// * The ONLINE environment variable is to set only in your host provider's interface
	global.LOCAL = !process.env.ONLINE;
	global.PRODUCTION = false;

	const PORT = Number(process.env.PORT) || 1337;
	const MASTER_KEY = process.env.MASTER_KEY || 'local-master-key';
	const DATABASE_URI = process.env.DATABASE_URI || 'mongodb://localhost:27017/devist-local';
	const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

	let envFileName = '.env.local';

	if ((!global.LOCAL && !global.PRODUCTION) || global.FORCE_PREPROD) {
		envFileName = '.env.preprod';
	} else if (global.PRODUCTION || global.FORCE_PROD) {
		envFileName = '.env.production';
	}

	dotenv.config({ path: path.resolve(__dirname, '..', envFileName) });

	const app = express();

	// setup middlewares
	app.use(cors({ origin: '*' }));
	app.use(express.urlencoded({ extended: false }));
	app.use(express.json());

	const parseServer = new ParseServer({
		appId: 'devist',
		masterKey: MASTER_KEY,
		cloud: path.resolve(__dirname, './cloud/index'),
		databaseUri: DATABASE_URI,
		serverURL: SERVER_URL,
		publicServerURL: SERVER_URL,
		// =============================================
		allowClientClassCreation: false,
		schema: {
			strict: true,
			definitions: [],
		},
		masterKeyIps: ['0.0.0.0/0'],
	});

	await parseServer.start();

	app.use('/parse', parseServer.app);

	app.listen(PORT, () => {
		console.log('====================================');
		console.log(`   server running on port ${PORT}   `);
		console.log('====================================');
	});
};

bootstrap();
