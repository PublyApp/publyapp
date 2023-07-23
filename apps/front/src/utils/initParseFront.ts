export const initParseNext = (serverURL: string, applicationId: string, javascriptKey?: string, masterKey?: string) => {
	const isServer = typeof window === 'undefined';

	// ---- code copied from parse-react/ssr -------------------------------------------------
	if (/* (process as any).browser */ !isServer) {
		// eslint-disable-next-line global-require
		global.Parse = require('parse');
		// eslint-disable-next-line global-require
		// window.Parse = require('parse');
	} else {
		// eslint-disable-next-line global-require
		global.Parse = require('parse/node');
	}

	Parse.initialize(applicationId, javascriptKey, masterKey);

	if (!isServer) {
		Parse.enableLocalDatastore();
	}
	// ---- end of code copied from parse-react/ssr -------------------------------------------------

	Parse.serverURL = serverURL;
};

export const initParseFront = () => {
	initParseNext('http://localhost:6180/parse', 'aktiveo');
};
