import _Parse from 'parse';
import _ParseNode from 'parse/node';

import { checkIsServer } from '@devist/shared/utils/env.utils';

const initParseSSR = (serverURL: string, applicationId: string, javascriptKey?: string) => {
	const isServer = checkIsServer();

	// if (!isServer) {
	// 	_Parse.initialize(applicationId, javascriptKey, 'local-master-key');
	// 	_Parse.serverURL = serverURL;

	// 	if (!window.Parse) {
	// 		window.Parse = _Parse;
	// 	}
	// } else {
	// 	_ParseNode.initialize(applicationId, javascriptKey, 'local-master-key');
	// 	_ParseNode.serverURL = serverURL;

	// 	if (!global.Parse) {
	// 		global.Parse = _ParseNode;
	// 	}
	// }

	// ---- code copied from parse-react/ssr -------------------------------------------------
	if (!isServer) {
		window.Parse = _Parse;
	} else {
		global.Parse = _ParseNode;
	}

	Parse.initialize(applicationId, javascriptKey, 'local-master-key');

	if (!isServer) {
		Parse.enableLocalDatastore();
	}
	// ---- end of code copied from parse-react/ssr -------------------------------------------------

	Parse.serverURL = serverURL;
};

export const initParse = () => {
	initParseSSR('http://localhost:6180/parse', 'devist', undefined);
};

/**
 * You basically don't need this method once initParse has been called in your app's entrypoint
 * Parse is available as a global namespace
 */
export const getParse = (): typeof Parse => {
	const isServer = typeof window === 'undefined';

	if (!isServer) {
		return _Parse;
	}

	return _ParseNode;
};
