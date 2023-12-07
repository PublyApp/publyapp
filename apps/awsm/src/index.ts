/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable no-console */
import { EventEmitter } from 'events';
import path from 'path';

import Parse from 'parse/node';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import express from 'express';
import _ from 'lodash';

import { className } from '@devist/shared/lib/constants';

import { env, envSchema, setAppEnv } from './env';

const bootstrap = async () => {
	// --------------------------------------------------------------------------------------//
	//                                 set the global vars                                  //
	// --------------------------------------------------------------------------------------//
	global.FORCE_PROD = false;
	global.FORCE_PREPROD = false;

	// * The ONLINE environment variable is to set only in your host provider's interface
	global.LOCAL = process.env.ONLINE !== 'true';
	// * The PRODUCTION environment variable is to set only in your host provider's interface
	global.PRODUCTION = process.env.PRODUCTION === 'true';

	// --------------------------------------------------------------------------------------//
	//                           determine which .env file to load                           //
	// --------------------------------------------------------------------------------------//
	let envFileName = '.env.local';

	if ((!global.LOCAL && !global.PRODUCTION) || global.FORCE_PREPROD) {
		envFileName = '.env.preprod';
	} else if (global.PRODUCTION || global.FORCE_PROD) {
		envFileName = '.env.production';
	}

	// override process.env with values in .env file
	if (global.LOCAL) {
		const envConfig = dotenv.config({ path: path.resolve(__dirname, '..', envFileName) });
		dotenvExpand.expand(envConfig);
	}

	// --------------------------------------------------------------------------------------//
	//                                Type check process.env                                //
	// --------------------------------------------------------------------------------------//
	const checkedEnv = envSchema.parse(process.env);
	setAppEnv(checkedEnv);

	const { PORT, PARSE_APP_ID, PARSE_MASTER_KEY, PARSE_SERVER_URL } = env;

	// --------------------------------------------------------------------------------------//
	//                                      Init Parse                                      //
	// --------------------------------------------------------------------------------------//
	Parse.initialize(PARSE_APP_ID, undefined, PARSE_MASTER_KEY);
	Parse.serverURL = PARSE_SERVER_URL;

	global.Parse = Parse;

	const USE_MASTER_KEY = { useMasterKey: true };

	let cursor = 0;

	// --------------------------------------------------------------------------------------//
	//                    Event driven layer to avoid long response time                    //
	// --------------------------------------------------------------------------------------//
	const linkServiceEmitter = new EventEmitter();

	linkServiceEmitter.on('saveLinkMeta', async ({ link: linkJson }: { link: object }) => {
		try {
			const link = Parse.Object.fromJSON({ ...linkJson, className: className.AWESOME_LINK });

			const oldCount = _.get(linkJson, 'meta.visitCount') || 0;
			link.set('meta.visitCount', oldCount + 1);

			await link.save(null, USE_MASTER_KEY);
		} catch (error) {
			console.error(error);
		}
	});

	// --------------------------------------------------------------------------------------//
	//                                    Setup Express                                     //
	// --------------------------------------------------------------------------------------//
	const app = express();

	app.get('/*', async (_req, res) => {
		try {
			const query = Parse.Query.or(
				new Parse.Query(className.AWESOME_LINK).doesNotExist('deleted'),
				new Parse.Query(className.AWESOME_LINK).equalTo('deleted', false),
			);

			const totalCount = await query.count(USE_MASTER_KEY);

			if (cursor > totalCount - 1) {
				cursor = 0;
			}

			const links = await query.skip(cursor).limit(1).find(USE_MASTER_KEY);

			const link = links[0];

			cursor += 1;

			linkServiceEmitter.emit('saveLinkMeta', { link: link.toJSON() });

			res.status(301).redirect(link.get('url'));
		} catch (error) {
			console.error(error);

			res.status(500).send('an error ocurred in our side');
		}
	});

	app.listen(PORT, () => {
		console.log('====================================');
		console.log(`app listening on port ${PORT}`);
		console.log('====================================');
	});
};

bootstrap();
// .catch(async (error) => {
// 	// Log the error to the console
// 	// eslint-disable-next-line no-console
// 	console.error(error);

// 	// Write the error to a file
// 	const logMessage = `${new Date().toISOString()}: ${error.stack}\n`;

// 	try {
// 		// Check if the file exists
// 		await fs.access('error.log');

// 		// File exists, append the log
// 		await fs.appendFile('error.log', logMessage);
// 	} catch (err) {
// 		// File does not exist, create it and write the log
// 		await fs.writeFile('error.log', logMessage);
// 	}

// 	process.exit(1);
// });
