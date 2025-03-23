import { createServer } from 'http';
import path from 'path';

import { ParseServer } from 'parse-server/lib/index.js';
import Parse from 'parse/node.js';

import FSFilesAdapter from '@parse/fs-files-adapter';
import { createRequestHandler } from '@react-router/express';
import chalk from 'chalk';
import express from 'express';
import helmet from 'helmet';
import ParseDashboard from 'parse-dashboard';

import duration from '@org/shared/utils/duration.utils';

import { logger } from '@/server/lib/winston';
import { APP_ID, APP_NAME, endPoint, LOCALE_HEADER_KEY, TENANT_ID_HEADER_KEY } from '@/shared/lib/constants';

import { cloud } from './cloud';
import {
	createRolesIfNotExists,
	createUploadDirIfNotExists,
	overrideConsole,
	setUpGlobalConfig,
	updateSchemasOnInit,
} from './helpers/helpers';
import { initCloudinary } from './lib/cloudinary';
import { corsWhiteList, EXPRESS_FILES_MOUNT_PATH, FILE_UPLOAD_DESTINATION, PARSE_SERVER_URL } from './lib/constants';
import { env } from './lib/env';
import { expressHandler } from './lib/express';
import { initI18next } from './lib/i18n';
import CustomMailAdapter from './lib/parse/classes/CustomMailAdapter';
import WinstonLoggerAdapter from './lib/parse/classes/WinstonLoggerAdapter';
import { setCurrentInstallationId } from './lib/parse/parse.utils';
import { corsMiddleware } from './middlewares/cors.middleware';
import { errorMiddleware } from './middlewares/error.middleware';
import parseServerMiddleware from './middlewares/parseServer.middleware';
import coreApiRouter from './router/coreApi.router';

// ! use the rsbuild metaPlugin I wrote to make these work
// logger.info(import.meta.url);
// logger.info(import.meta.filename);
// logger.log(import.meta.dirname);

overrideConsole();

global.Parse = Parse;

const bootstrap = async () => {
	// --------------------------------------------------------------------------------------//
	//                            setup express and parse server                             //
	// --------------------------------------------------------------------------------------//
	const app = express();

	// setup middlewares
	app.use(
		helmet({
			contentSecurityPolicy: {
				useDefaults: true,
				reportOnly: true,
			},
		}),
	);
	app.use(corsMiddleware({ whiteList: env.LOCAL ? corsWhiteList.LOCAL : corsWhiteList.ONLINE }));
	app.use(express.urlencoded({ extended: false }));
	app.use(
		express.json({
			type: (req) => {
				return ['application/json', 'application/json; charset=UTF-8', 'text/plain'].includes(
					req.headers['content-type'] || '',
				);
			},
		}),
	);
	app.use(EXPRESS_FILES_MOUNT_PATH, express.static(FILE_UPLOAD_DESTINATION));
	// serve i18n resources files under express static middleware (remark: these files are generated at build time)
	app.use('/resources', express.static(path.resolve(process.cwd(), 'dist/resources')));

	// File System adapter for Parse
	const filesAdapter = new FSFilesAdapter({
		filesSubDirectory: 'parse-uploads', // optional, defaults to ./files
		// encryptionKey: 'local-file-encryption-key', // optional, but mandatory if you want to encrypt files
	});

	// Email adapter for Parse
	const emailAdapter = new CustomMailAdapter({ serverUrl: env.SERVER_URL });

	// Logger adapter for Parse
	const loggerAdapter = new WinstonLoggerAdapter({ logger });

	// initialize parse server
	const parseServer = new ParseServer({
		//  === REQUIRED PARAMS =========================
		appName: APP_NAME,
		appId: APP_ID,
		masterKey: env.PARSE_MASTER_KEY,
		cloud,
		databaseURI: env.DATABASE_URI,
		serverURL: PARSE_SERVER_URL.toString(),
		publicServerURL: PARSE_SERVER_URL.toString(),
		// === ADAPTERS ================================
		filesAdapter,
		loggerAdapter,
		emailAdapter,
		// =============================================
		masterKeyIps: ['0.0.0.0/0', '::1'], // ! Allowing all ips is dangerous
		sessionLength: duration.toSeconds('3d'), // 3 days
		allowHeaders: [LOCALE_HEADER_KEY, TENANT_ID_HEADER_KEY],
		allowOrigin: env.LOCAL ? corsWhiteList.LOCAL : corsWhiteList.ONLINE,
		// =============================================
		directAccess: false,
		enableExpressErrorHandler: true,
		allowClientClassCreation: false,
		allowExpiredAuthDataToken: false,
		preventLoginWithUnverifiedEmail: true,
		encodeParseObjectInCloudFunction: true,
		logLevels: {
			cloudFunctionError: 'silent',
			cloudFunctionSuccess: 'silent',
			triggerAfter: 'silent',
			triggerBeforeError: 'silent',
			triggerBeforeSuccess: 'silent',
		},
		// =============================================
		// verifyUserEmails: true,
		// preserveFileName: true,
		// emailVerifyTokenReuseIfValid: true,
		// logLevel: 'silly', // this seems to be not working at all
		// emailVerifyTokenValidityDuration: duration.toSeconds('1d'),
		// middleware: parseServerMiddleware, // this is being mounted oly if with use the startApp method
	});

	// start the parse server setup in the background
	const startParsePromise = parseServer.start();

	// set custom ennPoints routes
	app.use(coreApiRouter);

	// --------------------------------------------------------------------------------------//
	//                         setup parse dashboard when in local                           //
	// ------------------------------------------------------------------------------------- //
	const PARSE_DASHBOARD_MOUNT_PATH = '/pdash';

	if (env.LOCAL) {
		const dashboard = new ParseDashboard(
			{
				apps: [
					{
						serverURL: PARSE_SERVER_URL.toString(), // ! localhost only
						appId: APP_ID,
						masterKey: env.PARSE_MASTER_KEY,
						appName: 'Devist Express Dash Local',
					},
				],
			},
			{
				port: env.PORT,
			},
		);
		app.use(PARSE_DASHBOARD_MOUNT_PATH, dashboard);
		app.all(
			path.posix.join(endPoint.api.root, 'test'),
			expressHandler(async (req, res) => {
				logger.info('test route hit', { lol: 'test', password: 'azerty', body: req.body });
				return res.status(200).json({ ok: 'ok' });
			}),
		);
	}

	// wait for the parse server setup to finish, the mount the parse app to the express app
	await startParsePromise;

	parseServer.app.disable('x-powered-by');

	app.use(PARSE_SERVER_URL.pathname, parseServerMiddleware, parseServer.app);

	// --------------------------------------------------------------------------------------//
	//                  mount remix build when in a deployment environment                   //
	// --------------------------------------------------------------------------------------//
	if (!env.LOCAL || env.TEST_ONLINE_IN_LOCAL) {
		app.use(express.static(path.resolve(process.cwd(), 'node_modules/front/build/client')));

		// needs to handle all verbs (GET, POST, etc.)
		app.all(
			'*',
			createRequestHandler({
				// `remix build` and `remix dev` output files to a build directory, you need
				// to pass that build to the request handler
				build: await import(/* webpackIgnore: true */ 'front/build/server/index.js'), // ! the '.js' extension is important

				// return anything you want here to be available as `context` in your
				// loaders and actions. This is where you can bridge the gap between Remix
				// and your server
				// getLoadContext(req, res) {
				// 	return {};
				// },
			}) as never, // TODO: fix type issue (due to express 5)
		);
	}

	// --------------------------------------------------------------------------------------//
	//                                    run the server                                     //
	// --------------------------------------------------------------------------------------//
	const server = createServer(app);

	server.on('request', (req, _res) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		req.socket.remoteAddress; // make express req.ip work in bun
	});

	// set error middleware
	// ! this must be mounted after all routes and all other middlewares
	app.use(errorMiddleware);

	server.listen(env.PORT, env.LOCAL ? 'localhost' : '0.0.0.0', () => {
		logger.info('================================================================');
		logger.info(`    server running at ${chalk.cyan(`${env.SERVER_URL}`)}    `);

		if (env.LOCAL) {
			const dashUrl = new URL(env.SERVER_URL);
			dashUrl.pathname = PARSE_DASHBOARD_MOUNT_PATH;
			logger.info(`    access the dashboard at ${chalk.cyan(dashUrl.toString())}    `);
		}

		logger.info('================================================================');
	});

	await setCurrentInstallationId(); // ! This must be awaited here before any other tasks

	await Promise.all([
		updateSchemasOnInit(), // setup schemas in the database + takes care of the index creations
		initI18next(),
		createRolesIfNotExists(),
		createUploadDirIfNotExists(),
		initCloudinary(),
		setUpGlobalConfig(),
	]);

	// UserManagementServiceForStaff.findStaffUsersForStaffAdminTable();
};

bootstrap();
