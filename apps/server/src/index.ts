import { createServer } from 'node:http';
import path from 'node:path';
import { logger } from '@/server/lib/winston';
import {
	APP_ID,
	APP_NAME,
	LOCALE_HEADER_KEY,
	REMIX_CLIENT_IP_HEADER_KEY,
	TENANT_ID_HEADER_KEY,
	endPoint,
} from '@/shared/lib/constants';
import duration from '@org/shared/utils/duration.utils';
import FSFilesAdapter from '@parse/fs-files-adapter';
import { createRequestHandler } from '@react-router/express';
import chalk from 'chalk';
import express from 'express';
import helmet from 'helmet';
import _ from 'lodash';
import ParseDashboard from 'parse-dashboard';
import { ParseServer } from 'parse-server/lib/index.js';
import Parse from 'parse/node.js';
import { cloud } from './cloud';
import { HttpException } from './exceptions/HttpException';
import {
	createRolesIfNotExists,
	createUploadDirIfNotExists,
	setUpGlobalConfig,
	updateSchemasOnInit,
} from './helpers/helpers';
import { initCloudinary } from './lib/cloudinary';
import {
	EXPRESS_FILES_MOUNT_PATH,
	FILE_UPLOAD_DESTINATION,
	PARSE_SERVER_URL,
	corsWhiteList,
} from './lib/constants';
import { env } from './lib/env';
import { expressHandler, getRequestUtils } from './lib/express';
import { initI18next } from './lib/i18n';
import CustomMailAdapter from './lib/parse/classes/CustomMailAdapter';
import WinstonLoggerAdapter from './lib/parse/classes/WinstonLoggerAdapter';
import { setCurrentInstallationId } from './lib/parse/parse.utils';
import { postHogServer } from './lib/posthog';
import { corsMiddleware } from './middlewares/cors.middleware';
import { errorMiddleware } from './middlewares/error.middleware';
import {
	maliciousRequestsGuardMiddleware,
	populateBlocklist,
} from './middlewares/malicious-requests-guard.middleware';
import parseServerMiddleware from './middlewares/parse-server.middleware';
import coreApiRouter from './router/core-api.router';

global.Parse = Parse;

const bootstrap = async () => {
	// --------------------------------------------------------------------------------------//
	//                            setup express and parse server                             //
	// --------------------------------------------------------------------------------------//
	const app = express();

	app.set('trust proxy', 1);
	app.set('case sensitive routing', true);

	app.use(maliciousRequestsGuardMiddleware);
	app.use(
		helmet({
			contentSecurityPolicy: {
				useDefaults: true,
				reportOnly: true,
				directives: {
					'connect-src': ["'self'", 'https://www.pdfvite.com'],
					'script-src': ["'self'", 'https://www.pdfvite.com'],
				},
			},
		}),
	);
	app.use(
		corsMiddleware({
			whiteList: env.LOCAL ? corsWhiteList.LOCAL : corsWhiteList.ONLINE,
		}),
	);
	app.use(
		express.json({
			// ! if tex/plain is not specified, request body in Parse API endpoint will not work
			type: ['application/json', 'text/plain'],
		}),
	);
	// server uploaded files under express static middleware
	app.use(EXPRESS_FILES_MOUNT_PATH, express.static(FILE_UPLOAD_DESTINATION));
	// serve i18n resources files under express static middleware (remark: these files are generated at build time)
	app.use('/resources', express.static(path.resolve(__dirname, './resources')));
	// The parse API end the custom API are both under this root path
	// use only urlencoded there because Remix (React Router 7) will not
	// populate action's formData correctly
	app.use(endPoint.api.root, express.urlencoded({ extended: false }));
	// set request utils on request object
	app.use(endPoint.api.root, (req, _res, next) => {
		getRequestUtils(req);
		next();
	});

	// File System adapter for Parse
	const filesAdapter = new FSFilesAdapter({
		filesSubDirectory: 'parse-uploads', // optional, defaults to ./files
		// encryptionKey: 'local-file-encryption-key', // optional, but mandatory if you want to encrypt files
	});

	// Email adapter for Parse
	// * combined with ParseServerOptions.verifyUserEmails set to true,
	// * we ensure that verification token is created by Parse whenever a user is created
	// * but we don't want Parse to send the email to the user by setting CustomMailAdapter.enableSendVerificationEmail to false
	const emailAdapter = new CustomMailAdapter({
		serverUrl: env.SERVER_URL,
		enableSendVerificationEmail: false,
	});

	// Logger adapter for Parse
	const loggerAdapter = new WinstonLoggerAdapter({ logger, maxLogFiles: 5 });

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
		// =============================================
		masterKeyIps: ['0.0.0.0/0', '::1'], // ! Allowing all ips is dangerous
		sessionLength: duration.toSeconds('3d'), // 3 days
		allowHeaders: [
			LOCALE_HEADER_KEY,
			TENANT_ID_HEADER_KEY,
			REMIX_CLIENT_IP_HEADER_KEY,
		],
		allowOrigin: env.LOCAL ? corsWhiteList.LOCAL : corsWhiteList.ONLINE,
		// =============================================
		directAccess: true,
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
		pages: {
			enableRouter: true,
		},
		emailAdapter,
		verifyUserEmails: true, // automatically sends an email to newly created users
		emailVerifyTokenValidityDuration: duration.toSeconds('1d'),
		emailVerifyTokenReuseIfValid: true,
		// =============================================
		enableInsecureAuthAdapters: false,
		// preserveFileName: true,
		// logLevel: 'warn', // this seems to be not working at all
		// middleware: parseServerMiddleware, // this is being mounted only if with use the startApp method
	});

	// start the parse server setup in the background
	const startParsePromise = parseServer.start();

	// set custom endPoints routes
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
						appName: APP_NAME,
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
				logger.debug('test route hit', {
					lol: 'test',
					password: 'azerty',
					body: req.body,
				});
				return res.status(200).json({ ok: 'ok' });
			}),
		);
	}

	// wait for the parse server setup to finish, the mount the parse app to the express app
	await startParsePromise;

	parseServer.app.set('case sensitive routing', true);
	parseServer.app.set('trust proxy', 1);
	parseServer.app.disable('x-powered-by'); // already set by helmet on parent app

	app.use(PARSE_SERVER_URL.pathname, parseServerMiddleware, parseServer.app);

	app.get(
		`${endPoint.api.root}/test`,
		expressHandler(async (_req, res) => {
			// const { t } = getRequestUtils(req);
			return res.status(200).json({ ok: 'ok' });
		}),
	);

	// --------------------------------------------------------------------------------------//
	//                  mount remix build when in a deployment environment                   //
	// --------------------------------------------------------------------------------------//
	let remixHandler: ReturnType<typeof createRequestHandler> | undefined;

	if (!env.LOCAL || env.TEST_ONLINE_IN_LOCAL) {
		app.use(
			express.static(path.resolve(__dirname, '../../front/build/client')),
		);

		remixHandler = createRequestHandler({
			// `remix build` and `remix dev` output files to a build directory, you need
			// to pass that build to the request handler
			build: await import(
				/* webpackIgnore: true */ 'front/build/server/index.js' // ! the '.js' extension is important
			),

			// return anything you want here to be available as `context` in your
			// loaders and actions. This is where you can bridge the gap between Remix
			// and your server
			getLoadContext: (_req, _res) => {
				return {
					logger,
					postHogServer: postHogServer,
				};
			},
		});
	}

	// needs to handle all verbs (GET, POST, etc.)
	app.all(
		/(.*)/,
		expressHandler(async (req, res, next) => {
			if (req.path.startsWith(endPoint.api.root) || !remixHandler) {
				const { t } = getRequestUtils(req);

				throw new HttpException(
					404,
					_.capitalize(t('item-not-found', { item: 'Route' })),
				);
			}

			return remixHandler(req, res, next);
		}),
	);

	// --------------------------------------------------------------------------------------//
	//                                    run the server                                     //
	// --------------------------------------------------------------------------------------//
	const server = createServer(app);

	server.on('request', (req, _res) => {
		req.socket.remoteAddress; // make express req.ip work in bun
	});

	// set error middleware
	// ! this must be mounted after all routes and all other middlewares
	app.use(errorMiddleware);

	server.listen(env.PORT, '0.0.0.0', () => {
		logger.info(
			'================================================================',
		);
		logger.info(`    server running at ${chalk.cyan(`${env.SERVER_URL}`)}    `);

		if (env.LOCAL) {
			const dashUrl = new URL(env.SERVER_URL);
			dashUrl.pathname = PARSE_DASHBOARD_MOUNT_PATH;
			logger.info(
				`    access the dashboard at ${chalk.cyan(dashUrl.toString())}    `,
			);
		}

		logger.info(
			'================================================================',
		);
	});

	await setCurrentInstallationId(); // ! This must be awaited here before any other tasks

	await Promise.all([
		updateSchemasOnInit(), // setup schemas in the database + takes care of the index creations
		initI18next(),
		createRolesIfNotExists(),
		createUploadDirIfNotExists(),
		initCloudinary(),
		setUpGlobalConfig(),
		populateBlocklist(),
	]);
};

bootstrap();
