import Parse from 'parse/node.js';

import { env } from '../env';

Parse.initialize(env.PARSE_APP_ID, undefined, env.PARSE_MASTER_KEY);
Parse.masterKey = env.PARSE_MASTER_KEY;
Parse.serverURL = env.PARSE_SERVER_URL;

global.Parse = Parse;
