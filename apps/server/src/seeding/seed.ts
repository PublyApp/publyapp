/* eslint-disable no-console */
import path from 'path';

import Parse from 'parse/node';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

import { run, type RunConfig } from './main.seeder';

const envConfig = dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') }); // ! warning only for local
dotenvExpand.expand(envConfig);

const PORT = Number(process.env.PORT) || 1337;
const APP_ID = process.env.APP_ID || 'devist';
const MASTER_KEY = process.env.MASTER_KEY || 'local-master-key';
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

// console.log('====================================');
// console.log(SERVER_URL);
// console.log('====================================');
// process.exit(1);

// (global as any).MASTER_KEY = MASTER_KEY;

Parse.initialize(APP_ID, undefined, MASTER_KEY);
Parse.masterKey = MASTER_KEY;
Parse.serverURL = `${SERVER_URL}/parse`;

global.Parse = Parse;

const runConfig: RunConfig = {
	// masterKey: MASTER_KEY,
	// appId: APP_ID,
	// serverURL: SERVER_URL,
	// =========================
	usersNum: 0,
	// postsNum: 17,
	// reactionsNum: 100,
	aiToolsNum: 0,
	webHostsNum: 100,
};

run(runConfig).catch(async (reason: any) => {
	console.error(reason);
	process.exit(1);
});
