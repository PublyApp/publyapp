/* eslint-disable @typescript-eslint/no-use-before-define */
import logger from './lib/logger';

export const cloud = async () => {
	try {
		await Promise.all([functions(), triggers()]);
	} catch (error) {
		logger.error('Error while importing cloud code:');
		logger.error(error);

		// eslint-disable-next-line no-console
		console.trace(error);
	}
};

const functions = async () => {
	await Promise.all([
		import('./resources/appFile/appFile.functions'),
		import('./resources/post/post.functions'),
		import('./resources/user/user.functions'),
		// 	import('../resources/aiTool/aiTool.functions'),
		// import('../resources/webHost/webHost.functions'),
	]);
};

const triggers = async () => {
	await Promise.all([
		import('@/server/resources/user/user.triggers'),
		import('@/server/resources/awesomeLink/awesomeLink.triggers'),
		// import('@/server/resources/post/post.triggers'),
		// import('@/server/resources/session/session.triggers'),
	]);
};
