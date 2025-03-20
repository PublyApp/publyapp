import Parse from 'parse/node.js';

import { APP_ID } from '@/shared/lib/constants';

import { PARSE_SERVER_URL } from '../constants';
import { env } from '../env';

Parse.initialize(APP_ID, undefined, env.PARSE_MASTER_KEY);
Parse.masterKey = env.PARSE_MASTER_KEY;
Parse.serverURL = PARSE_SERVER_URL.toString();

global.Parse = Parse;
