import _Parse from 'parse';
import _ParseNode from 'parse/node';

export const initParseSSR = (serverURL: string, applicationId: string, javascriptKey?: string, masterKey?: string) => {
	const isServer = typeof window === 'undefined';

	// ---- code copied from parse-react/ssr -------------------------------------------------
	if (/* (process as any).browser */ !isServer) {
		// eslint-disable-next-line global-require
		// global.Parse = require('parse');
		// eslint-disable-next-line global-require
		// window.Parse = require('parse');
		window.Parse = _Parse;
	} else {
		// eslint-disable-next-line global-require
		// global.Parse = require('parse/node');
		global.Parse = _ParseNode;
	}

	Parse.initialize(applicationId, javascriptKey, masterKey);

	if (!isServer) {
		Parse.enableLocalDatastore();
	}
	// ---- end of code copied from parse-react/ssr -------------------------------------------------

	Parse.serverURL = serverURL;
};

export const initParse = () => {
	// const isServer = typeof window === 'undefined';
	initParseSSR('http://localhost:6180/parse', 'devist', undefined, /* isServer ? 'local-master-key' : */ undefined);
};

/**
 * You basically don't need this method once initParse has been called in your app's entrypoint
 * Parse is available as a global namespace
 */
export const getParse = (): typeof Parse => {
	const isServer = typeof window === 'undefined';

	if (/* (process as any).browser */ !isServer) {
		// eslint-disable-next-line global-require
		// global.Parse = require('parse');
		// eslint-disable-next-line global-require
		// window.Parse = require('parse');
		return _Parse;
	}

	// eslint-disable-next-line global-require
	// global.Parse = require('parse/node');
	return _ParseNode;
};
