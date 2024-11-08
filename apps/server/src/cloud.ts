import logger from './lib/logger';

const functions = async () => {
	await Promise.all([
		// =================
		import('@/server/modules/blog/blog.functions'),
		import('@/server/modules/file-manager/appFile/appFile.functions'),
		import('@/server/modules/auth/auth.functions'),
		// import('../resources/aiTool/aiTool.functions'),
		// import('../resources/webHost/webHost.functions'),
	]);
};

const triggers = async () => {
	await Promise.all([
		// =================
		import('@/server/modules/auth/auth.triggers'),
	]);
};

const jobs = async () => {
	await Promise.all([
		// =================
		import('@/server/modules/blog/blog.jobs'),
	]);
};

export const cloud = async () => {
	try {
		await Promise.all([functions(), triggers(), jobs()]);
	} catch (error) {
		logger.error('Error while importing cloud code:', error);
		process.exit(1);
	}
};
