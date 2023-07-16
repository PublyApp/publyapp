// --------------------------------------------------------------------------------------//
//                           code copied from parse-react/ssr                           //
// --------------------------------------------------------------------------------------//
const isServer = typeof window === 'undefined';

if ((process as any).browser) {
	// eslint-disable-next-line global-require
	global.Parse = require('parse');
} else {
	// eslint-disable-next-line global-require
	global.Parse = require('parse/node');
}

export const initializeParse = (serverURL: string, applicationId: string, javascriptKey: string) => {
	Parse.serverURL = serverURL;
	Parse.initialize(applicationId, javascriptKey);

	if (!isServer) {
		Parse.enableLocalDatastore();
	}
};
