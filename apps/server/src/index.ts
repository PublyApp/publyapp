import { createServer } from 'http';
import path from 'path';

import { ParseServer } from 'parse-server/lib/index.js';

import FSFilesAdapter from '@parse/fs-files-adapter';
import { createRequestHandler } from '@remix-run/express';
import chalk from 'chalk';
import express from 'express';
import _ from 'lodash';
import ParseDashboard from 'parse-dashboard';

import { LOCALE_HEADER_KEY, TENANT_ID_HEADER_KEY } from '@/shared/lib/constants';

import { cloud } from './cloud';
import { createRolesIfNotExists, createUploadDirIfNotExists } from './helpers/helpers';
import { initCloudinary } from './lib/cloudinary';
import { corsWhiteList, FILE_UPLOAD_DESTINATION } from './lib/constants';
import { env } from './lib/env';
import { expressHandler } from './lib/express';
import { initI18next } from './lib/i18n';
import logger, { consoleTransport } from './lib/logger';
import CustomMailAdapter from './lib/parse/classes/CustomMailAdapter';
import SchemaManager from './lib/parse/classes/SchemaManager';
import { cors } from './middlewares/cors.middleware';
import errorMiddleware from './middlewares/error.middleware';
import parseServerMiddleware from './middlewares/parseServer.middleware';
import RoleSchema from './resources/auth/role/role.schema';
import SessionSchema from './resources/auth/session/session.schema';
import UserSchema from './resources/auth/user/user.schema';
import BlogPostSchema from './resources/blog/blogPost/blogPost.schema';
import BlogPostSlugSchema from './resources/blog/blogPost/blogPostSlug.schema';
import BlogPostSeriesSchema from './resources/blog/blogPostSeries/blogPostSeries.schema';
import AppFileSchema from './resources/file-manager/appFile/appFile.schema';
import customApiRouter from './router/customApiRouter';
import duration from './utils/duration';

// ! use the rsbuild metaPlugin I wrote to make these work
// console.log(import.meta.url);
// console.log(import.meta.filename);
// console.log(import.meta.dirname);

const bootstrap = async () => {
	// --------------------------------------------------------------------------------------//
	//                            setup express and parse server                             //
	// --------------------------------------------------------------------------------------//
	const app = express();

	// setup middlewares
	app.use(cors({ whiteList: global.LOCAL ? corsWhiteList.LOCAL : corsWhiteList.ONLINE }));
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
	app.use(env.EXPRESS_FILES_MOUNT_PATH, express.static(FILE_UPLOAD_DESTINATION));

	// app.use(parseServerMiddleware);

	// File System adapter for Parse
	const fsAdapter = new FSFilesAdapter({
		filesSubDirectory: 'parse-uploads', // optional, defaults to ./files
		// encryptionKey: 'local-file-encryption-key', // optional, but mandatory if you want to encrypt files
	});

	// Email adapter for Parse
	const customMailAdapter = new CustomMailAdapter({ serverUrl: env.SERVER_URL });

	// initialize parse server
	const parseServer = new ParseServer({
		appName: env.PARSE_APP_NAME,
		appId: env.PARSE_APP_ID,
		masterKey: env.PARSE_MASTER_KEY,
		cloud,
		databaseURI: env.DATABASE_URI,
		serverURL: env.PARSE_SERVER_URL,
		publicServerURL: env.PARSE_SERVER_URL,
		filesAdapter: fsAdapter,
		// preserveFileName: true,
		// =============================================
		logLevel: 'silly', // this seems to be not working at all
		allowClientClassCreation: false,
		masterKeyIps: ['0.0.0.0/0', '::1'], // ! Allowing all ips is dangerous
		allowExpiredAuthDataToken: false,
		encodeParseObjectInCloudFunction: true,
		allowHeaders: [LOCALE_HEADER_KEY, TENANT_ID_HEADER_KEY],
		directAccess: false, // the docs is lying, this is true by default
		// middleware: parseServerMiddleware, // this is being mounted oly if with use the startApp method
		sessionLength: duration.toSeconds('3d'), // 3 days
		// ===
		verifyUserEmails: true,
		preventLoginWithUnverifiedEmail: true,
		// emailVerifyTokenReuseIfValid: true,
		// emailVerifyTokenValidityDuration: duration.toSeconds('1d'),
		emailAdapter: customMailAdapter,
	});

	// setup a better console transport for our logger
	logger.adapter.addTransport(consoleTransport);

	// start the parse server setup in the background
	const startParsePromise = parseServer.start();

	// set custom ennPoints routes
	app.use(customApiRouter);

	// --------------------------------------------------------------------------------------//
	//                         setup parse dashboard when in local                           //
	// ------------------------------------------------------------------------------------- //
	const PARSE_DASHBOARD_MOUNT_PATH = '/pdash';

	if (global.LOCAL) {
		const dashboard = new ParseDashboard(
			{
				apps: [
					{
						serverURL: env.PARSE_SERVER_URL, // ! localhost only
						appId: env.PARSE_APP_ID,
						masterKey: env.PARSE_MASTER_KEY,
						appName: 'Devist Express Dash Local',
					},
				],
				// users: [{ user: 'radandevist', pass: 'azerty' }],
			},
			{
				// dev: true,
				// allowInsecureHTTP: true,
				// trustProxy: true,
				// masterKey: env.PARSE_MASTER_KEY,
				port: env.PORT,
			},
		);

		app.use(PARSE_DASHBOARD_MOUNT_PATH, dashboard);

		app.all(
			path.posix.join(env.API_PATH, 'test'),
			expressHandler(async (_req, res) => {
				// abort a cloud job
				// const query = new Parse.Query('_JobStatus')
				// 	.equalTo('jobName', 'testPostJob')
				// 	.equalTo('status', 'running')
				// 	.descending(['createdAt']);

				// const job = query.first(USE_MASTER_KEY);

				// if (job) {
				// 	my
				// }

				// const con = global.myCon as AbortController;

				// con.abort();

				return res.status(200).json({ ok: 'ok' });
			}),
		);
	}

	// --------------------------------------------------------------------------------------//
	//                  mount remix build when in a deployment environment                   //
	// ------------------------------------------------------------------------------------ -//
	if (!global.LOCAL || global.TEST_ONLINE_IN_LOCAL) {
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
			}),
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

	// wait for the parse server setup to finish, the mount the parse app to the express app
	await startParsePromise;
	app.use(env.PARSE_PATH, parseServerMiddleware, parseServer.app);

	// set error middleware
	// ! this must be mounted after all routes and all other middlewares
	app.use(errorMiddleware);

	server.listen(env.PORT, global.LOCAL ? 'localhost' : '0.0.0.0', () => {
		logger.info('================================================================');
		logger.info(`    server running at ${chalk.cyan(`${env.SERVER_URL}`)}    `);

		if (global.LOCAL) {
			logger.info(`    access the dashboard at ${chalk.cyan(`${env.SERVER_URL}${PARSE_DASHBOARD_MOUNT_PATH}`)}    `);
		}

		logger.info('================================================================');
	});

	// setup schemas in the database + takes care of the index creations
	SchemaManager.updateSchemas([
		BlogPostSeriesSchema,
		AppFileSchema,
		BlogPostSchema,
		BlogPostSlugSchema,
		RoleSchema,
		SessionSchema,
		UserSchema,
	]);

	initI18next();

	// create the roles
	createRolesIfNotExists();

	// create the upload folder
	createUploadDirIfNotExists();

	// init cloudinary
	initCloudinary();
};

bootstrap();
