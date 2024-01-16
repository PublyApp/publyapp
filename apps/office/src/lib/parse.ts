import Parse from 'parse';

import { env } from './env';

export const initParse = () => {
	const hasInitializedParse = typeof window.Parse !== 'undefined';

	if (!hasInitializedParse) {
		Parse.initialize(env.PARSE_APP_ID);
		Parse.serverURL = env.PARSE_SERVER_URL;

		window.Parse = Parse;
	}
};
