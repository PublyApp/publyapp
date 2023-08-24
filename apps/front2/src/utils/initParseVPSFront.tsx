export const initParseVPS = (serverURL: string, applicationId: string, javascriptKey?: string, masterKey?: string) => {
	const isServer = typeof window === 'undefined';

	// ---- code copied from parse-react/ssr -------------------------------------------------
	if (/* (process as any).browser */ !isServer) {
		// window.Parse = require('parse');
		// import('parse').then((module) => {
		// 	window.Parse = module;
		// });
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

export const initParseVPSFront = () => {
	const isServer = typeof window === 'undefined';
	initParseVPS('http://localhost:6180/parse', 'aktiveo', undefined, isServer ? 'local-master-key' : undefined);
};
