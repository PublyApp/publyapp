import path from 'path';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import Parse from 'parse/node';

import { run, RunConfig } from './main.seeder';

const envConfig = dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') }); // ! warning only for local
dotenvExpand.expand(envConfig);

const PORT = Number(process.env.PORT) || 1337;
const APP_ID = 'aktiveo';
const MASTER_KEY = process.env.MASTER_KEY || 'local-master-key';
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

Parse.initialize(APP_ID, '', MASTER_KEY);
Parse.serverURL = `${SERVER_URL}/parse`;

const runConfig: RunConfig = {
	usersNum: 0,
	// postsNum: 17,
	// reactionsNum: 100,
	aiToolsNum: 100,
};

run(runConfig).catch(async (reason: any) => {
	console.error(reason);
	process.exit(1);
});
