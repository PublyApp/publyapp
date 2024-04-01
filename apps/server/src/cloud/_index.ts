// import './functions';
// import './triggers';
// import Parse from 'parse/node.js';

import logger from '../lib/logger';

export const cloud = async () => {
	try {
		await Promise.all([import('./functions'), import('./triggers')]);
	} catch (error) {
		logger.error('Error while importing cloud code:');
		// logger.error(error);

		// eslint-disable-next-line no-console
		console.trace(error);
	}
};
