/* eslint-disable @typescript-eslint/no-use-before-define */
import logger from './lib/logger';

export const cloud = async () => {
	try {
		await Promise.all([functions(), triggers(), jobs()]);
	} catch (error) {
		logger.error('Error while importing cloud code:', error);
		process.exit(1);
	}
};

const functions = async () => {
	await Promise.all([
		import('@/server/resources/appFile/appFile.functions'),
		import('@/server/resources/post/post.functions'),
		import('@/server/resources/user/user.functions'),
		// 	import('../resources/aiTool/aiTool.functions'),
		// import('../resources/webHost/webHost.functions'),
	]);
};

const triggers = async () => {
	await Promise.all([
		import('@/server/resources/user/user.triggers'),
		// import('@/server/resources/post/post.triggers'),
		// import('@/server/resources/session/session.triggers'),
	]);
};

const jobs = async () => {
	await Promise.all([import('@/server/resources/post/post.jobs')]);
};
