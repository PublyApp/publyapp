export const defineGlobalParse = () => {
	const isServer = typeof window !== 'undefined';

	if (isServer) {
		// eslint-disable-next-line global-require
		global.Parse = require('parse/node');
	} else {
		// eslint-disable-next-line global-require
		window.Parse = require('parse');
	}
};
